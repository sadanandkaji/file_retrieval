//api/documents/route.ts

import { prisma } from "@/lib/prisma";

export async function GET() {
  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true, email: true } } },
  });

  return Response.json({
    documents: documents.map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      chunkCount: d.chunkCount,
      cloudinaryUrl: d.cloudinaryUrl,
      uploadedBy: d.uploadedBy.name,
      createdAt: d.createdAt,
    })),
  });
}
