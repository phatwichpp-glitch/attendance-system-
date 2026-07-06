"use client";
import { useState, useEffect, useCallback } from "react";
import Spinner from "@/components/Spinner";
import Toggle from "@/components/Toggle";
import ResendGuideModal from "./ResendGuideModal";

interface Prefs {
  email_notify: boolean;
  notify_email: string;
  line_notify: boolean;
  line_linked: boolean;
  last_notify_error: string | null;
  last_notify_at: string | null;
  resend_configured: boolean;
  line_available: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LINE_ADD_FRIEND_URL = process.env.NEXT_PUBLIC_LINE_BOT_ADD_FRIEND_URL;

export default function NotificationsClient() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [linkCode, setLinkCode] = useState("");
  const [generatingCode, setGeneratingCode] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sheets/notification-prefs");
      const d = await res.json();
      setPrefs(d);
      setEmailDraft(d.notify_email ?? "");
    } catch {
      setError("โหลดการตั้งค่าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (partial: { email_notify?: boolean; notify_email?: string; line_notify?: boolean }) => {
    if (!prefs) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/sheets/notification-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(
          d.error === "resend_key_required"
            ? "ตั้งค่า Resend API Key ก่อนถึงจะเปิดแจ้งเตือนทางอีเมลได้"
            : "บันทึกไม่สำเร็จ"
        );
        return;
      }
      setPrefs((p) => (p ? { ...p, ...d } : p));
      if (partial.notify_email !== undefined) {
        setEmailDraft(d.notify_email ?? "");
        setEmailSaved(true);
        setTimeout(() => setEmailSaved(false), 2000);
      }
    } catch {
      setError("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const saveEmailDraft = () => {
    const trimmed = emailDraft.trim();
    if (trimmed && !EMAIL_RE.test(trimmed)) {
      setError("รูปแบบอีเมลไม่ถูกต้อง");
      return;
    }
    save({ notify_email: trimmed });
  };

  const saveApiKey = async () => {
    const trimmed = apiKeyDraft.trim();
    if (!trimmed) return;
    if (!/^re_/.test(trimmed)) {
      setKeyError("API Key ของ Resend ต้องขึ้นต้นด้วย re_ — ตรวจสอบว่าคัดลอกมาครบ");
      return;
    }
    setSavingKey(true);
    setKeyError("");
    try {
      const res = await fetch("/api/sheets/notification-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resend_api_key: trimmed }),
      });
      const d = await res.json();
      if (!res.ok) { setKeyError("บันทึก API Key ไม่สำเร็จ"); return; }
      setPrefs((p) => (p ? { ...p, ...d } : p));
      setApiKeyDraft("");
    } catch {
      setKeyError("บันทึก API Key ไม่สำเร็จ");
    } finally {
      setSavingKey(false);
    }
  };

  const clearApiKey = async () => {
    if (!confirm("ลบ Resend API Key นี้ออกจากระบบ? การแจ้งเตือนทางอีเมลจะถูกปิดไปด้วย")) return;
    setSavingKey(true);
    try {
      const res = await fetch("/api/sheets/notification-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resend_api_key: "" }),
      });
      const d = await res.json();
      setPrefs((p) => (p ? { ...p, ...d } : p));
    } finally {
      setSavingKey(false);
    }
  };

  const sendTestEmail = async () => {
    setTestingEmail(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/sheets/notification-prefs/test-email", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "failed");
      setTestResult({ ok: true, message: `ส่งอีเมลทดสอบไปที่ ${d.sent_to} แล้ว — ลองเช็คกล่องจดหมาย` });
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error && e.message !== "failed"
          ? e.message
          : "ส่งอีเมลทดสอบไม่สำเร็จ",
      });
    } finally {
      setTestingEmail(false);
    }
  };

  const generateCode = async () => {
    setGeneratingCode(true);
    setError("");
    try {
      const res = await fetch("/api/sheets/notification-prefs/link-code", { method: "POST" });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setLinkCode(d.code);
    } catch {
      setError("สร้างรหัสไม่สำเร็จ");
    } finally {
      setGeneratingCode(false);
    }
  };

  const unlinkLine = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/sheets/notification-prefs", { method: "DELETE" });
      const d = await res.json();
      setPrefs((p) => (p ? { ...p, ...d } : p));
      setLinkCode("");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !prefs) {
    return <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-[#185FA5]" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px]" style={{ color: "#5F5E5A" }}>
        รับการแจ้งเตือนพร้อม OTP ทันทีที่ระบบเปิดคาบเรียนอัตโนมัติ
      </p>

      {prefs.last_notify_error && (
        <div className="rounded-lg px-4 py-3 text-[12px]" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>
          การแจ้งเตือนครั้งล่าสุดส่งไม่สำเร็จ
          {prefs.last_notify_at && ` (${new Date(prefs.last_notify_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })})`}
          : {prefs.last_notify_error}
        </div>
      )}

      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium text-gray-900">อีเมล</h2>
          <button
            onClick={() => setShowGuide(true)}
            className="btn-outline text-[12px] shrink-0"
            style={{ minHeight: 30, padding: "5px 10px" }}
          >
            วิธีสมัครและตั้งค่า Resend
          </button>
        </div>

        <Toggle
          label="แจ้งเตือนทางอีเมล"
          checked={prefs.email_notify}
          disabled={!prefs.resend_configured}
          onChange={(v) => save({ email_notify: v })}
        />

        {!prefs.resend_configured ? (
          <div className="space-y-2">
            <p className="text-[12px]" style={{ color: "#5F5E5A" }}>
              ต้องมี Resend API Key ของตัวเองก่อนถึงจะเปิดใช้งานได้ — กด &quot;วิธีสมัครและตั้งค่า Resend&quot;
              ด้านบนถ้ายังไม่เคยทำ แล้ววาง API Key ที่ได้ลงในช่องนี้
            </p>
            <div className="flex gap-2">
              <input
                type={showApiKey ? "text" : "password"}
                className="input text-[13px] flex-1 font-mono"
                value={apiKeyDraft}
                onChange={(e) => setApiKeyDraft(e.target.value)}
                placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <label className="flex items-center gap-1 text-[11px] shrink-0" style={{ color: "#5F5E5A" }}>
                <input type="checkbox" checked={showApiKey} onChange={(e) => setShowApiKey(e.target.checked)} />
                แสดง
              </label>
              <button
                onClick={saveApiKey}
                disabled={savingKey || !apiKeyDraft.trim()}
                className="btn-primary text-[13px] px-3 shrink-0"
                style={{ minHeight: 36 }}
              >
                {savingKey && <Spinner className="h-4 w-4" />} บันทึก
              </button>
            </div>
            {keyError && <p className="text-[11px]" style={{ color: "#A32D2D" }}>{keyError}</p>}
          </div>
        ) : (
          <>
            <div>
              <label className="block text-[12px] text-gray-500 mb-1">ส่งไปที่อีเมล</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  className="input text-[13px] flex-1"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  placeholder="you@example.com"
                />
                <button
                  onClick={saveEmailDraft}
                  disabled={saving || emailDraft.trim() === prefs.notify_email}
                  className="btn-outline text-[13px] px-3"
                  style={{ minHeight: 36 }}
                >
                  บันทึก
                </button>
              </div>
              {emailSaved && (
                <p className="text-[11px] mt-1" style={{ color: "#3B6D11" }}>บันทึกแล้ว ✓</p>
              )}
              <p className="text-[11px] mt-1" style={{ color: "#9ca3af" }}>
                ต้องตรงกับอีเมลที่ใช้สมัคร Resend เท่านั้น — บัญชี Resend แบบไม่ verify domain ส่งได้เฉพาะหาอีเมล
                เจ้าของบัญชีเอง (ค่าเริ่มต้นคืออีเมลที่ใช้ล็อกอิน)
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={sendTestEmail}
                disabled={testingEmail}
                className="btn-outline text-[13px]"
                style={{ minHeight: 36 }}
              >
                {testingEmail && <Spinner className="h-4 w-4" />} ส่งอีเมลทดสอบ
              </button>
              <button
                onClick={clearApiKey}
                disabled={savingKey}
                className="text-[12px] underline"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#A32D2D" }}
              >
                ลบ API Key
              </button>
            </div>
            {testResult && (
              <p className="text-[11px]" style={{ color: testResult.ok ? "#3B6D11" : "#A32D2D" }}>
                {testResult.message}
              </p>
            )}
          </>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium text-gray-900">LINE</h2>
        {!prefs.line_available ? (
          <p className="text-[12px]" style={{ color: "#A0671C" }}>ระบบยังไม่ได้ตั้งค่า LINE Official Account</p>
        ) : prefs.line_linked ? (
          <>
            <p className="text-[13px]" style={{ color: "#3B6D11" }}>เชื่อมต่อบัญชี LINE แล้ว ✓</p>
            <Toggle
              label="แจ้งเตือนทาง LINE"
              checked={prefs.line_notify}
              onChange={(v) => save({ line_notify: v })}
            />
            <button onClick={unlinkLine} disabled={saving} className="btn-outline text-[13px]" style={{ minHeight: 36 }}>
              ยกเลิกการเชื่อมต่อ LINE
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <ol className="text-[13px] list-decimal list-inside space-y-1" style={{ color: "#5F5E5A" }}>
              {LINE_ADD_FRIEND_URL && (
                <li>
                  <a href={LINE_ADD_FRIEND_URL} target="_blank" rel="noreferrer" style={{ color: "#185FA5" }}>
                    เพิ่มเพื่อนบอท LINE ของระบบ
                  </a>
                </li>
              )}
              <li>กดปุ่ม &quot;สร้างรหัสเชื่อมต่อ&quot; ด้านล่าง</li>
              <li>ส่งรหัสที่ได้เป็นข้อความหาบอทใน LINE</li>
            </ol>
            {linkCode ? (
              <div className="rounded-lg px-4 py-3 text-center" style={{ backgroundColor: "#E6F1FB" }}>
                <p className="text-[11px]" style={{ color: "#5F5E5A" }}>รหัสของคุณ (หมดอายุใน 15 นาที)</p>
                <p className="text-[24px] font-mono font-bold tracking-widest" style={{ color: "#185FA5" }}>{linkCode}</p>
              </div>
            ) : (
              <button onClick={generateCode} disabled={generatingCode} className="btn-primary text-[13px]" style={{ minHeight: 36 }}>
                {generatingCode && <Spinner className="h-4 w-4" />} สร้างรหัสเชื่อมต่อ
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-[13px]" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>
          {error}
        </div>
      )}

      {showGuide && <ResendGuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}
