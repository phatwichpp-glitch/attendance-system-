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
        <CoursesCalendar />
        <div className="flex items-center justify-between">
          <h1 className="text-[18px] font-medium text-gray-900">My Courses</h1>
        </div>
        <CourseList />
        <ManualQRCard />
      </main>
    </div>
  );
}
