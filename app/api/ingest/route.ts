import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma";
import { getSession } from "@/lib/auth";
import { uploadPdfToB2 } from "@/lib/b2";
import { extractPdfWithLayout } from "@/lib/pdfExtract";
import { aiChunkDocument } from "@/lib/aiChunk";

export async function POST(req: Request) {
  if (!process.env.AICREDITS_KEY) {
    return Response.json(
      { error: "AICREDITS_KEY is not set. Check your .env file and restart the dev server." },
      { status: 500 }
    );
  }

  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return Response.json({ error: "No file uploaded" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // 1. Upload the raw PDF to Backblaze B2 so the original file is retrievable.
  let b2Result;
  try {
    b2Result = await uploadPdfToB2(buffer, file.name);
  } catch (err) {
    console.error("Backblaze B2 upload failed:", err);
    return Response.json({ error: "Backblaze B2 upload failed" }, { status: 500 });
  }

  // 2. Extract text with layout/position awareness (handles both linear
  // documents and table-style layouts, unlike flat pdf-parse text).
  let fullText: string;
  try {
    const extracted = await extractPdfWithLayout(buffer);
    fullText = extracted.fullText;
  } catch (err) {
    console.error("PDF extraction failed:", err);
    return Response.json({ error: "Failed to read PDF content" }, { status: 400 });
  }

  if (!fullText || !fullText.trim()) {
    return Response.json(
      { error: "No extractable text found in this PDF." },
      { status: 400 }
    );
  }

  // 3. Let the model structure the extracted text into sections/chunks,
  // instead of relying on brittle regex heading detection.
  let chunks;
  try {
    chunks = await aiChunkDocument(fullText, process.env.AICREDITS_KEY);
  } catch (err) {
    console.error("AI chunking failed:", err);
    return Response.json({ error: "Failed to structure PDF content" }, { status: 500 });
  }

  if (chunks.length === 0) {
    return Response.json(
      { error: "No usable content produced from this PDF." },
      { status: 400 }
    );
  }

  // 4. Remove any previous document/chunks with the same name, then create fresh records.
  const existingDoc = await prisma.document.findFirst({ where: { name: file.name } });
  if (existingDoc) {
    await prisma.document.delete({ where: { id: existingDoc.id } });
  }

  const document = await prisma.document.create({
    data: {
      name: file.name,
      cloudinaryUrl: b2Result.url,
      cloudinaryPublicId: b2Result.key,
      status: "UPLOADING",
      uploadedById: session.sub,
    },
  });

  let insertedCount = 0;

  try {
    for (const chunk of chunks) {
      const embedRes = await fetch("https://api.aicredits.in/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AICREDITS_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: chunk.content,
        }),
      });

      const embedJson = await embedRes.json();

      if (!embedRes.ok || !embedJson?.data?.[0]?.embedding) {
        console.error("Embeddings API error:", embedRes.status, JSON.stringify(embedJson));
        await prisma.document.update({ where: { id: document.id }, data: { status: "ERROR" } });
        return Response.json(
          { error: "Embeddings request failed", details: embedJson },
          { status: 500 }
        );
      }

      const embedding = embedJson.data[0].embedding;
      const vectorLiteral = `'${JSON.stringify(embedding)}'::vector`;

      await prisma.$executeRaw`
        INSERT INTO policy_chunks (document_id, document_name, section_title, page_number, content, embedding)
        VALUES (
          ${document.id},
          ${file.name},
          ${chunk.section_title},
          ${chunk.page_number},
          ${chunk.content},
          ${Prisma.raw(vectorLiteral)}
        )
      `;

      insertedCount++;
    }
  } catch (err) {
    console.error("Ingest failed mid-way:", err);
    await prisma.document.update({ where: { id: document.id }, data: { status: "ERROR" } });
    return Response.json({ error: "Ingest failed" }, { status: 500 });
  }

  await prisma.document.update({
    where: { id: document.id },
    data: { status: "READY", chunkCount: insertedCount },
  });

  return Response.json({
    status: "ingested",
    documentId: document.id,
    chunks: insertedCount,
    url: b2Result.url,
  });
}