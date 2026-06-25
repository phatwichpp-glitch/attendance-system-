import { redirect } from "next/navigation";
import { auth } from "@/auth";
import LoginButton from "./LoginButton";

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/admin");

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm space-y-8 py-10 text-center">
        <div>
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: "#185FA5" }}
          >
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ระบบเช็คชื่อ</h1>
          <p className="text-sm text-gray-500 mt-1">สำหรับอาจารย์ผู้สอน</p>
        </div>
        <LoginButton />
        <p className="text-xs text-gray-400">
          ระบบจะขอสิทธิ์เข้าถึง Google Drive และ Sheets
          <br />
          เพื่อสร้างฐานข้อมูลเช็คชื่อส่วนตัว
        </p>
      </div>
    </main>
  );
}
