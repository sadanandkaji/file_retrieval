export type AiChunk = {
  section_title: string;
  page_number: number;
  content: string;
};

export type ChunkRelation = {
  from_section: string;
  to_section: string;
  relation_type: "references" | "exception_of" | "prerequisite_for" | "elaborates_on";
  note?: string;
};

const CHUNK_SYSTEM_PROMPT = `You are a document structuring tool. You will be shown page images of a PDF, one page (or two consecutive pages) at a time. Read each page the way a human would: follow the actual VISUAL reading order (columns, sidebars, callout boxes, tables) — not left-to-right/top-to-bottom raw coordinates.

Your job: split the page's content into clean, well-formed policy sections.

Rules:
- Do NOT summarize, paraphrase, or rewrite the substance. Reproduce the actual wording, reorganized only enough to fix line-wrap breaks.
- Do NOT invent or infer content that isn't visible on the page.
- Every piece of visible body text must end up in exactly one chunk. Nothing may be dropped silently.
- A heading only starts a new chunk if the content directly under/beside it VISUALLY belongs to it (shared box, shared border, clear indentation/grouping). Do not pair a heading with a bullet list just because they happen to sit at a similar height if they are clearly in different visual blocks (e.g. a sidebar list vs. a body paragraph column).
- If a single heading visually covers multiple sub-topics, split it into multiple chunks with descriptive constructed titles (e.g. "Guidelines - Voice Only Mobile Phone Reimbursement" instead of one giant "Guidelines" chunk).
- If a fragment's original context is unclear, include it as-is rather than guessing the missing words.
- Record the page number the chunk's content is primarily from.

Output ONLY valid JSON, no markdown fences, no commentary, in this exact shape:
{"chunks": [{"section_title": "string", "page_number": number, "content": "string"}]}`;

const RELATION_SYSTEM_PROMPT = `You will be given a numbered list of policy section chunks (title + content). Identify meaningful relationships between them — explicit cross-references ("see X"), exceptions ("X unless Y"), prerequisites ("requires approval described in X"), or one chunk elaborating on a topic introduced in another.

Only report a relationship if it is clearly supported by the text. Do not invent connections just because two sections share a keyword.

Output ONLY valid JSON, no markdown fences, no commentary:
{"relations": [{"from_section": "string", "to_section": "string", "relation_type": "references|exception_of|prerequisite_for|elaborates_on", "note": "string"}]}`;

async function callModel(apiKey: string, model: string, messages: any[]): Promise<string> {
  const res = await fetch("https://api.aicredits.in/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, temperature: 0 }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Model call failed: ${res.status} ${JSON.stringify(json)}`);
  }
  const raw: string = json.choices?.[0]?.message?.content ?? "";
  return raw.replace(/^```json\s*|```$/g, "").trim();
}

/**
 * Chunk a PDF page-by-page using a vision-capable model so layout
 * (columns, sidebars, tables, infographics) is read the way a human
 * would, instead of depending on brittle text-extraction reading order.
 *
 * This is what generalizes across "any type of PDF": a linear report,
 * a two-column form, and an infographic-style template all get read
 * correctly because the model is looking at pixels and visual grouping,
 * not reconstructed coordinates.
 */
export async function aiChunkDocumentFromImages(
  pages: { pageNumber: number; base64Png: string }[],
  apiKey: string,
  model = "google/gemini-2.0-flash"
): Promise<AiChunk[]> {
  const allChunks: AiChunk[] = [];

  for (let i = 0; i < pages.length; i++) {
    // Include the previous page as context (not for re-chunking) so a
    // heading that starts on page N and continues onto page N+1 doesn't
    // get force-split at the page boundary.
    const windowPages = i > 0 ? [pages[i - 1], pages[i]] : [pages[i]];

    const content: any[] = [
      {
        type: "text",
        text: `Only output NEW chunks for page ${pages[i].pageNumber} (the last image shown). ${
          i > 0 ? `The page before it (page ${pages[i - 1].pageNumber}) is shown only for context, to catch content that continues across the page break — do not re-emit its chunks.` : ""
        }`,
      },
    ];
    for (const p of windowPages) {
      content.push({
        type: "image_url",
        image_url: { url: `data:image/png;base64,${p.base64Png}` },
      });
    }

    const cleaned = await callModel(apiKey, model, [
      { role: "system", content: CHUNK_SYSTEM_PROMPT },
      { role: "user", content },
    ]);

    let parsed: { chunks: AiChunk[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(
        `AI chunker returned invalid JSON for page ${pages[i].pageNumber}: ${cleaned.slice(0, 300)}`
      );
    }

    if (Array.isArray(parsed.chunks)) {
      allChunks.push(...parsed.chunks.filter((c) => c.content?.trim().length > 0));
    }
  }

  if (allChunks.length === 0) {
    throw new Error("AI chunker returned no chunks");
  }

  return dedupeChunks(allChunks);
}

/**
 * Guards against the exact failure you saw: the same section_title
 * reappearing multiple times paired with unrelated content. We only
 * collapse TRUE duplicates (identical title AND identical content) —
 * a heading legitimately repeating across distinct sub-sections is left
 * alone, since splitting one heading into several chunks is expected
 * behavior per the prompt, not a bug.
 */
function dedupeChunks(chunks: AiChunk[]): AiChunk[] {
  const seen = new Set<string>();
  const result: AiChunk[] = [];
  for (const chunk of chunks) {
    const key = `${chunk.section_title.trim().toLowerCase()}::${chunk.content.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(chunk);
  }
  return result;
}

/**
 * Second pass over the finished chunk set: find explicit cross-references
 * so retrieval can pull in a linked chunk even when a query only matches
 * one side of the relationship (e.g. a question about "visa fees" also
 * surfaces the "Non-Reimbursable Expenses" chunk that excludes them).
 *
 * This is enrichment, not critical path — failures here should not fail
 * the whole ingest.
 */
export async function extractChunkRelations(
  chunks: AiChunk[],
  apiKey: string,
  model = "google/gemini-2.0-flash"
): Promise<ChunkRelation[]> {
  const summary = chunks
    .map((c, i) => `[${i}] (page ${c.page_number}) ${c.section_title}\n${c.content}`)
    .join("\n\n---\n\n");

  try {
    const cleaned = await callModel(apiKey, model, [
      { role: "system", content: RELATION_SYSTEM_PROMPT },
      { role: "user", content: summary },
    ]);
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed.relations) ? parsed.relations : [];
  } catch (err) {
    console.error("Relation extraction failed (non-fatal):", err);
    return [];
  }
}