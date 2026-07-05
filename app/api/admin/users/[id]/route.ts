//admin/users/[id]/route.ts
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.sub === id) {
    return Response.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return Response.json(
        { error: "At least one admin must remain. Promote another user to admin before removing this one." },
        { status: 400 }
      );
    }
  }

  // Chat sessions (and their messages) cascade-delete automatically via the
  // schema's onDelete: Cascade — nothing special needed for those here.
  // Documents are intentionally NOT cascaded: if any remain, Postgres will
  // reject the delete below and we surface it as a clear 409 instead of a
  // silent orphan or a crash.
  try {
    await prisma.user.delete({ where: { id } });
  } catch (err: unknown) {
    const cause = err as { code?: string; cause?: { code?: string; message?: string }; message?: string };
    const rawCode = cause?.cause?.code ?? cause?.code;
    const rawMessage = cause?.cause?.message ?? cause?.message ?? "";

    const isForeignKeyViolation =
      rawCode === "23001" || // Postgres RESTRICT violation
      rawCode === "23503" || // Postgres FOREIGN KEY violation
      rawCode === "P2003" || // Prisma's own FK error code
      rawMessage.toLowerCase().includes("foreign key") ||
      rawMessage.toLowerCase().includes("restrict");

    if (isForeignKeyViolation) {
      return Response.json(
        {
          error:
            "This user still has uploaded documents. Transfer them to another user first, then remove the account.",
          reason: "has_documents",
        },
        { status: 409 }
      );
    }

    console.error(`Failed to delete user ${id}:`, err);
    return Response.json({ error: "Failed to delete user" }, { status: 500 });
  }

  return Response.json({ status: "deleted" });
}