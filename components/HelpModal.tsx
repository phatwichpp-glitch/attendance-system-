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
                <Li>ระบบสแกนไฟล์ให้ก่อนอัตโนมัติ — จับคู่คอลัมน์ (รหัส/ชื่อ/นามสกุล/ลำดับ) และดึงรหัสวิชา + section จากชื่อไฟล์ แค่ตรวจสอบความถูกต้องแล้วไปต่อ</Li>
                <Li>Import ซ้ำได้ — ระบบ merge ไม่ทับข้อมูลเดิม</Li>
                <Li>ตั้งค่าภาคการศึกษา (วันเปิด–วันสุดท้ายของภาคเรียน, วันสอน, เวลา) รวมถึงเปิด Auto-Open ได้ในขั้นตอนเดียวกัน</Li>
              </FeatureGroup>

              <FeatureGroup icon="📅" title="ตั้งค่าภาคการศึกษา (Semester Config)" color="#185FA5">
                <Li>กรอกวันเปิดภาคเรียนและวันสุดท้ายของภาคเรียน — ระบบคำนวณจำนวนสัปดาห์ให้เอง ไม่ต้องนับ</Li>
                <Li>กรอกเวลาเรียนจริง (HH:MM) ไม่ใช่ระบบคาบมาตรฐาน</Li>
                <Li>เปิด Session ครั้งต่อไป — เวลาเรียน GPS Radius OTP จะ auto-fill จาก config นี้</Li>
                <Li>คำนวณ Week number อัตโนมัติ (W1m, W2t …) ตามสัปดาห์ปฏิทิน จันทร์–อาทิตย์</Li>
              </FeatureGroup>

              <FeatureGroup icon="🔓" title="เปิดคาบเรียน (Open Session)" color="#185FA5">
                <Li>แถบ &quot;Today&quot; บนหน้า Courses — เห็นทุกคาบของวันนั้นเรียงตามเวลา พร้อมสถานะ (กำลังเปิด / เปิดอัตโนมัติกี่โมง)</Li>
                <Li>ปุ่ม <strong>Quick Open</strong> — เปิดคาบในคลิกเดียวด้วยค่าจาก Semester Settings + หมุดห้องเรียนที่ปักไว้ ไม่ต้องกรอกฟอร์มหรือรอ GPS (ขึ้นเฉพาะวันที่มีสอนและปักหมุดแล้ว)</Li>
                <Li>กรอกเวลาเรียนจริง (HH:MM) — auto-fill จาก semester config ถ้ามี</Li>
                <Li>Single period (90 นาที) หรือ Double period (180 นาที)</Li>
                <Li>Double period มี 2 โหมด: OTP เดียว หรือ แยก OTP ต่อคาบ</Li>
                <Li>OTP duration และ Late threshold — พิมพ์ตัวเลขได้โดยตรง, max = ความยาวคาบนั้น</Li>
                <Li>เปิด/ปิดการนับ &quot;สาย&quot; ทั้งคาบได้ — ถ้าปิด นักศึกษาจะได้แค่ Present หรือ Absent เท่านั้น</Li>
                <Li>เลือก GPS จากอุปกรณ์ หรือปักหมุดบนแผนที่เอง</Li>
                <Li>บันทึกย้อนหลัง — ไม่ต้องใช้ GPS หรือ OTP กรอกสถานะให้นักศึกษาด้วยมือแทนได้เลย</Li>
              </FeatureGroup>

              <FeatureGroup icon="🔔" title="เปิดคาบอัตโนมัติ + แจ้งเตือน (Auto-Open)" color="#185FA5">
                <Li>เปิด toggle ใน Semester Settings — ระบบเปิดคาบและออก OTP ให้เองตามตารางสอน ไม่ต้องกดเปิดคาบเอง</Li>
                <Li>ต้องปักหมุดตำแหน่ง GPS ห้องเรียนไว้ล่วงหน้า เพราะตอนเปิดคาบอัตโนมัติไม่มีใครถืออุปกรณ์อยู่ในห้องให้ระบบอ่านพิกัด</Li>
                <Li>Classroom Display — ลิงก์คงที่ต่อวิชา เปิดค้างไว้บนจอห้องเรียนได้ จะโชว์ QR/OTP ของคาบล่าสุดให้อัตโนมัติ</Li>
                <Li>แจ้งเตือนอาจารย์ทาง LINE ทันทีที่เปิดคาบอัตโนมัติ พร้อม OTP และลิงก์เช็คชื่อ — ตั้งค่าที่เมนู Notifications</Li>
                <Li>ตั้งค่า &quot;เปิดคาบล่วงหน้า&quot; ได้ (0–15 นาที) — ให้ระบบเปิดคาบและแจ้งเตือนก่อนเวลาเรียนจริง แก้ตัวเลขนี้ได้ตลอดเวลาที่ Semester Settings</Li>
              </FeatureGroup>

              <FeatureGroup icon="📡" title="ระหว่างคาบ (Session Dashboard)" color="#185FA5">
                <Li>OTP 6 หลัก — แสดง countdown MM:SS แบบ real-time บนหน้าจอ</Li>
                <Li>ระหว่างคาบเปิด ช่องสถิติแสดง <strong>Pending (ยังไม่เช็คชื่อ)</strong> แทน Absent — กดป้าย &quot;Pending&quot; ในแถบ Issues เพื่อกรองรายชื่อคนที่ยังไม่เช็ค ใช้ขานชื่อท้ายคาบได้</Li>
                <Li>OTP หมดอายุ → session ปิดอัตโนมัติ ไม่ต้องกลับมากด</Li>
                <Li>Re-Generate OTP — เปิด session ที่ปิดไปแล้วได้ทุกเมื่อ (ยกเว้น session แบบบันทึกย้อนหลัง) พร้อมปรับ GPS Radius / OTP Duration / Late threshold / เปิดปิดสถานะสาย ก่อนออกรหัสใหม่ — มีเตือนถ้า session นั้นไม่ใช่ของวันนี้</Li>
                <Li>Projector View — แสดงเต็มจอ พร้อม QR code และ countdown</Li>
                <Li>Real-time list — เห็นว่าใครเช็คชื่อแล้วบ้าง</Li>
                <Li>คลิกป้ายสถานะ (Present/Late/Absent/GPS fail) เพื่อแก้สถานะนักศึกษารายคนได้ทันที</Li>
                <Li>ปุ่ม Review — Approve (ระบบใส่เหตุผลให้อัตโนมัติจากปัญหาที่เจอ ไม่ต้องพิมพ์เอง) หรือ Mark Absent ส่วน Flag / Revoke Approval / Delete Record ย้ายไปไว้ในเมนู ⋯ เพราะใช้ไม่บ่อย</Li>
                <Li>ตรวจจับอุปกรณ์ซ้ำ 2 ระดับ — &quot;ยืนยันแล้ว&quot; (อุปกรณ์เดียวกันแน่นอน แม้สลับ browser/โหมดไม่ระบุตัวตน) จะติดป้าย &quot;Auto-Flagged&quot; สีแดงเข้มให้ทันทีตอนเช็คชื่อ ส่วน &quot;น่าสงสัย&quot; (แค่ IP เดียวกัน + เช็คชื่อใกล้กันทั้งเวลาและตำแหน่ง) ขึ้นเป็นแบนเนอร์แยกให้ดูเฉยๆ</Li>
                <Li>ตรวจพิกัด GPS ที่ดูผิดปกติด้วย — แม่นยำต่ำเกินไป หรือนิ่งสนิทแบบไม่สมจริง (มักเจอตอนมีคนปลอมพิกัด) จะติดป้าย Auto-Flagged เช่นกัน เป็นสัญญาณอ่อนที่อาจเตือนผิดได้ถ้าสัญญาณ GPS ในห้องแย่จริงๆ — ทุกกรณีไม่บล็อกการเช็คชื่อ แค่เตือนให้ตรวจสอบ</Li>
                <Li>แถบ Issues ด้านบนรายชื่อ — กดที่ป้าย (GPS Fail / Same Device / Late / Flagged / Auto-Flagged) เพื่อกรองรายชื่อให้เหลือแค่คนกลุ่มนั้น กดซ้ำหรือกด Clear filter เพื่อยกเลิก</Li>
              </FeatureGroup>

              <FeatureGroup icon="📊" title="สรุปผล (Summary Table)" color="#3B6D11">
                <Li>ตารางนักศึกษา × session — ดูสถานะแต่ละคาบในที่เดียว</Li>
                <Li>คลิกที่หัวคอลัมน์ session เพื่อเปิดหน้า session นั้นโดยตรง — ใช้กลับเข้าไป Re-Generate OTP คาบที่ปิดไปแล้วได้</Li>
                <Li>ลบ session ที่เปิดผิดได้ถาวร — hover column header แล้วกด ×</Li>
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
                  กรอก OTP ถูก แต่พิกัด GPS อยู่นอกรัศมีที่ตั้งไว้ — ระบบไม่ตัดเป็นขาดทันที
                  เก็บสถานะนี้ไว้ให้ครูตรวจสอบและกด Approve เองถ้าเป็นความผิดพลาดของ GPS
                </SymbolRow>
                <SymbolRow symbol="⚑" label="Flagged" color="#7e22ce" bg="#f3e8ff">
                  ครูกดตั้งข้อสงสัยไว้เองผ่านเมนู ⋯ — ไม่เปลี่ยนสถานะ แค่ติดป้ายไว้ให้กลับมาดูทีหลัง
                </SymbolRow>
                <SymbolRow symbol="⚑⚑" label="Auto-Flagged" color="#991b1b" bg="#fecaca">
                  ระบบติดป้ายให้เองตอนเช็คชื่อ (เจออุปกรณ์ซ้ำ หรือพิกัด GPS ดูผิดปกติ) — ไม่บล็อกการเช็คชื่อ
                  ชี้เมาส์ที่ป้ายเพื่อดูเหตุผล
                </SymbolRow>
              </Section>

              <Section title="ระดับความน่าเชื่อถือของ Device Conflict" color="#185FA5">
                <SymbolRow symbol="!" label="ยืนยันแล้ว (Confirmed)" color="#A32D2D" bg="#FCEBEB">
                  ตรวจพบลายนิ้วมืออุปกรณ์ตรงกัน — รวมถึงกรณีสลับ browser หรือเปิดโหมดไม่ระบุตัวตน
                  (ใช้ลายนิ้วมือระดับ GPU จาก Canvas/WebGL ที่เหมือนกันบนเครื่องเดียวกัน) ความมั่นใจสูง ควรตรวจสอบ
                </SymbolRow>
                <SymbolRow symbol="?" label="น่าสงสัย (Possible)" color="#185FA5" bg="#E6F1FB">
                  IP เดียวกัน + เช็คชื่อห่างกันไม่เกิน 30 วินาที และตำแหน่ง GPS ใกล้กันไม่เกิน 10 เมตร —
                  เป็นสัญญาณอ่อนกว่า เพราะ WiFi มหาวิทยาลัยมักแชร์ IP เดียวกันให้หลายคน ไม่ได้แปลว่าโกงเสมอไป
                </SymbolRow>
                <Note>เคส &quot;ยืนยันแล้ว&quot; จะติดป้าย Auto-Flagged สีแดงเข้มไว้ที่ตัวนักศึกษาแต่ละคนด้วย ไม่ใช่แค่ขึ้นในแบนเนอร์ — เพื่อไม่ให้หลุดรอดสายตาแม้ครูจะปิดแบนเนอร์ไปแล้ว</Note>
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
                <Note>
                  สัปดาห์นับตามปฏิทิน (จันทร์–อาทิตย์) — W1 คือสัปดาห์ที่มีวันเปิดภาคเรียนอยู่
                  ถึงแม้เปิดเทอมกลางสัปดาห์ พอถึงวันจันทร์ถัดไปก็ขึ้น W2 ทันที
                  กรอก Week Label เองได้ในหน้า Open Session — ระบบจะ sort อัตโนมัติ
                </Note>
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
                <Note>ตารางนี้ใช้ตอนอาจารย์ปักหมุด GPS ห้องเรียนตอนเปิดคาบ — ฝั่งนักศึกษาก็เช็คแบบเดียวกัน ถ้าพิกัดที่ส่งมา &quot;Poor&quot; (เกิน 100 ม.) จะถูกติดป้าย Auto-Flagged ไว้ให้ตรวจสอบด้วย</Note>
              </Section>
            </>
          )}

          {/* ── คู่มือ ── */}
          {tab === "คู่มือ" && (
            <>
              <Section title="1. นำเข้ารายชื่อนักศึกษา" color="#185FA5">
                <Step n="1">ไปที่เมนู <Chip>Import</Chip> — อัปโหลด .xlsx, .xls หรือ .csv</Step>
                <Step n="2">ถ้าเป็น format CMU ระบบจะอ่านรหัสวิชาและรายชื่อให้อัตโนมัติ</Step>
                <Step n="3">format อื่น — ระบบสแกนหัวตารางแล้วจับคู่คอลัมน์ (รหัสนักศึกษา ชื่อ นามสกุล ลำดับ) ให้อัตโนมัติ พร้อมดึงรหัสวิชา/section จากชื่อไฟล์ — ตรวจสอบความถูกต้อง แก้จุดที่ไม่ตรง แล้วเติมชื่อวิชากับผู้สอน</Step>
                <Step n="4">ตรวจรายชื่อนักศึกษาที่อ่านได้ในหน้า Preview ก่อนไปต่อ</Step>
                <Step n="5">ตั้งค่าภาคการศึกษา — กรอกวันเปิดภาคเรียนและวันสุดท้ายของภาคเรียน (ระบบคำนวณจำนวนสัปดาห์ให้เอง), วันสอน, เวลา, GPS radius และเปิดคาบอัตโนมัติ (Auto-Open) ได้เลยถ้าต้องการ — ถ้าเปิด ต้องปักหมุดตำแหน่งห้องเรียนบนแผนที่ด้วย</Step>
                <Step n="6">กด <Chip>Confirm Import</Chip></Step>
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
                <Step n="1">แสดง OTP 6 หลักบน Dashboard — countdown MM:SS บอกเวลาที่เหลือแบบ real-time</Step>
                <Step n="2">กด <Chip>Projector View</Chip> เพื่อฉาย OTP + QR code บนหน้าจอห้องเรียน</Step>
                <Step n="3">นักศึกษาเปิดลิงก์เช็คชื่อ (QR หรือพิมพ์ URL) กรอก OTP + ยืนยัน GPS</Step>
                <Step n="4">ดูรายชื่อแบบ real-time — Present / Late / Absent</Step>
                <Step n="5">คลิกป้ายสถานะรายคนเพื่อแก้ไขตรง ๆ หรือกด <Chip>Review</Chip> เพื่อ Approve/Mark Absent</Step>
                <Step n="6">มีแถบ <strong>Issues</strong> สรุปจำนวนปัญหาแต่ละแบบ — กดที่ป้ายเพื่อกรองรายชื่อให้เหลือเฉพาะคนกลุ่มนั้น (กดซ้ำหรือกด Clear filter เพื่อดูทั้งหมด)</Step>
                <Step n="7">OTP หมดอายุ → session <strong>ปิดอัตโนมัติ</strong> — ไม่จำเป็นต้องกลับมากด Close</Step>
                <Note>
                  ถ้าต้องการให้นักศึกษาเช็คชื่อเพิ่ม กด <strong>Re-Generate OTP</strong> ได้แม้ session จะปิดไปแล้ว ไม่ว่าจะเป็นวันนี้หรือวันก่อนหน้า
                  (ยกเว้น session แบบบันทึกย้อนหลัง) — ระบบจะออก OTP ใหม่ เปิด session ต่อ เริ่มนับเวลาถอยหลังใหม่ทั้งหมด
                  และล้างสถานะ &quot;ขาด&quot; ที่ระบบ auto-mark ไว้ตอนปิดคาบ ให้นักศึกษาเช็คชื่อใหม่ได้ปกติ — ถ้า session
                  ไม่ใช่ของวันนี้จะมีกล่องเตือนสีเหลืองให้ยืนยันก่อน
                </Note>
              </Section>

              <Section title="3a. Review / ⋯ — แก้สถานะรายคน" color="#185FA5">
                <Row label="คลิกป้ายสถานะ">เปลี่ยน Present/Late/Absent/GPS fail ตรง ๆ พร้อมใส่เหตุผล (ถ้ามี)</Row>
                <Row label="ปุ่ม Review"><strong>Approve</strong> — กดครั้งเดียว ยืนยันว่าถูกต้อง (เช่น GPS fail แต่จริง ๆ อยู่ในห้อง) | <strong>Mark Absent</strong> — เปลี่ยนเป็นขาดทันที</Row>
                <Row label="เมนู ⋯">action ที่ใช้ไม่บ่อย — <strong>Flag</strong> (ตั้งข้อสงสัยไว้ตรวจสอบ), <strong>Revoke Approval</strong> (ยกเลิกการ Approve ที่เคยกด), <strong>Delete Record</strong> (ลบ record ทิ้ง กลับเป็น Pending)</Row>
                <Note>กด Approve แล้วระบบจะติดป้าย ✓ พร้อมปัญหาที่เจอ (เช่น &quot;✓ GPS Fail&quot;) ไว้ข้างชื่อให้อัตโนมัติ และบันทึกลง Audit Log ด้วย — ไม่ต้องพิมพ์อะไรเอง</Note>
              </Section>

              <Section title="3b. OTP Duration &amp; Late Threshold" color="#185FA5">
                <Row label="พิมพ์ตัวเลขได้">กรอกตัวเลขในช่องขวาโดยตรง (ความละเอียด 1 นาที) หรือลาก slider</Row>
                <Row label="Max = ความยาวคาบ">ถ้าเรียน 90 นาที → max = 90 | ถ้า Double (180 นาที) → max = 180</Row>
                <Row label="OTP หมดแล้ว Re-Gen">countdown ใน dashboard แสดง MM:SS — เมื่อถึง 00:00 ปิดอัตโนมัติ</Row>
                <Row label="ปิดสถานะสายได้">มี toggle <em>Enable late status</em> ทั้งตอนเปิดคาบและตอน Re-Generate OTP — ปิดแล้วนักศึกษาที่เช็คชื่อช้าจะยังได้ Present (ไม่ขึ้น Late)</Row>
              </Section>

              <Section title="3c. ตรวจจับความผิดปกติอัตโนมัติ (Auto-Flag)" color="#185FA5">
                <Step n="1">ระบบเก็บลายนิ้วมืออุปกรณ์ 2 แบบตอนเช็คชื่อ: แบบทั่วไป (browser/เครื่อง) และแบบ GPU (Canvas/WebGL ซึ่งเหมือนเดิมแม้สลับ browser หรือเปิดโหมดไม่ระบุตัวตนบนเครื่องเดียวกัน)</Step>
                <Step n="2">ถ้าอุปกรณ์เดียวกันเช็คชื่อให้มากกว่า 1 คนในคาบเดียวกัน ทั้งสองฝั่งจะถูกติดป้าย &quot;Auto-Flagged&quot; สีแดงเข้มทันที (ชี้เมาส์ที่ป้ายเพื่อดูว่าซ้ำกับใคร) พร้อมขึ้นแบนเนอร์สรุป &quot;ยืนยันแล้ว&quot; ด้านบนรายชื่อด้วย</Step>
                <Step n="3">ระบบยังเช็คความสมเหตุสมผลของพิกัด GPS ที่ส่งมาด้วย — ความแม่นยำต่ำเกินไป หรือนิ่งสนิทแบบผิดธรรมชาติ (รูปแบบที่มักเจอตอนมีคนปลอมพิกัด) จะติดป้าย Auto-Flagged เช่นกัน แต่เป็นสัญญาณอ่อน อาจเตือนผิดได้ถ้าสัญญาณ GPS ในห้องแย่จริงๆ</Step>
                <Step n="4">ถ้าแค่ IP เดียวกัน และเช็คชื่อใกล้กันทั้งเวลา (≤30 วิ) และตำแหน่ง (≤10 ม.) แต่อุปกรณ์ไม่ตรงกัน — ขึ้นเป็นแบนเนอร์ &quot;น่าสงสัย&quot; แยกต่างหากให้ดูเฉยๆ ไม่ติดป้ายที่ตัวนักศึกษา เพราะ WiFi เดียวกันไม่ได้แปลว่าเป็นคนเดียวกันเสมอไป</Step>
                <Step n="5">ทุกกรณีข้างต้น<strong>ไม่บล็อกการเช็คชื่อ</strong> — แค่เตือนให้ตรวจสอบ กดดูรายชื่อในแบนเนอร์หรือชี้เมาส์ที่ป้าย Auto-Flagged แล้วใช้ Approve/Mark Absent แก้ตามดุลยพินิจ</Step>
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
                <Step n="3">คลิกที่ตัวหัวคอลัมน์ (วันที่/Week label) เพื่อเปิดหน้า session นั้น — ใช้กลับเข้าไปดูรายละเอียดหรือ Re-Generate OTP ของคาบที่ปิดไปแล้ว</Step>
                <Step n="4">hover บน column header — กด <strong>×</strong> มุมขวาบน เพื่อ<strong>ลบ session นั้นถาวร</strong> (มี confirm ก่อน)</Step>
                <Step n="5">กด <Chip>Export .xlsx</Chip> เพื่อดาวน์โหลด — format เดียวกับต้นฉบับ + ข้อมูลเช็คชื่อ</Step>
                <Note>นักศึกษาที่ต่ำกว่า threshold จะถูก highlight — ปรับ threshold ได้มุมบนขวาของตาราง</Note>
              </Section>

              <Section title="7. Audit Log" color="#5F5E5A">
                <p>บันทึกทุก action ในระบบ — เปิด/ปิดคาบ, Override, Delete</p>
                <p className="mt-1 text-gray-500">กรองตาม Course และช่วงวันที่ได้ที่เมนู <Chip>Audit Log</Chip></p>
              </Section>

              <Section title="8. เปิดคาบอัตโนมัติ (Auto-Open)" color="#185FA5">
                <Step n="1">กดเมนู ⋯ บนการ์ดวิชา แล้วเลือก <Chip>Semester Settings</Chip> — หรือตั้งได้ตั้งแต่ขั้นตอน Import เลยก็ได้</Step>
                <Step n="2">เปิด toggle <em>เปิดคาบเรียนอัตโนมัติตามตารางสอน</em></Step>
                <Step n="3">ปักหมุดตำแหน่งห้องเรียนบนแผนที่ — ใช้ตรวจ GPS แทนตำแหน่งอุปกรณ์ เพราะตอนเปิดคาบอัตโนมัติไม่มีใครถืออุปกรณ์อยู่ในห้อง</Step>
                <Step n="4">ตั้ง &quot;เปิดคาบล่วงหน้า&quot; กี่นาทีก่อนเวลาเรียนจริง (ค่าเริ่มต้น 3 นาที, ตั้งเป็น 0 ได้ถ้าอยากให้เปิดตรงเวลาเป๊ะ) — แก้ตัวเลขนี้กลับมาเปลี่ยนทีหลังได้เสมอ</Step>
                <Step n="5">บันทึก — ถึงเวลาตามที่ตั้งไว้ระบบจะเปิดคาบ ออก OTP และแจ้งเตือนให้เอง</Step>
                <Note>ต้อง login เข้าระบบไว้อย่างน้อยหนึ่งครั้งก่อน ระบบถึงจะมี token ไว้เปิดคาบแทนได้ — ถ้า token หมดอายุจะมีแบนเนอร์เตือนให้ login ใหม่บนหน้า Courses</Note>
              </Section>

              <Section title="8a. Classroom Display" color="#185FA5">
                <Step n="1">กด <Chip>Classroom Display</Chip> บนการ์ดวิชา เพื่อรับลิงก์คงที่ของวิชานั้น</Step>
                <Step n="2">เปิดลิงก์นี้ค้างไว้บนจอ/โปรเจกเตอร์ในห้องเรียน — ใช้ลิงก์เดิมได้ทุกคาบ ไม่ต้องเปลี่ยน</Step>
                <Step n="3">หน้าจะเช็คหาคาบที่เปิดอยู่ล่าสุดของวิชานั้นทุก ~10 วินาที แล้วแสดง QR/OTP ให้อัตโนมัติเมื่อมีคาบเปิด</Step>
                <Note>ถ้ายังไม่มีคาบเปิดอยู่ จะขึ้นข้อความ &quot;รอเปิดคาบถัดไป&quot; แทน</Note>
              </Section>

              <Section title="8b. แจ้งเตือนอาจารย์ (Notifications)" color="#185FA5">
                <Step n="1">ไปที่เมนู <Chip>Notifications</Chip></Step>
                <Step n="2">เชื่อมต่อ LINE — กด <Chip>สร้างรหัสเชื่อมต่อ</Chip> เพิ่มเพื่อนบอทของระบบ แล้วส่งรหัสเป็นข้อความหาบอทภายใน 15 นาที</Step>
                <Step n="3">เมื่อเชื่อมสำเร็จ เปิด toggle แจ้งเตือนทาง LINE ได้เลย</Step>
                <Note>ตอนนี้ระบบแจ้งเตือนผ่าน LINE เท่านั้น (ปิดช่องทางอีเมลไว้ชั่วคราว) — ระบบจะแจ้งเตือนเฉพาะตอนเปิดคาบแบบอัตโนมัติเท่านั้น ไม่แจ้งตอนกดเปิดคาบเอง</Note>
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
              <FAQ q="OTP หมดอายุแล้ว จะเกิดอะไรขึ้น?">
                session จะ<strong>ปิดอัตโนมัติ</strong>เมื่อ countdown ถึง 00:00
                — กดปุ่ม <em>Re-Generate OTP</em> เพื่อเปิด session ใหม่พร้อม OTP ชุดใหม่ได้เสมอ ไม่ว่าจะวันไหนก็ตาม
                (ยกเว้น session แบบบันทึกย้อนหลัง) ถ้า session นั้นไม่ใช่ของวันนี้ระบบจะเตือนก่อนให้ยืนยัน
              </FAQ>
              <FAQ q="ต้องการเพิ่มเวลา OTP ให้นานขึ้น?">
                ในหน้า Open Session — ช่อง OTP Expires After พิมพ์ตัวเลขได้โดยตรง (1–N นาที
                โดย N = ความยาวคาบ) หรือลาก slider ความละเอียด 1 นาที
              </FAQ>
              <FAQ q="เวลาเปิด Session แสดงผิด ไม่ตรงกับที่ตั้งไว้ใน semester?">
                ระบบจะ auto-fill เวลาจาก semester config เฉพาะครั้งแรก — หลังจากนั้นจะจำเวลา
                ที่เคยกรอก เปลี่ยนได้ตรง time input บนหน้า Open Session
              </FAQ>
              <FAQ q="Week label คำนวณยังไง อยากกรอกเองได้ไหม?">
                ระบบนับตามสัปดาห์ปฏิทิน (จันทร์–อาทิตย์) โดย W1 คือสัปดาห์ที่มีวันเปิดภาคเรียน —
                เปิดเทอมวันไหนของสัปดาห์ก็ได้ พอถึงวันจันทร์ถัดไปจะขึ้น W2 เสมอ
                ถ้าอยากกรอกเอง แก้ได้ตรง field Week # และ Week Label บนหน้า Open Session รูปแบบ: W1m, W2th ฯลฯ
              </FAQ>
              <FAQ q="ช่องจำนวนสัปดาห์ (Total Weeks) หายไปไหน?">
                ไม่ต้องกรอกแล้วครับ — ตอนนี้กรอกแค่<strong>วันเปิดภาคเรียน</strong>กับ<strong>วันสุดท้ายของภาคเรียน</strong>
                ระบบจะนับจำนวนสัปดาห์ตามปฏิทินให้เอง และแสดงผลลัพธ์ให้เห็นทันทีใต้ช่องวันที่ (เช่น &quot;รวม 16 สัปดาห์&quot;)
              </FAQ>
              <FAQ q="ลบ session ไปแล้วกู้คืนได้ไหม?">
                ไม่ได้ครับ — การลบเป็นถาวร ข้อมูลเช็คชื่อทุกคนในคาบนั้นจะหายไปด้วย
                ระบบจะแสดง confirm dialog ก่อนเสมอ กด <em>ยกเลิก</em> หากไม่แน่ใจ
              </FAQ>
              <FAQ q="Export .xlsx รวม session ทั้งหมดหรือเปล่า?">
                ใช่ครับ — Export รวม session ทุกอันที่อยู่ในตาราง ณ เวลานั้น
                ถ้าลบ session ไปแล้ว session นั้นจะไม่อยู่ใน .xlsx
              </FAQ>
              <FAQ q="เผลอกด Open Session ซ้ำสำหรับวิชาเดิม?">
                ระบบจะแสดงปุ่ม <em>View Active Session</em> แทน — กดเพื่อกลับไปคาบที่เปิดอยู่
              </FAQ>
              <FAQ q="ปุ่ม Quick Open ต่างจาก Open Session ปกติยังไง?">
                <strong>Quick Open</strong> ใช้ค่าทั้งหมดจาก Semester Settings (เวลาเรียน รัศมี GPS OTP)
                และตำแหน่งจากหมุดห้องเรียนที่ปักไว้ — คลิกเดียวจบ ไม่ต้องรอ GPS ล็อก จะขึ้นเฉพาะวันที่มีสอนตาม
                ตารางและปักหมุดแล้ว ส่วน <strong>Open Session</strong> เข้าฟอร์มเต็ม
                ใช้ตอนอยากเปลี่ยนเวลา ตำแหน่ง หรือบันทึกย้อนหลัง
              </FAQ>
              <FAQ q="นักศึกษากรอกรหัสแล้วเห็นชื่อขึ้นมา คืออะไร?">
                ระบบแสดงชื่อ-นามสกุลทันทีที่กรอกรหัสครบ 9 หลัก เพื่อให้นักศึกษายืนยันว่าเป็นตัวเองก่อนกด
                Check In — กันเคสพิมพ์รหัสผิดหนึ่งตัวแล้วไปตรงกับรหัสเพื่อน ถ้ารหัสไม่อยู่ในรายวิชาจะขึ้นเตือน
                และกดเช็คชื่อไม่ได้
              </FAQ>
              <FAQ q="ต้องการลบวิชาทั้งหมดและ import ใหม่?">
                กดเมนู ⋯ บนการ์ดวิชา แล้วเลือก <em>Delete Course</em> — ต้องยืนยันด้วยรหัสวิชา
              </FAQ>
              <FAQ q="ไม่อยากนับ &quot;สาย&quot; เลย ทำยังไง?">
                ปิด toggle <em>Enable late status</em> ได้ทั้งตอนเปิดคาบ (หน้า Open Session) และตอนกด
                <em> Re-Generate OTP</em> — ปิดแล้วนักศึกษาที่เช็คชื่อช้าจะยังได้สถานะ Present ไม่ขึ้น Late
              </FAQ>
              <FAQ q="ระบบตรวจจับอุปกรณ์ซ้ำได้แค่ใน browser เดียวกันหรือเปล่า?">
                ไม่ครับ ตอนนี้ตรวจจับได้ถึงระดับ GPU ของเครื่อง (Canvas/WebGL) ซึ่งเหมือนเดิมแม้สลับ browser
                หรือเปิดโหมดไม่ระบุตัวตน — เคสแบบนี้จะติดป้าย &quot;Auto-Flagged&quot; สีแดงเข้มให้ทั้งสองฝั่งทันทีตอนเช็คชื่อ
                พร้อมขึ้นแบนเนอร์สรุป &quot;ยืนยันแล้ว&quot; ด้วย ส่วนที่แค่ IP เดียวกัน + เวลา/ตำแหน่งใกล้กัน จะขึ้นแยกเป็น
                &quot;น่าสงสัย&quot; ในแบนเนอร์เฉยๆ (ความมั่นใจต่ำกว่า เพราะ WiFi เดียวกันแชร์ IP ให้คนอื่นได้)
              </FAQ>
              <FAQ q="ป้าย Auto-Flagged กับ Flagged ต่างกันยังไง?">
                <strong>Auto-Flagged</strong> (แดงเข้ม) ระบบติดให้เองตอนเช็คชื่อ โดยไม่มีใครกด — เจออุปกรณ์ซ้ำหรือพิกัด
                GPS ดูผิดปกติ ชี้เมาส์ที่ป้ายเพื่อดูเหตุผล ส่วน <strong>Flagged</strong> (ม่วง) คือครูกดตั้งข้อสงสัยเอง
                ผ่านเมนู ⋯ — ทั้งสองแบบไม่บล็อกการเช็คชื่อ แค่เตือนให้กลับมาตรวจสอบทีหลัง
              </FAQ>
              <FAQ q="ทำไมคนที่ GPS แม่นยำปกติดีก็ยังโดน Auto-Flagged?">
                การเช็คความผิดปกติของ GPS เป็นสัญญาณอ่อน (accuracy ต่ำเกินไป หรือพิกัดนิ่งสนิทผิดธรรมชาติ) ซึ่ง
                เกิด false alarm ได้จริงถ้าตึกบังสัญญาณดาวเทียม ไม่ได้แปลว่านักศึกษาคนนั้นโกงเสมอไป — เป็นแค่ตัวช่วย
                ให้ครูรู้ว่าเคสไหนควรดูใกล้ชิดหน่อย กด Approve ได้ตามปกติถ้าตรวจสอบแล้วไม่มีอะไรผิดปกติ
              </FAQ>
              <FAQ q="เผลอกด Close Session แล้วหาคาบนั้นไม่เจอ ทำยังไง?">
                เข้าไปที่ <Chip>Summary</Chip> ของวิชานั้น แล้วคลิกที่หัวคอลัมน์ของ session ที่ปิดไปได้เลย
                — จะพาเข้าหน้า session โดยตรง แล้วกด <em>Re-Generate OTP</em> เพื่อเปิดรับเช็คชื่อต่อได้ทันที
                ไม่ต้องสนใจว่าจะปิดไปนานแค่ไหนหรือข้ามวันแล้ว (ยกเว้น session แบบบันทึกย้อนหลัง)
              </FAQ>
              <FAQ q="กด Approve แล้ว ทำไมป้าย GPS Fail / Late หายไป?">
                สถานะเปลี่ยนเป็น Present/Approved แล้ว แต่ระบบยังจำไว้ให้ — จะเห็นเครื่องหมาย
                <em> ✓ GPS Fail</em> (หรือปัญหาที่เจอ) ตัวเล็ก ๆ สีเทาโผล่ข้างชื่อแทน เป็นการบันทึกอัตโนมัติว่า
                เคสนี้ approve เพราะอะไร โดยไม่ต้องพิมพ์อะไรเอง — ข้อมูลเดียวกันนี้ถูกบันทึกลง Audit Log ด้วย
              </FAQ>
              <FAQ q="ปุ่ม Flag, Revoke Approval, Delete Record หายไปไหน?">
                ย้ายไปอยู่ในเมนู <Chip>⋯</Chip> ท้ายแถวแล้ว เพราะใช้ไม่บ่อยเท่า Approve/Mark Absent — Flag
                จะโผล่เฉพาะตอนยังไม่ได้ flag, Revoke Approval โผล่เฉพาะตอนเคย Approve ไปแล้ว
              </FAQ>
              <FAQ q="เปิดคาบอัตโนมัติแล้ว ไม่มีใครอยู่ในห้อง นักศึกษาจะเห็น OTP จากไหน?">
                ใช้ได้ 2 ทาง — เปิด <Chip>Classroom Display</Chip> ค้างไว้บนจอห้องเรียน (จะโชว์ QR/OTP ให้เองเมื่อคาบเปิด)
                หรือให้ระบบแจ้งเตือน OTP มาที่อาจารย์ทาง LINE ตั้งค่าได้ที่เมนู <Chip>Notifications</Chip>
              </FAQ>
              <FAQ q="ทำไมไม่ได้รับแจ้งเตือนตอนเปิดคาบอัตโนมัติ?">
                เช็ค 3 อย่าง: (1) เปิด toggle LINE ไว้ในหน้า Notifications แล้วหรือยัง (2) token ยังไม่หมดอายุ —
                ดูแบนเนอร์เตือนบนหน้า Courses ถ้าหมดต้อง login ใหม่ (3) แจ้งเตือนทำงานเฉพาะตอนระบบเปิดคาบ
                <em>อัตโนมัติ</em>เท่านั้น ถ้ากดเปิดคาบเองจะไม่มีการแจ้งเตือน
              </FAQ>
              <FAQ q="อยากให้ได้รับ OTP ก่อนคาบเริ่ม ไม่ใช่พอดีหรือหลังเริ่มคาบ ทำยังไง?">
                ปรับค่า &quot;เปิดคาบล่วงหน้า&quot; ในหน้า Semester Settings (การ์ด Auto-Open) เป็นจำนวนนาทีที่ต้องการ
                เช่นตั้ง 3 นาที — ถ้าคาบเรียนตามตารางคือ 11:51 ระบบจะเปิดคาบและส่งแจ้งเตือนตอน 11:48 แทน
                (คลาดเคลื่อนได้ ±1-2 นาทีตามรอบเช็คของระบบ) ตั้งเป็น 0 ถ้าอยากให้เปิดตรงเวลาเป๊ะเหมือนเดิม —
                แก้ค่านี้กลับไปกลับมาได้ตลอดเวลา ไม่ต้องรอรอบถัดไป
              </FAQ>
              <FAQ q="ทำไมไม่มีตัวเลือกแจ้งเตือนทางอีเมลแล้ว?">
                ปิดไว้ชั่วคราว — Resend (ผู้ให้บริการส่งอีเมล) ไม่คิดเงินสำหรับปริมาณที่ระบบนี้ใช้ก็จริง แต่การ
                ส่งอีเมลหาคนอื่นที่ไม่ใช่เจ้าของบัญชี Resend เอง ต้อง verify โดเมนของตัวเองก่อน ซึ่งต้องมีโดเมน
                เป็นของตัวเอง (ต้องซื้อ ไม่ใช่ของฟรี) จึงปิดช่องทางนี้ไว้ก่อนแล้วใช้ <strong>LINE</strong> แทน
                ซึ่งฟรีและไม่มีข้อจำกัดนี้
              </FAQ>
              <FAQ q="เชื่อมต่อ LINE ไม่สำเร็จ หรือส่งรหัสไปแล้วบอทไม่ตอบ?">
                ตรวจว่าเพิ่มเพื่อนบอทของระบบแล้ว และส่งรหัสเป็นข้อความก่อนหมดเวลา 15 นาที — ถ้ารหัสหมดอายุ
                กลับไปกด <Chip>สร้างรหัสเชื่อมต่อ</Chip> ใหม่ในหน้า Notifications แล้วลองอีกครั้ง
              </FAQ>
              <FAQ q="เห็นแบนเนอร์แดง &quot;ยังไม่ได้ตั้งค่า Redis&quot; บนหน้า Courses คืออะไร?">
                เป็นปัญหาระดับการติดตั้งระบบ (deployment) ไม่ใช่บัญชีของอาจารย์คนใดคนหนึ่ง — เกิดขึ้นเมื่อระบบรันอยู่บน
                Vercel แต่ยังไม่ได้ผูก Redis (Upstash) ไว้ ทำให้ session เช็คชื่อและ token ของระบบเปิดคาบอัตโนมัติอาจ
                ทำงานไม่เสถียร แบนเนอร์นี้<strong>ปิดเองไม่ได้</strong>และจะขึ้นให้อาจารย์ทุกคนเห็นจนกว่าผู้ดูแลระบบ
                (ทีมพัฒนา/ผู้ดูแล deployment) จะตั้งค่า environment variable แล้ว deploy ใหม่ — ไม่ใช่สิ่งที่อาจารย์
                ต้องแก้เอง แต่ควรแจ้งผู้ดูแลระบบทันทีถ้าเห็นแบนเนอร์นี้
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
