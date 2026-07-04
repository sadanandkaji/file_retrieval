// app/api/ingest/route.ts
import pdf from "pdf-parse/lib/pdf-parse.js";
import { prisma } from "@/lib/prisma";
import { Prisma } from "../../../lib/generated/prisma";

// Simple chunker — splits by paragraphs/sections, groups into ~300-500 word chunks
function chunkPolicyText(
  text: string
): { text: string; section: string; page: number }[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: { text: string; section: string; page: number }[] = [];
  let currentChunk = "";
  let currentSection = "General";
  const wordLimit = 400;

  for (const para of paragraphs) {
    const isHeading = /^([0-9]+\.)+\s|^[A-Z\s]{5,60}$/.test(para.slice(0, 60));
    if (isHeading) {
      currentSection = para.slice(0, 80);
    }

    const combined = currentChunk ? `${currentChunk}\n\n${para}` : para;

    if (combined.split(/\s+/).length > wordLimit && currentChunk) {
      chunks.push({ text: currentChunk, section: currentSection, page: 0 });
      currentChunk = para;
    } else {
      currentChunk = combined;
    }
  }

  if (currentChunk) {
    chunks.push({ text: currentChunk, section: currentSection, page: 0 });
  }

  return chunks;
}

export async function POST(req: Request) {
  if (!process.env.AICREDITS_KEY) {
    return Response.json(
      { error: "AICREDITS_KEY is not set. Check your .env file and restart the dev server." },
      { status: 500 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return Response.json({ error: "No file uploaded" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const data = await pdf(buffer);

  const chunks = chunkPolicyText(data.text).filter(
    (c) => c.text && c.text.trim().length > 0
  );

  if (chunks.length === 0) {
    return Response.json(
      { error: "No extractable text found in this PDF." },
      { status: 400 }
    );
  }

  let insertedCount = 0;

  for (const chunk of chunks) {
    const embedRes = await fetch("https://api.aicredits.in/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AICREDITS_KEY}`,
        "Content-Type": "application/json",
      },
 body: JSON.stringify({
  model: "text-embedding-3-small",   // no "openai/" prefix
  input: chunk.text,
}),
    });

    const embedJson = await embedRes.json();

    if (!embedRes.ok || !embedJson?.data?.[0]?.embedding) {
      console.error(
        "Embeddings API error:",
        embedRes.status,
        JSON.stringify(embedJson)
      );
      return Response.json(
        {
          error: "Embeddings request failed",
          status: embedRes.status,
          details: embedJson,
        },
        { status: 500 }
      );
    }

    const embedding = embedJson.data[0].embedding;
    const vectorLiteral = `'${JSON.stringify(embedding)}'::vector`;

    await prisma.$executeRaw`
      INSERT INTO policy_chunks (document_name, section_title, page_number, content, embedding)
      VALUES (
        ${file.name},
        ${chunk.section},
        ${chunk.page},
        ${chunk.text},
        ${Prisma.raw(vectorLiteral)}
      )
    `;

    insertedCount++;
  }

  return Response.json({ status: "ingested", chunks: insertedCount });
}