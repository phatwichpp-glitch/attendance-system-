import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import AdminNav from "@/components/AdminNav";
import SetupClient from "./SetupClient";
import Spinner from "@/components/Spinner";

export default async function SetupPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <AdminNav email={session.user?.email ?? ""} />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6">เปิดคาบเรียน</h1>
        <Suspense fallback={<div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-[#185FA5]" /></div>}>
          <SetupClient />
        </Suspense>
      </main>
    </div>
  );
}
