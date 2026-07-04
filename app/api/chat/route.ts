// app/api/chat/route.ts
import { prisma } from "@/lib/prisma";
import { Prisma } from "../../../lib/generated/prisma";

export async function POST(req: Request) {
  const { question } = await req.json();

  const embedRes = await fetch("https://api.aicredits.in/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.AICREDITS_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
    model: "text-embedding-3-small",
  input: question }),
  });
  const { data: [{ embedding }] } = await embedRes.json();
  const vectorLiteral = `'${JSON.stringify(embedding)}'::vector`;

 type PolicyChunkResult = {
  content: string;
  document_name: string;
  section_title: string;
  page_number: number;
};

const results = (await prisma.$queryRaw`
  SELECT content, document_name, section_title, page_number
  FROM policy_chunks
  ORDER BY embedding <=> ${Prisma.raw(vectorLiteral)}
  LIMIT 5
`) as PolicyChunkResult[];

  const context = results
    .map(r => `[${r.document_name} - ${r.section_title}, p.${r.page_number}]\n${r.content}`)
    .join("\n\n");

  const chatRes = await fetch("https://api.aicredits.in/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.AICREDITS_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4.6",
      stream: true,
      cache: true,
      messages: [
        {
          role: "system",
          content: `You are a policy assistant. Answer ONLY using the provided policy excerpts below. Always cite the section/page you used. If the answer isn't in the excerpts, say so clearly.\n\n${context}`,
        },
        { role: "user", content: question },
      ],
    }),
  });

  return new Response(chatRes.body, { headers: { "Content-Type": "text/event-stream" } });
}