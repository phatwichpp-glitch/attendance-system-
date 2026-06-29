"use client";
import { useEffect, useRef, useState } from "react";
import { IconX } from "@/components/icons";

const TABS = ["ภาพรวม", "สัญลักษณ์", "คู่มือ", "FAQ"] as const;
type Tab = typeof TABS[number];

export default function HelpModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("ภาพรวม");

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const focusable = dialog
      ? Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute("disabled"))
      : [];
    focusable[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col focus:outline-none"
        style={{ maxHeight: "88vh", border: "0.5px solid rgba(0,0,0,0.1)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}
        >
          <div>
            <h2 id="help-dialog-title" className="font-semibold text-gray-900 text-[17px]">คู่มือการใช้งาน</h2>
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

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 flex-shrink-0">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
              style={{
                backgroundColor: tab === t ? "#E6F1FB" : "transparent",
                color: tab === t ? "#185FA5" : "#6b7280",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 text-[13px] text-gray-700 leading-relaxed flex-1">

          {/* ── ภาพรวม ── */}
          {tab === "ภาพรวม" && (
            <>
              <p className="text-[12px] text-gray-500">ระบบทำอะไรได้บ้าง — ดูตามหมวดหมู่</p>

              <FeatureGroup icon="📥" title="นำเข้ารายชื่อ (Import)" color="#185FA5">
                <Li>รองรับ .xlsx, .xls, .csv — ทั้ง format CMU และ format ทั่วไป</Li>
                <Li>Import ซ้ำได้ — ระบบ merge ไม่ทับข้อมูลเดิม</Li>
                <Li>ตั้งค่าภาคการศึกษา (วันสอน, เวลา, จำนวนสัปดาห์) ได้ในขั้นตอนเดียวกัน</Li>
              </FeatureGroup>

              <FeatureGroup icon="📅" title="ตั้งค่าภาคการศึกษา (Semester Config)" color="#185FA5">
                <Li>บันทึกวันเริ่มภาค, จำนวนสัปดาห์, วันสอนแต่ละสัปดาห์</Li>
                <Li>กรอกเวลาเรียนจริง (HH:MM) ไม่ใช่ระบบคาบมาตรฐาน</Li>
                <Li>เปิด Session ครั้งต่อไป — เวลาเรียน GPS Radius OTP จะ auto-fill จาก config นี้</Li>
                <Li>คำนวณ Week number อัตโนมัติ (W1m, W2t …)</Li>
              </FeatureGroup>

              <FeatureGroup icon="🔓" title="เปิดคาบเรียน (Open Session)" color="#185FA5">
                <Li>กรอกเวลาเรียนจริง (HH:MM) — auto-fill จาก semester config ถ้ามี</Li>
                <Li>Single period (90 นาที) หรือ Double period (180 นาที)</Li>
                <Li>Double period มี 2 โหมด: OTP เดียว หรือ แยก OTP ต่อคาบ</Li>
                <Li>เลือก GPS จากอุปกรณ์ หรือปักหมุดบนแผนที่เอง</Li>
                <Li>บันทึกย้อนหลัง — ไม่ต้องการ GPS/OTP กรอกสถานะด้วยมือ</Li>
              </FeatureGroup>

              <FeatureGroup icon="📡" title="ระหว่างคาบ (Session Dashboard)" color="#185FA5">
                <Li>OTP 6 หลัก — สร้างใหม่ได้ไม่จำกัดครั้ง</Li>
                <Li>Projector View — แสดงเต็มจอ พร้อม QR code และ countdown</Li>
                <Li>Real-time list — เห็นว่าใครเช็คชื่อแล้วบ้าง</Li>
                <Li>Manual override — แก้สถานะนักศึกษารายคนได้ทันที</Li>
                <Li>Conflict detection — ตรวจจับอุปกรณ์เดียวกันใช้เช็คหลายคน</Li>
              </FeatureGroup>

              <FeatureGroup icon="📊" title="สรุปผล (Summary Table)" color="#3B6D11">
                <Li>ตารางนักศึกษา × session — ดูสถานะแต่ละคาบในที่เดียว</Li>
                <Li>ซ่อน/แสดง column session ได้อิสระ — คำนวณ Att/Abs/% ใหม่ทันที</Li>
                <Li>แก้ไขสถานะย้อนหลังได้จากตาราง (คลิกที่ cell)</Li>
                <Li>Export .xlsx — format เดียวกับต้นฉบับ (ลำดับ รหัส ชื่อ) + ข้อมูลเช็คชื่อ</Li>
                <Li>แสดงนักศึกษาที่ต่ำกว่า threshold เป็นสี highlight</Li>
              </FeatureGroup>

              <FeatureGroup icon="📋" title="Audit Log" color="#5F5E5A">
                <Li>บันทึกทุก action — เปิด/ปิดคาบ, Override, Delete</Li>
                <Li>กรองตาม Course และช่วงวันที่</Li>
              </FeatureGroup>
            </>
          )}

          {/* ── สัญลักษณ์ ── */}
          {tab === "สัญลักษณ์" && (
            <>
              <Section title="สถานะนักศึกษาในตาราง" color="#185FA5">
                <SymbolRow symbol="✓" label="Present (มาเรียน)" color="#3B6D11" bg="#EAF3DE">
                  เช็คชื่อสำเร็จ — กรอก OTP ถูกต้อง และ GPS ผ่าน
                </SymbolRow>
                <SymbolRow symbol="L" label="Late (สาย)" color="#854F0B" bg="#FEF9EC">
                  เช็คชื่อหลังเวลา late threshold — นับเป็น attended แต่สาย
                </SymbolRow>
                <SymbolRow symbol="—" label="Absent (ขาด)" color="#A32D2D" bg="#FCEBEB">
                  ไม่ได้เช็คชื่อ หรือถูก override เป็นขาด
                </SymbolRow>
                <SymbolRow symbol="⚠" label="GPS Fail" color="#854F0B" bg="#FEF9EC">
                  กรอก OTP ถูก แต่ GPS อยู่นอกรัศมีที่ตั้งไว้ — ขึ้นอยู่กับ setting
                  ว่าจะ save เป็น absent หรือเก็บไว้ตรวจสอบ
                </SymbolRow>
                <SymbolRow symbol="✓⚠" label="Flagged" color="#185FA5" bg="#E6F1FB">
                  มีการ flag ไว้เพื่อตรวจสอบ (เช่น อุปกรณ์ซ้ำ หรือ override)
                </SymbolRow>
              </Section>

              <Section title="Week Label (ชื่อ column ในตาราง)" color="#185FA5">
                <div className="rounded-lg overflow-hidden" style={{ border: "0.5px solid rgba(0,0,0,0.1)" }}>
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr style={{ backgroundColor: "#f8fafc" }}>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Label</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">ความหมาย</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[
                        ["W3", "สัปดาห์ที่ 3 (วิชาที่สอนวันเดียวต่อสัปดาห์)"],
                        ["W3m", "สัปดาห์ 3 วันจันทร์ (Mon)"],
                        ["W3t", "สัปดาห์ 3 วันอังคาร (Tue)"],
                        ["W3w", "สัปดาห์ 3 วันพุธ (Wed)"],
                        ["W3th", "สัปดาห์ 3 วันพฤหัส (Thu)"],
                        ["W3f", "สัปดาห์ 3 วันศุกร์ (Fri)"],
                      ].map(([label, desc]) => (
                        <tr key={label}>
                          <td className="px-3 py-2 font-mono font-semibold" style={{ color: "#185FA5" }}>{label}</td>
                          <td className="px-3 py-2 text-gray-600">{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Note>กรอก Week Label เองได้ในหน้า Open Session — ระบบจะ sort อัตโนมัติ</Note>
              </Section>

              <Section title="Export .xlsx — ค่าตัวเลขในแต่ละ cell" color="#3B6D11">
                <SymbolRow symbol="1" label="Present" color="#3B6D11" bg="#EAF3DE">
                  มาเรียน (รวม overridden)
                </SymbolRow>
                <SymbolRow symbol="0.5" label="Late" color="#854F0B" bg="#FEF9EC">
                  สาย — นับครึ่งคะแนน สะดวกต่อการ sum ใน Excel
                </SymbolRow>
                <SymbolRow symbol="0" label="Absent / GPS Fail" color="#A32D2D" bg="#FCEBEB">
                  ขาด หรือ GPS ไม่ผ่าน
                </SymbolRow>
                <SymbolRow symbol="" label="(ว่าง)" color="#5F5E5A" bg="#f9fafb">
                  session นั้นไม่มีข้อมูลเช็คชื่อของนักศึกษาคนนี้
                </SymbolRow>
              </Section>

              <Section title="ระดับความแม่นยำ GPS (Accuracy)" color="#185FA5">
                <div className="space-y-1.5">
                  {[
                    ["Excellent", "≤ 20 m", "#3B6D11", "#EAF3DE"],
                    ["Good",      "21–50 m", "#3B6D11", "#EAF3DE"],
                    ["Fair",      "51–100 m", "#854F0B", "#FEF9EC"],
                    ["Poor",      "> 100 m",  "#A32D2D", "#FCEBEB"],
                  ].map(([level, range, color, bg]) => (
                    <div key={level} className="flex items-center gap-3">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: bg, color }}>{level}</span>
                      <span className="text-[12px] text-gray-600">{range} — {level === "Excellent" || level === "Good" ? "เหมาะสม" : level === "Fair" ? "ยอมรับได้" : "แนะนำให้ปักหมุดบนแผนที่แทน"}</span>
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}

          {/* ── คู่มือ ── */}
          {tab === "คู่มือ" && (
            <>
              <Section title="1. นำเข้ารายชื่อนักศึกษา" color="#185FA5">
                <Step n="1">ไปที่เมนู <Chip>Import</Chip> — อัปโหลด .xlsx, .xls หรือ .csv</Step>
                <Step n="2">ถ้าเป็น format CMU ระบบจะอ่านรหัสวิชาและรายชื่อให้อัตโนมัติ</Step>
                <Step n="3">ถ้าเป็น format อื่น — เลือก mapping คอลัมน์ด้วยตัวเอง</Step>
                <Step n="4">ตั้งค่าภาคการศึกษา (วันสอน, เวลา, GPS radius, threshold ฯลฯ)</Step>
                <Step n="5">กด <Chip>Confirm Import</Chip></Step>
                <Note>Import ซ้ำวิชาเดิมได้ — ระบบ merge ไม่ทับข้อมูลเดิม</Note>
              </Section>

              <Section title="2. เปิดคาบเรียน" color="#185FA5">
                <Step n="1">ไปที่เมนู <Chip>Open Session</Chip> แล้วเลือกวิชา</Step>
                <Step n="2">ตรวจสอบเวลาเรียน (auto-fill จาก semester config) — แก้ได้ถ้าต้องการ</Step>
                <Step n="3">เลือก Single หรือ Double period</Step>
                <Step n="4">รอ GPS ล็อก — หรือปักหมุดบนแผนที่ถ้า GPS ไม่แม่น</Step>
                <Step n="5">ปรับ Settings (GPS Radius, OTP duration, late threshold) ถ้าต้องการ</Step>
                <Step n="6">กด <Chip>Open Session &amp; Generate OTP</Chip></Step>
                <Note>ค่า Settings และเวลาเรียนจะถูกจำไว้ — ครั้งหน้าไม่ต้องกรอกใหม่</Note>
              </Section>

              <Section title="3. ระหว่างคาบเรียน" color="#185FA5">
                <Step n="1">แสดง OTP 6 หลักบน Dashboard — กด <Chip>Projector View</Chip> เพื่อฉายบนหน้าจอ</Step>
                <Step n="2">นักศึกษาเปิดลิงก์เช็คชื่อ (QR บนกระดาน หรือพิมพ์ URL) กรอก OTP + ยืนยัน GPS</Step>
                <Step n="3">ดูรายชื่อแบบ real-time — Present / Late / Absent</Step>
                <Step n="4">กด <Chip>Manual Override</Chip> เพื่อแก้สถานะรายคน หรือตรวจ conflict อุปกรณ์</Step>
                <Step n="5">กด <Chip color="#A32D2D">Close Session</Chip> เมื่อจบคาบ</Step>
                <Note>นักศึกษาที่ยังไม่ได้เช็คชื่อตอนปิดคาบ จะถูก mark เป็น Absent อัตโนมัติ</Note>
              </Section>

              <Section title="4. คาบ Double Period" color="#185FA5">
                <Row label="Single Check-in">OTP เดียวครอบคลุม 2 คาบ — เช็คชื่อครั้งเดียว</Row>
                <Row label="Two Check-ins">OTP แยกต่อคาบ — ต้องเช็คชื่อ 2 ครั้ง (คาบ 1 และคาบ 2)</Row>
                <Note>เมื่อปิดคาบแรก ระบบจะเปิดคาบที่สองให้อัตโนมัติ (Two Check-ins)</Note>
              </Section>

              <Section title="5. บันทึกย้อนหลัง (Past Session)" color="#854F0B">
                <Step n="1">ใน Open Session — เปิด toggle <em>บันทึกย้อนหลัง</em></Step>
                <Step n="2">เลือกวันที่ที่ต้องการ (ย้อนหลังได้)</Step>
                <Step n="3">กด <Chip>Create Past Session</Chip> — เข้าสู่หน้ากรอกชื่อด้วยมือ</Step>
                <Step n="4">ติ๊ก Present / Late / Absent ให้ครบ แล้วกด Save</Step>
              </Section>

              <Section title="6. ดูสรุปผลการเช็คชื่อ" color="#3B6D11">
                <Step n="1">กด <Chip>Summary</Chip> บนการ์ดวิชา</Step>
                <Step n="2">ตารางแสดงนักศึกษา × session — คลิก cell เพื่อแก้ไขสถานะย้อนหลัง</Step>
                <Step n="3">กด <strong>×</strong> บน column header เพื่อซ่อน session นั้น — Att/Abs/% ปรับใหม่ทันที</Step>
                <Step n="4">กด <Chip>Export .xlsx</Chip> เพื่อดาวน์โหลด — format เดียวกับต้นฉบับ + ข้อมูลเช็คชื่อ</Step>
                <Note>นักศึกษาที่ต่ำกว่า threshold จะถูก highlight — ปรับ threshold ได้มุมบนขวาของตาราง</Note>
              </Section>

              <Section title="7. Audit Log" color="#5F5E5A">
                <p>บันทึกทุก action ในระบบ — เปิด/ปิดคาบ, Override, Delete</p>
                <p className="mt-1 text-gray-500">กรองตาม Course และช่วงวันที่ได้ที่เมนู <Chip>Audit Log</Chip></p>
              </Section>
            </>
          )}

          {/* ── FAQ ── */}
          {tab === "FAQ" && (
            <div className="space-y-3">
              <FAQ q="นักศึกษาเช็คชื่อไม่ผ่าน GPS ทำอย่างไร?">
                ตรวจสอบว่า GPS Radius เพียงพอ (แนะนำ 100–200 m ในอาคาร) หรือใช้ Manual Override
                เพื่อแก้สถานะให้นักศึกษารายคน
              </FAQ>
              <FAQ q="OTP หมดอายุก่อนนักศึกษาเข้าห้องครบ?">
                ใน Session Dashboard กด <em>Regenerate OTP</em> เพื่อออก OTP ใหม่ได้ตลอดเวลา
                ไม่จำกัดจำนวนครั้ง
              </FAQ>
              <FAQ q="เวลาเปิด Session แสดงผิด ไม่ตรงกับที่ตั้งไว้ใน semester?">
                ระบบจะ auto-fill เวลาจาก semester config เฉพาะครั้งแรก — หลังจากนั้นจะจำเวลา
                ที่เคยกรอก เปลี่ยนได้ตรง time input บนหน้า Open Session
              </FAQ>
              <FAQ q="Week label คำนวณผิด หรืออยากกรอกเอง?">
                ระบบคำนวณจาก semester_start ที่ตั้งไว้ — แก้ได้ตรง field Week # และ Week Label
                บนหน้า Open Session รูปแบบ: W1m, W2th ฯลฯ
              </FAQ>
              <FAQ q="ซ่อน session column แล้วอยากคืนค่า?">
                กดปุ่ม <em>N columns hidden · Restore all</em> ที่ด้านบนตาราง Summary
              </FAQ>
              <FAQ q="Export .xlsx มีเฉพาะ session ที่ซ่อนอยู่ไหม?">
                ไม่มีครับ — Export ใช้เฉพาะ session ที่มองเห็นในตาราง ณ เวลานั้น
                (ซ่อน column ไหนไว้ จะไม่ติดมาใน .xlsx)
              </FAQ>
              <FAQ q="เผลอกด Open Session ซ้ำสำหรับวิชาเดิม?">
                ระบบจะแสดงปุ่ม <em>View Active Session</em> แทน — กดเพื่อกลับไปคาบที่เปิดอยู่
              </FAQ>
              <FAQ q="ต้องการลบวิชาทั้งหมดและ import ใหม่?">
                กดเมนู ⋯ บนการ์ดวิชา แล้วเลือก <em>Delete Course</em> — ต้องยืนยันด้วยรหัสวิชา
              </FAQ>
            </div>
          )}

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

function FeatureGroup({ icon, title, color, children }: { icon: string; title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 space-y-1.5" style={{ backgroundColor: "#f9fafb", border: "0.5px solid rgba(0,0,0,0.07)" }}>
      <p className="font-semibold text-[13px] mb-2" style={{ color }}>
        {icon} {title}
      </p>
      {children}
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start text-[12px] text-gray-600">
      <span className="mt-1.5 flex-shrink-0 w-1 h-1 rounded-full bg-gray-400" />
      <span>{children}</span>
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

function SymbolRow({ symbol, label, color, bg, children }: {
  symbol: string; label: string; color: string; bg: string; children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 items-start py-1.5" style={{ borderBottom: "0.5px solid rgba(0,0,0,0.05)" }}>
      <span
        className="flex-shrink-0 w-10 text-center rounded font-bold text-[13px] py-0.5"
        style={{ backgroundColor: bg, color }}
      >
        {symbol || "·"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 text-[12px]">{label}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">{children}</p>
      </div>
    </div>
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
