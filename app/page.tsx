import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import PolicyChatClient from "./component/PolicyChatClient";

export default async function Home() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <PolicyChatClient
      initialUser={{
        id: session.sub,
        name: session.name,
        email: session.email,
        role: session.role,
      }}
    />
  );
}