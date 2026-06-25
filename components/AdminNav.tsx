"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

export default function AdminNav({ email }: { email?: string | null }) {
  const pathname = usePathname();

  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        pathname === href || pathname.startsWith(href + "/")
          ? "bg-blue-50 text-[#185FA5]"
          : "text-gray-500 hover:text-gray-900"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header
      className="bg-white sticky top-0 z-10"
      style={{ borderBottom: "0.5px solid rgba(0,0,0,0.12)" }}
    >
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <nav className="flex items-center gap-1">
          {link("/admin", "รายวิชา")}
          {link("/admin/import", "นำเข้า")}
          {link("/admin/setup", "เปิดคาบ")}
        </nav>
        <div className="flex items-center gap-3">
          {email && (
            <span className="text-xs text-gray-400 hidden sm:block truncate max-w-40">
              {email}
            </span>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>
    </header>
  );
}
