import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminNav from "@/components/AdminNav";
import AuditClient from "./AuditClient";

export default async function AuditPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return (
    <div className="min-h-screen">
      <AdminNav email={session.user?.email} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-[18px] font-medium text-gray-900 mb-6">Audit Log</h1>
        <AuditClient />
      </main>
    </div>
  );
}
