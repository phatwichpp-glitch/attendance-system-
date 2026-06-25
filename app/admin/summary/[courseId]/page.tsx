import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminNav from "@/components/AdminNav";
import SummaryClient from "./SummaryClient";

export default async function SummaryPage({ params }: { params: { courseId: string } }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <AdminNav email={session.user?.email ?? ""} />
      <main className="max-w-full px-4 py-6">
        <SummaryClient courseId={params.courseId} />
      </main>
    </div>
  );
}
