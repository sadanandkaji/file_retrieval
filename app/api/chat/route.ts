// chat/route.ts
import { prisma } from "@/lib/prisma";
import { Prisma } from "../../../lib/generated/prisma";
import { getSession } from "@/lib/auth";

type PolicyChunkResult = {
  content: string;
  document_name: string;
  section_title: string;
  page_number: number;
};

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

  // 2. Retrieve top matching policy chunks.
  const results = (await prisma.$queryRaw`
    SELECT content, document_name, section_title, page_number
    FROM policy_chunks
    ORDER BY embedding <=> ${Prisma.raw(vectorLiteral)}
    LIMIT 12
  `) as PolicyChunkResult[];

  if (results.length === 0) {
    return Response.json(
      {
        error:
          "No policy data found in the database. Upload a PDF through /uploads first.",
      },
      { status: 400 }
    );
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