"use client";
import { useEffect } from "react";
import { IconX } from "@/components/icons";

export default function HelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col"
        style={{ maxHeight: "85vh", border: "0.5px solid rgba(0,0,0,0.1)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}
        >
          <div>
            <h2 className="font-semibold text-gray-900 text-[17px]">คู่มือการใช้งาน</h2>
            <p className="text-[12px] text-gray-400 mt-0.5">ระบบเช็คชื่อนักศึกษา</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-center"
            style={{ width: 36, height: 36 }}
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-6 text-[13px] text-gray-700 leading-relaxed">

          {/* 1 */}
          <Section title="1. นำเข้ารายชื่อนักศึกษา" color="#185FA5">
            <Step n="1">ไปที่เมนู <Chip>Import</Chip> แล้วดาวน์โหลดไฟล์ Excel ตัวอย่าง</Step>
            <Step n="2">กรอกข้อมูลนักศึกษาให้ครบ — รหัสนักศึกษา, ชื่อ, Course ID, Section</Step>
            <Step n="3">อัปโหลดไฟล์กลับมา ระบบจะสร้างวิชาและเพิ่มนักศึกษาให้อัตโนมัติ</Step>
            <Note>วิชาเดิมที่ import ซ้ำจะ merge — ไม่ทับข้อมูลเดิม</Note>
          </Section>

          {/* 2 */}
          <Section title="2. เปิดคาบเรียน" color="#185FA5">
            <Step n="1">กดปุ่ม <Chip>Open Session</Chip> บนการ์ดวิชา (หรือไปที่เมนู Open Session)</Step>
            <Step n="2">เลือกวิชา, คาบ, จำนวนคาบ (Single / Double)</Step>
            <Step n="3">รอ GPS ล็อก — ความแม่นยำ &lt;50 m ดีที่สุด หรือเลือกตำแหน่งบนแผนที่แทน</Step>
            <Step n="4">ปรับ Settings ตามต้องการ (GPS Radius, เวลา OTP, เวลา late)</Step>
            <Step n="5">กด <Chip>Open Session &amp; Generate OTP</Chip></Step>
            <Note>หากวิชานั้นมีคาบเปิดอยู่แล้ว ปุ่มจะเปลี่ยนเป็น <em>View Active Session</em> เพื่อป้องกันการเปิดซ้ำ</Note>
          </Section>

          {/* 3 */}
          <Section title="3. ระหว่างคาบเรียน (Session Dashboard)" color="#185FA5">
            <Step n="1">แสดง OTP 6 หลักให้นักศึกษาเห็น — OTP จะหมดอายุตามเวลาที่ตั้ง</Step>
            <Step n="2">กด <Chip>Projector View</Chip> เพื่อแสดงบนหน้าจอห้องเรียน (fullscreen)</Step>
            <Step n="3">นักศึกษาเปิด <strong>check.&lt;domain&gt;</strong> แล้วกรอก OTP + ยืนยัน GPS</Step>
            <Step n="4">ดูรายชื่อ Present / Late / Absent แบบ real-time บน Dashboard</Step>
            <Step n="5">กด <Chip>Manual Override</Chip> เพื่อแก้สถานะนักศึกษารายคน หากจำเป็น</Step>
          </Section>

          {/* 4 */}
          <Section title="4. ปิดคาบเรียน" color="#185FA5">
            <Step n="1">กดปุ่ม <Chip color="#A32D2D">Close Session</Chip> ใน Session Dashboard</Step>
            <Step n="2">ระบบจะ mark นักศึกษาที่ยังไม่ได้เช็คชื่อเป็น <em>Absent</em> อัตโนมัติ</Step>
            <Step n="3">ข้อมูลจะบันทึกลง Google Sheets ทันที</Step>
            <Note>ถ้าเผลอออกจากหน้า ให้กลับมาที่ <Chip>Courses</Chip> แล้วกด <em>View Active Session</em> บนการ์ดวิชา</Note>
          </Section>

          {/* 5 */}
          <Section title="5. คาบ Double Period" color="#185FA5">
            <Row label="Single Check-in">OTP เดียวครอบคลุม 2 คาบ — นักศึกษาเช็คชื่อครั้งเดียว</Row>
            <Row label="Two Check-ins">OTP แยกต่อคาบ — นักศึกษาต้องเช็คชื่อ 2 ครั้ง (คาบ 1 และคาบ 2)</Row>
            <Note>เมื่อปิดคาบแรก ระบบจะเปิดคาบที่สองให้อัตโนมัติ</Note>
          </Section>

          {/* 6 */}
          <Section title="6. บันทึกย้อนหลัง (Past Session)" color="#854F0B">
            <Step n="1">เลือกวิชาและกด <Chip>Open Session</Chip></Step>
            <Step n="2">เปิด toggle <em>บันทึกย้อนหลัง</em> แล้วเลือกวันที่ที่ต้องการ</Step>
            <Step n="3">กด <Chip>Create Past Session</Chip> — จะเข้าสู่หน้ากรอกชื่อด้วยมือ</Step>
            <Step n="4">ติ๊ก Present / Late / Absent ให้ครบ แล้วกด Save</Step>
          </Section>

          {/* 7 */}
          <Section title="7. ดูสรุปผลการเช็คชื่อ" color="#3B6D11">
            <Step n="1">กดปุ่ม <Chip>Summary</Chip> บนการ์ดวิชา หรือเลือก <em>View Summary</em> จากเมนู ⋯</Step>
            <Step n="2">ดูตารางสรุปรายนักศึกษา — จำนวนครั้งที่ Present, Late, Absent และเปอร์เซ็นต์</Step>
            <Step n="3">Export ข้อมูลออกเป็น CSV หรือดูใน Google Sheets โดยตรง</Step>
          </Section>

          {/* 8 */}
          <Section title="8. Audit Log" color="#5F5E5A">
            <p>บันทึกทุก action ที่เกิดขึ้นในระบบ — เปิด/ปิดคาบ, Override, Delete ฯลฯ สามารถกรองตาม Course และวันที่ได้</p>
          </Section>

          {/* FAQ */}
          <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", paddingTop: 20 }}>
            <p className="font-semibold text-gray-900 mb-3">คำถามที่พบบ่อย</p>
            <div className="space-y-3">
              <FAQ q="นักศึกษาเช็คชื่อไม่ผ่าน GPS ทำอย่างไร?">
                ตรวจสอบว่า GPS Radius เพียงพอ (แนะนำ 100–200 m ในอาคาร) หรือใช้ Manual Override เพื่อแก้สถานะ
              </FAQ>
              <FAQ q="OTP หมดอายุก่อนนักศึกษาเข้าห้องครบ?">
                ใน Session Dashboard กด <em>Regenerate OTP</em> เพื่อออก OTP ใหม่ได้ตลอดเวลา
              </FAQ>
              <FAQ q="เผลอกด Open Session ซ้ำสำหรับวิชาเดิม?">
                ระบบจะแสดงปุ่ม <em>View Active Session</em> แทน — กดเพื่อกลับไปคาบที่เปิดอยู่ หรือกด <em>Open Another Session</em> หากต้องการเปิดเพิ่มจริงๆ
              </FAQ>
              <FAQ q="ต้องการลบวิชาทั้งหมดและ import ใหม่?">
                กดเมนู ⋯ บนการ์ดวิชา แล้วเลือก <em>Delete Course</em> — ต้องยืนยันด้วยรหัสวิชา
              </FAQ>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold mb-2.5" style={{ color, fontSize: 13 }}>{title}</p>
      <div className="space-y-1.5 pl-1">{children}</div>
    </div>
  );
}

function Step({ n, children }: { n: string | number; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span
        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
        style={{ backgroundColor: "#E6F1FB", color: "#185FA5" }}
      >
        {n}
      </span>
      <span>{children}</span>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start">
      <span className="font-medium text-gray-800 flex-shrink-0 w-36">{label}</span>
      <span className="text-gray-600">{children}</span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-2 rounded-lg px-3 py-2 text-[12px]"
      style={{ backgroundColor: "#FEF9EC", color: "#854F0B", border: "0.5px solid #EF9F27" }}
    >
      {children}
    </div>
  );
}

function Chip({ children, color = "#185FA5" }: { children: React.ReactNode; color?: string }) {
  const bg = color === "#185FA5" ? "#E6F1FB" : color === "#A32D2D" ? "#FCEBEB" : "#f3f4f6";
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[11px] font-medium mx-0.5"
      style={{ backgroundColor: bg, color }}
    >
      {children}
    </span>
  );
}

function FAQ({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: "#f9fafb", border: "0.5px solid rgba(0,0,0,0.07)" }}>
      <p className="font-medium text-gray-800 mb-1">{q}</p>
      <p className="text-gray-500 text-[12px]">{children}</p>
    </div>
  );
}
