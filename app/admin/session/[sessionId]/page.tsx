import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminNav from "@/components/AdminNav";
import SessionClient from "./SessionClient";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { sessionId } = await params;

  return (
    <div className="min-h-screen">
      <AdminNav email={session.user?.email} />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <SessionClient sessionId={sessionId} />
      </main>
    </div>
  );
}
