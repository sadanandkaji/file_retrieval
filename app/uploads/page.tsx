import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import UploadsClient from "../component/UploadsClient";

export default async function UploadsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <UploadsClient
      initialUser={{
        id: session.sub,
        name: session.name,
        email: session.email,
        role: session.role,
      }}
    />
  );
}