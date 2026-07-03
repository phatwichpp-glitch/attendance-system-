import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminNav from "@/components/AdminNav";
import StudentsClient from "./StudentsClient";

export default async function StudentsPage({
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
      <main className="max-w-5xl mx-auto px-4 py-8">
        <StudentsClient courseId={courseId} section={section} />
      </main>
    </div>
  );
}
