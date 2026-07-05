// admin/users/route.ts
import { prisma } from "@/lib/prisma";
import { getSession, hashPassword } from "@/lib/auth";

export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  return Response.json({ users });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const { email, password, name, role } = await req.json();

  if (!email || !password || !name) {
    return Response.json({ error: "name, email, and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (existing) {
    return Response.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      role: role === "ADMIN" ? "ADMIN" : "USER",
      createdById: session.sub,
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return Response.json({ user }, { status: 201 });
}
