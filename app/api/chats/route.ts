//chats/route.ts
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const chats = await prisma.chatSession.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, createdAt: true },
  });

  return Response.json({ chats });
}

export async function POST() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const chat = await prisma.chatSession.create({
    data: {
      userId: session.sub,
      title: "New chat",
    },
  });

  return Response.json({ id: chat.id, title: chat.title, createdAt: chat.createdAt });
}