import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminNav from "@/components/AdminNav";
import CourseList from "./CourseList";

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <AdminNav email={session.user?.email} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">รายวิชาของฉัน</h1>
        </div>
        <CourseList />
      </main>
    </div>
  );
}
