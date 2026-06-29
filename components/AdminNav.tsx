"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useCallback } from "react";
import { useClock } from "@/lib/hooks/useClock";
import HelpModal from "@/components/HelpModal";

export default function AdminNav({ email }: { email?: string | null }) {
  const pathname = usePathname();
  const clock = useClock();
  const [showHelp, setShowHelp] = useState(false);
  const handleCloseHelp = useCallback(() => setShowHelp(false), []);

  const link = (href: string, label: string) => {
    const isActive =
      href === "/admin"
        ? pathname === href
        : pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        className={`px-3 py-2 rounded-lg text-[15px] font-medium transition-colors ${
          isActive ? "bg-blue-50 text-[#185FA5]" : "text-gray-500 hover:text-gray-900"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <>
      <header
        className="bg-white sticky top-0 z-30"
        style={{ borderBottom: "0.5px solid rgba(0,0,0,0.12)" }}
      >
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="relative flex-1 min-w-0">
            <nav className="flex items-center gap-1 overflow-x-auto pr-4">
              {link("/admin", "Courses")}
              {link("/admin/import", "Import")}
              {link("/admin/setup", "Open Session")}
              {link("/admin/audit", "Audit Log")}
            </nav>
            <div className="absolute right-0 top-0 h-full w-6 bg-gradient-to-l from-white to-transparent pointer-events-none sm:hidden" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {email && (
              <span className="text-[12px] text-gray-400 hidden lg:block truncate max-w-28">
                {email}
              </span>
            )}
            {clock.time && (
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] hidden md:block" style={{ color: "#5F5E5A" }}>{clock.date}</span>
                <span className="text-[18px] font-medium" style={{ fontFamily: "ui-monospace, monospace" }}>{clock.time}</span>
              </div>
            )}
            <button
              onClick={() => setShowHelp(true)}
              className="rounded-full flex items-center justify-center flex-shrink-0 text-gray-400 hover:text-[#185FA5] hover:bg-blue-50 transition-colors font-bold"
              style={{ width: 30, height: 30, border: "1.5px solid currentColor", fontSize: 14, lineHeight: 1 }}
              title="คู่มือการใช้งาน"
              aria-label="Help"
            >
              ?
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-[13px] text-gray-500 hover:text-gray-900 transition-colors px-1.5 h-8 flex items-center whitespace-nowrap"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>
      {showHelp && <HelpModal onClose={handleCloseHelp} />}
    </>
  );
}
