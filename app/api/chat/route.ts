// chat/route.ts
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma";
import { getSession } from "@/lib/auth";

type PolicyChunkResult = {
  content: string;
  document_name: string;
  section_title: string;
  page_number: number;
};

// Detects short greetings/small-talk so we can answer them directly instead
// of running them through embedding search + the model — those messages
// carry no policy question, and forcing them through retrieval either wastes
// an API call or produces an awkward "I don't see that covered" reply.
// Deliberately conservative: only matches when the WHOLE trimmed message is
// small talk, so "hi, what's the notice period" still goes through normal
// retrieval instead of getting short-circuited.
function matchGreeting(question: string): string | null {
  const q = question.trim().toLowerCase().replace(/[!.?]+$/g, "");

  if (/^(hi+|hello+|hey+|yo|sup|howdy|greetings)$/.test(q)) {
    return "Hello! I'm here to help you find answers in your company's uploaded policies. What would you like to know?";
  }

  if (/^good\s?(morning|afternoon|evening|night)$/.test(q)) {
    return "Hello! What can I help you find in the policies?";
  }

  if (/^(how are you|how's it going|how are things|what's up|whats up)$/.test(q)) {
    return "I'm doing well, thanks for asking! What would you like to know about your company's policies?";
  }

  if (/^(thanks|thank you|thankyou|ty|cheers)$/.test(q)) {
    return "You're welcome! Let me know if there's anything else about policy you'd like to check.";
  }

  if (/^(bye|goodbye|see you|see ya|later)$/.test(q)) {
    return "Goodbye! Come back anytime you have a policy question.";
  }

  return null;
}

// Wraps a canned reply in the same SSE shape the real completion stream
// sends, so the frontend's existing parsing/streaming logic handles it
// identically to a normal model answer — no special-casing on the client.
function fakeAssistantStream(message: string) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const chunk = { choices: [{ delta: { content: message } }] };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    },
  });
}

