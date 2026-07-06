"use client";
import { useEffect, useRef } from "react";
import { IconX } from "@/components/icons";

// Deliberately its own modal, not a tab inside components/HelpModal.tsx — this is
// step-by-step setup for a specific third-party account, not general app help, and
// the two shouldn't get tangled together as either one grows.
export default function ResendGuideModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="resend-guide-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col focus:outline-none"
        style={{ maxHeight: "88vh", border: "0.5px solid rgba(0,0,0,0.1)" }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}
        >
          <div>
            <h2 id="resend-guide-title" className="font-semibold text-gray-900 text-[16px]">
              วิธีสมัครและตั้งค่า Resend
            </h2>
            <p className="text-[12px] text-gray-400 mt-0.5">สำหรับแจ้งเตือนทางอีเมล — ใช้เวลาประมาณ 5 นาที</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-center"
            style={{ width: 36, height: 36 }}
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4 text-[13px] text-gray-700 leading-relaxed flex-1">
          <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: "#FEF9EC", color: "#854F0B", border: "0.5px solid #EF9F27" }}>
            <strong>สำคัญ:</strong> Resend แบบฟรีไม่ verify domain จะส่งอีเมลได้เฉพาะหาอีเมลที่ใช้สมัครบัญชี Resend
            เท่านั้น ดังนั้น<strong>ใช้อีเมลเดียวกับที่คุณต้องการรับการแจ้งเตือน</strong>ตอนสมัคร — ข้อจำกัดนี้ไม่มีผล
            เพราะระบบนี้ส่งแจ้งเตือนหาตัวคุณเองอยู่แล้ว ไม่ได้ส่งหาคนอื่น
          </div>

          <GuideStep n={1} title="สมัครบัญชี Resend">
            ไปที่{" "}
            <a href="https://resend.com/signup" target="_blank" rel="noreferrer" style={{ color: "#185FA5" }}>
              resend.com/signup
            </a>{" "}
            สมัครด้วยอีเมลที่ต้องการรับแจ้งเตือน (หรือ Sign up with Google ก็ได้ถ้าอีเมล Google ตรงกัน) ฟรี ไม่ต้องผูกบัตรเครดิต
          </GuideStep>

          <GuideStep n={2} title="ยืนยันอีเมล">
            เช็คกล่องจดหมาย (รวมถึง Junk/Spam) แล้วกดลิงก์ยืนยันจาก Resend
          </GuideStep>

          <GuideStep n={3} title="สร้าง API Key">
            ในเมนูซ้ายมือของ Resend ไปที่ <strong>API Keys</strong> → กด <strong>Create API Key</strong>{" "}
            ตั้งชื่ออะไรก็ได้ (เช่น &quot;attendance-system&quot;) เลือก Permission เป็น{" "}
            <strong>Sending access</strong> ก็พอ ไม่ต้องให้สิทธิ์เต็ม
          </GuideStep>

          <GuideStep n={4} title="คัดลอก API Key">
            Resend จะโชว์รหัสให้เห็น<strong>ครั้งเดียวเท่านั้น</strong> (ขึ้นต้นด้วย <code>re_</code>) — คัดลอกไว้ทันที
            ถ้าปิดหน้าไปก่อนคัดลอก ต้องสร้าง key ใหม่
          </GuideStep>

          <GuideStep n={5} title="วางในระบบเช็คชื่อ">
            กลับมาที่หน้า Notifications วางรหัสที่คัดลอกไว้ในช่อง &quot;Resend API Key&quot; แล้วกด บันทึก
          </GuideStep>

          <GuideStep n={6} title="ทดสอบ">
            เปิด toggle แจ้งเตือนทางอีเมล ตรวจสอบว่าช่อง &quot;ส่งไปที่อีเมล&quot; ตรงกับอีเมลที่สมัคร Resend แล้วกด{" "}
            <strong>ส่งอีเมลทดสอบ</strong>
          </GuideStep>

          <div className="rounded-lg px-3 py-2.5 text-[12px]" style={{ backgroundColor: "#f9fafb", border: "0.5px solid rgba(0,0,0,0.07)", color: "#5F5E5A" }}>
            บัญชีฟรีของ Resend ส่งได้ 100 อีเมล/วัน และ 3,000 อีเมล/เดือน — เกินพอสำหรับแจ้งเตือนเปิดคาบของอาจารย์คนเดียว
          </div>
        </div>
      </div>
    </div>
  );
}

function GuideStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span
        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
        style={{ backgroundColor: "#E6F1FB", color: "#185FA5" }}
      >
        {n}
      </span>
      <div>
        <p className="font-medium text-gray-800 mb-0.5">{title}</p>
        <p className="text-gray-600">{children}</p>
      </div>
    </div>
  );
}
