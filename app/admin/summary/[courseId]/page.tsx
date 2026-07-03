import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminNav from "@/components/AdminNav";
import SummaryClient from "./SummaryClient";

export default async function SummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { courseId } = await params;
  const { section } = await searchParams;

  return (
    <div className="min-h-screen">
      <AdminNav email={session.user?.email} />
      <main className="px-4 py-6">
        <SummaryClient courseId={courseId} section={section} />
      </main>
    </div>
  );
}
