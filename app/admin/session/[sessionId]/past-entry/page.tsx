import { redirect } from "next/navigation";
import { auth } from "@/auth";
import PastEntryClient from "./PastEntryClient";

export default async function PastEntryPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { sessionId } = await params;
  return (
    <main className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">บันทึกเช็คชื่อย้อนหลัง</h1>
      <PastEntryClient sessionId={sessionId} />
    </main>
  );
}
