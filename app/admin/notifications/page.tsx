import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminNav from "@/components/AdminNav";
import NotificationsClient from "./NotificationsClient";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <AdminNav email={session.user?.email} />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-[18px] font-medium text-gray-900 mb-6">การแจ้งเตือน</h1>
        <NotificationsClient />
      </main>
    </div>
  );
}
