import { prisma } from "@/lib/prisma";
import { getB2DownloadUrl, deleteFromB2 } from "@/lib/b2";
import { getSession } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return Response.json({ error: "Document not found" }, { status: 404 });

  const signedUrl = await getB2DownloadUrl(doc.cloudinaryPublicId, doc.name);

  return Response.redirect(signedUrl, 302);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  // Only the uploader or an admin can remove a document.
  if (session.role !== "ADMIN" && session.sub !== doc.uploadedById) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete the underlying file first. If this throws, we bail before
  // touching the DB row so we don't end up with an orphaned DB record
  // pointing at a file that's half-deleted.
  try {
    await deleteFromB2(doc.cloudinaryPublicId);
  } catch (err) {
    console.error(`Failed to delete B2 object for document ${id}:`, err);
    return Response.json({ error: "Failed to delete stored file" }, { status: 500 });
  }

  // PolicyChunk.document has onDelete: Cascade, so chunks are removed
  // automatically along with the document row.
  await prisma.document.delete({ where: { id } });

  return Response.json({ success: true });
}