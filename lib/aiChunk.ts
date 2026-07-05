export type AiChunk = {
  section_title: string;
  page_number: number;
  content: string;
};

const SYSTEM_PROMPT = `You are a document structuring tool. You will receive raw text extracted from a policy PDF, page by page (marked "--- PAGE N ---"). Table-style layouts use " || " to separate what were originally different table columns (e.g. a label column and a content column) — treat text before " || " on a line as a label/heading candidate, and text after it as that section's content.

Your job: split this text into clean, well-formed policy sections.

Rules:
- Do NOT summarize, paraphrase, or rewrite the substance. Reproduce the actual wording, just reorganized and with obvious extraction artifacts fixed (stray " || " markers removed, line breaks within a sentence joined, duplicated whitespace collapsed).
- Do NOT invent or infer any content that isn't present in the text.
- Every sentence in the input must end up in exactly one output chunk. Nothing may be dropped silently.
- Group content under the section heading it visually/logically belongs to. Headings are short label-like lines (e.g. "Objective", "Applicability", "Scope", "Guidelines", "Security", "Annexure").
- If a single heading covers a long section with multiple sub-topics (e.g. "Guidelines" covering Voice, Data Card, Smartphone, Security), split it into multiple chunks with descriptive section titles you construct from context (e.g. "Guidelines - Voice Only Mobile Phone Reimbursement", "Guidelines - Security"), rather than dumping it all under one giant "Guidelines" chunk.
- If you cannot confidently reconstruct a fragment's original sentence (e.g. text is clearly missing its start because of extraction loss), include it as-is rather than guessing the missing words.
- Track the page number each chunk's content primarily comes from.

Output ONLY valid JSON, no markdown fences, no commentary, in this exact shape:
{"chunks": [{"section_title": "string", "page_number": number, "content": "string"}]}`;

export async function aiChunkDocument(
  fullText: string,
  apiKey: string
): Promise<AiChunk[]> {
  const res = await fetch("https://api.aicredits.in/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: fullText },
      ],
      temperature: 0,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`AI chunking failed: ${res.status} ${JSON.stringify(json)}`);
  }

  const raw: string = json.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.replace(/^```json\s*|```$/g, "").trim();

  let parsed: { chunks: AiChunk[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI chunker returned invalid JSON: ${cleaned.slice(0, 300)}`);
  }

  if (!Array.isArray(parsed.chunks) || parsed.chunks.length === 0) {
    throw new Error("AI chunker returned no chunks");
  }

  return parsed.chunks.filter((c) => c.content && c.content.trim().length > 0);
}