import pdf from "pdf-parse/lib/pdf-parse.js";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma";
import { getSession } from "@/lib/auth";
import { uploadPdfToB2 } from "@/lib/b2";

// Splits on numbered section headings (e.g. "1. Purpose", "2. Corporate Card Usage")
// instead of relying on blank lines, which pdf-parse often strips out.
function chunkPolicyText(
  text: string
): { text: string; section: string; page: number }[] {
  const lines = text.split("\n").map((l) => l.trim());
  const headingRegex = /^(\d+(\.\d+)*)\.\s+(.{2,80})$/;

  const chunks: { text: string; section: string; page: number }[] = [];
  let currentSection = "General";
  let currentLines: string[] = [];

  function flush() {
    const content = currentLines.join(" ").replace(/\s+/g, " ").trim();
    if (content.length > 0) {
      chunks.push({ text: content, section: currentSection, page: 0 });
    }
    currentLines = [];
  }

  for (const line of lines) {
    if (!line) continue;
    const match = line.match(headingRegex);
    if (match) {
      flush();
      currentSection = line;
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (chunks.length <= 1) {
    const words = text.split(/\s+/).filter(Boolean);
    const fallbackChunks: { text: string; section: string; page: number }[] = [];
    const wordLimit = 350;
    for (let i = 0; i < words.length; i += wordLimit) {
      fallbackChunks.push({
        text: words.slice(i, i + wordLimit).join(" "),
        section: "General",
        page: 0,
      });
    }
    return fallbackChunks;
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

  // 2. Extract + chunk the text.
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

  // 3. Remove any previous document/chunks with the same name, then create fresh records.
  const existingDoc = await prisma.document.findFirst({ where: { name: file.name } });
  if (existingDoc) {
    await prisma.document.delete({ where: { id: existingDoc.id } });
  }

  const document = await prisma.document.create({
    data: {
      name: file.name,
      cloudinaryUrl: b2Result.url, // now holds the B2 file URL
      cloudinaryPublicId: b2Result.key, // now holds the B2 object key
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
          input: chunk.text,
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
          ${chunk.section},
          ${chunk.page},
          ${chunk.text},
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