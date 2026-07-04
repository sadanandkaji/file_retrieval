import { prisma } from "@/lib/prisma";
import { getB2DownloadUrl } from "@/lib/b2";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return Response.json({ error: "Document not found" }, { status: 404 });

  const signedUrl = await getB2DownloadUrl(doc.cloudinaryPublicId, doc.name);

  return Response.redirect(signedUrl, 302);
}