export async function POST(req: Request) {
  if (!process.env.AICREDITS_KEY) {
    return Response.json(
      { error: "AICREDITS_KEY is not set. Check your .env file and restart the dev server." },
      { status: 500 }
    );
  }

  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const { question, chatSessionId } = await req.json();

  if (!question || typeof question !== "string" || !question.trim()) {
    return Response.json({ error: "No question provided" }, { status: 400 });
  }

  // Reuse an existing chat session, or create a new one titled after the first question.
  let sessionRecord = chatSessionId
    ? await prisma.chatSession.findUnique({ where: { id: chatSessionId } })
    : null;

  if (!sessionRecord) {
    sessionRecord = await prisma.chatSession.create({
      data: {
        userId: session.sub,
        title: question.slice(0, 60),
      },
    });
  }

  await prisma.message.create({
    data: { chatSessionId: sessionRecord.id, role: "user", content: question },
  });

  // Greeting / small talk — skip embeddings and the model entirely.
  const greetingReply = matchGreeting(question);
  if (greetingReply) {
    await prisma.message.create({
      data: {
        chatSessionId: sessionRecord.id,
        role: "assistant",
        content: greetingReply,
        citations: [] as unknown as Prisma.InputJsonValue,
      },
    });

    return new Response(fakeAssistantStream(greetingReply), {
      headers: {
        "Content-Type": "text/event-stream",
        "X-Chat-Session-Id": sessionRecord.id,
      },
    });
  }

  // 1. Embed the question
  const embedRes = await fetch("https://api.aicredits.in/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AICREDITS_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: question }),
  });

  const embedJson = await embedRes.json();

  if (!embedRes.ok || !embedJson?.data?.[0]?.embedding) {
    console.error("Embeddings API error:", embedRes.status, JSON.stringify(embedJson));
    return Response.json(
      { error: "Embeddings request failed", details: embedJson },
      { status: 500 }
    );
  }

  const embedding = embedJson.data[0].embedding;
  const vectorLiteral = `'${JSON.stringify(embedding)}'::vector`;

  // 2. Retrieve top matching policy chunks. Joined against `documents` and
  // filtered to READY so orphaned rows (deleted/replaced documents, stale
  // test data with a null document_id) can never be retrieved — without
  // this, garbage chunks from old uploads stay searchable forever and get
  // mixed into otherwise-correct answers.
  const results = (await prisma.$queryRaw`
    SELECT pc.content, pc.document_name, pc.section_title, pc.page_number
    FROM policy_chunks pc
    INNER JOIN documents d ON d.id = pc.document_id
    WHERE d.status = 'READY'
    ORDER BY pc.embedding <=> ${Prisma.raw(vectorLiteral)}
    LIMIT 12
  `) as PolicyChunkResult[];

  // No documents indexed at all — respond like a normal streamed assistant
  // message (and save it to history) instead of a raw JSON error, so the
  // frontend's existing SSE parsing handles it exactly like any other reply.
  if (results.length === 0) {
    const noDocsMessage =
      "There are no policy documents uploaded yet, so I don't have anything to answer from. Upload a policy PDF from the Uploads page, then ask me again.";

    await prisma.message.create({
      data: {
        chatSessionId: sessionRecord.id,
        role: "assistant",
        content: noDocsMessage,
        citations: [] as unknown as Prisma.InputJsonValue,
      },
    });

    return new Response(fakeAssistantStream(noDocsMessage), {
      headers: {
        "Content-Type": "text/event-stream",
        "X-Chat-Session-Id": sessionRecord.id,
      },
    });
  }

  const citations = results.map((r) => ({
    document: r.document_name,
    section: r.section_title,
    page: r.page_number,
  }));

  const context = results
    .map(
      (r) =>
        `[${r.document_name} - ${r.section_title}, p.${r.page_number}]\n${r.content}`
    )
    .join("\n\n");

  // 3. Ask the model, grounded strictly in retrieved chunks
  const chatRes = await fetch("https://api.aicredits.in/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AICREDITS_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash",
      stream: true,
      messages: [
        {
          role: "system",
          content: `You are a policy assistant answering employee questions about company policy.

Rules:
- If the question asks about one specific topic (e.g. "what's the notice period"), answer only that — don't pad it with unrelated sections.
- If the question asks for an overview, a full list, everything covered, or a summary — in any phrasing — walk through every section present in the excerpts below, briefly.
- Write in plain text only. Do not use asterisks, bold, bullet points, markdown headers, or any other markdown formatting. If listing multiple items, separate them with a line break and a dash, like "- Item one".
- Do not include source citations, section numbers, or file names in your answer text. Sources are handled separately by the application.
- If the excerpts don't contain the answer, say "I don't see that covered in the uploaded policies" — do not guess.

Policy excerpts:
${context}`,
        },
        { role: "user", content: question },
      ],
    }),
  });

  if (!chatRes.ok || !chatRes.body) {
    const errText = await chatRes.text();
    console.error("Chat completions error:", chatRes.status, errText);
    return Response.json({ error: "Chat request failed", details: errText }, { status: 500 });
  }

  // Tee the upstream SSE stream: forward it to the client untouched, while
  // a background reader accumulates the full text to persist once done.
  const [clientStream, saveStream] = chatRes.body.tee();

  (async () => {
    try {
      const reader = saveStream.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.replace("data: ", "").trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            accumulated += json.choices?.[0]?.delta?.content ?? "";
          } catch {
            // partial JSON chunk, skip
          }
        }
      }

      await prisma.message.create({
        data: {
          chatSessionId: sessionRecord!.id,
          role: "assistant",
          content: accumulated,
          citations: citations as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      console.error("Failed to persist assistant message:", err);
    }
  })();

  return new Response(clientStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "X-Chat-Session-Id": sessionRecord.id,
    },
  });
}