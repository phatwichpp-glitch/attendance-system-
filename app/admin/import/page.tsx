import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminNav from "@/components/AdminNav";
import ImportClient from "./ImportClient";

export default async function ImportPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <AdminNav email={session.user?.email} />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6">
          นำเข้ารายชื่อนักศึกษา
        </h1>
        <ImportClient />
      </main>
    </div>
  );
}
