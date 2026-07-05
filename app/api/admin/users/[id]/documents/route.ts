// admin/users/[id]/documents/route.ts

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: fromUserId } = await params;

  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (session.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { toUserId } = await req.json();

  if (!toUserId || typeof toUserId !== "string") {
    return Response.json({ error: "toUserId is required" }, { status: 400 });
  }

  if (toUserId === fromUserId) {
    return Response.json({ error: "Choose a different user to transfer to" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({ where: { id: toUserId } });
  if (!targetUser) {
    return Response.json({ error: "Target user not found" }, { status: 404 });
  }

  const result = await prisma.document.updateMany({
    where: { uploadedById: fromUserId },
    data: { uploadedById: toUserId },
  });

  return Response.json({ status: "transferred", count: result.count, toUserId });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (session.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const documents = await prisma.document.findMany({
    where: { uploadedById: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, chunkCount: true, status: true, createdAt: true },
  });

  return Response.json({ documents });
}