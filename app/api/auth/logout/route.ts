import { clearSessionCookie } from "@/lib/auth";

export async function POST() {
  await clearSessionCookie();
  return Response.json({ status: "logged_out" });
}
