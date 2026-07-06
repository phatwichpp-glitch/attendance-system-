import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminNav from "@/components/AdminNav";
import CourseList from "./CourseList";
import ActiveSessionBanner from "./ActiveSessionBanner";
import ManualQRCard from "./ManualQRCard";
import CoursesCalendar from "./CoursesCalendar";
import AutoOpenTokenBanner from "./AutoOpenTokenBanner";
import StorageHealthBanner from "./StorageHealthBanner";

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <AdminNav email={session.user?.email} />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <StorageHealthBanner />
        <AutoOpenTokenBanner />
        <ActiveSessionBanner />
        <div className="flex flex-col md:flex-row gap-4 items-start">
          {/* Main column: the teacher's actual work — today's schedule + courses */}
          <div className="flex-1 min-w-0 space-y-4">
            <CourseList />
          </div>
          {/* Sidebar: passive reference widgets, kept narrow so they don't
              compete with the course list for space */}
          <aside className="w-full md:w-[300px] shrink-0 space-y-4">
            <CoursesCalendar />
            <ManualQRCard />
          </aside>
        </div>
      </main>
    </div>
  );
}
