"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

export default function AdminNav({ email }: { email?: string }) {
  const pathname = usePathname();

  return (
    <header className="bg-white border-b border-gray-200" style={{ borderWidth: "0.5px" }}>
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <nav className="flex items-center gap-1">
          <Link
            href="/admin"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/admin" ? "bg-blue-50 text-[#185FA5]" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            รายวิชา
          </Link>
          <Link
            href="/admin/import"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/admin/import" ? "bg-blue-50 text-[#185FA5]" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            นำเข้า
          </Link>
          <Link
            href="/admin/setup"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/admin/setup" ? "bg-blue-50 text-[#185FA5]" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            เปิดคาบ
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          {email && <span className="text-xs text-gray-500 hidden sm:block">{email}</span>}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>
    </header>
  );
}
