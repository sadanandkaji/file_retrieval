import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { uploadPdfToB2 } from "@/lib/b2";
import { rasterizePdf } from "@/lib/Pdftoimages";
import { aiChunkDocumentFromImages, extractChunkRelations } from "@/lib/Aichunkvision";

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

  // 2. Rasterize pages to images instead of extracting positioned text.
  // This is the fix for template-dependent reading-order bugs: a vision
  // model reads sidebars/boxes/columns the way a human does, regardless
  // of whether the PDF is a linear report, a form, or an infographic.
  let pages;
  try {
    pages = await rasterizePdf(buffer);
 } catch (err) {
  console.error("PDF rasterization failed:", err);
  return Response.json(
    {
      error: "Failed to read PDF content",
      debug: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    },
    { status: 400 }
  );
}

  if (!pages || pages.length === 0) {
    return Response.json(
      { error: "No pages found in this PDF." },
      { status: 400 }
    );
  }

  // 3. Vision-based chunking, page by page.
  let chunks;
  try {
    chunks = await aiChunkDocumentFromImages(pages, process.env.AICREDITS_KEY);
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

  // 4. Second pass: find cross-references between chunks. Best-effort —
  // never blocks ingestion if it fails.
  const relations = await extractChunkRelations(chunks, process.env.AICREDITS_KEY);

  // 5. Remove any previous document/chunks with the same name, then create fresh records.
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
  // Track section_title -> inserted chunk id so we can resolve relation
  // edges (which refer to section titles) into real foreign keys.
  // PolicyChunk.id is BigInt in the schema, so this must be too.
  const titleToChunkId = new Map<string, bigint>();

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
      // A plain array literal — pg parses this as vector input once cast.
      // Safe to build as a string directly since it's numbers we generated,
      // not user-controlled text.
      const vectorLiteral = `[${embedding.join(",")}]`;

      // Using $queryRawUnsafe with positional params instead of the
      // Prisma.raw()-inside-a-tagged-template pattern: in Prisma 7's
      // driver-adapter mode (@prisma/adapter-pg), nested Prisma.raw() no
      // longer gets spliced into the SQL text — it gets serialized and
      // sent as a bound parameter value instead, which is what caused
      // "invalid input syntax for type vector" (Postgres was receiving
      // the JSON dump of the Sql object, not the vector text). Real
      // positional parameters avoid that entirely and are also the
      // actually-safe way to parameterize the user-controlled fields here
      // (document.id, section_title, content).
      const inserted = await prisma.$queryRawUnsafe<{ id: bigint }[]>(
        `INSERT INTO policy_chunks (document_id, document_name, section_title, page_number, content, embedding)
         VALUES ($1, $2, $3, $4, $5, $6::vector)
         RETURNING id`,
        document.id,
        file.name,
        chunk.section_title,
        chunk.page_number,
        chunk.content,
        vectorLiteral
      );

      titleToChunkId.set(chunk.section_title, inserted[0].id);
      insertedCount++;
    }

    // 6. Store resolved relations via the typed Prisma model. Skip any
    // edge whose title didn't match an inserted chunk (e.g. the model
    // referenced a title loosely).
    for (const rel of relations) {
      const fromId = titleToChunkId.get(rel.from_section);
      const toId = titleToChunkId.get(rel.to_section);
      if (!fromId || !toId || fromId === toId) continue;

      await prisma.policyChunkRelation.create({
        data: {
          documentId: document.id,
          fromChunkId: fromId,
          toChunkId: toId,
          relationType: rel.relation_type,
          note: rel.note ?? null,
        },
      });
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
    relations: relations.length,
    url: b2Result.url,
  });
}