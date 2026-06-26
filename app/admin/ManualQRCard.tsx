"use client";
import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { IconDownload } from "@/components/icons";

export default function ManualQRCard() {
  const [checkUrl, setCheckUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setCheckUrl(window.location.origin + "/check");
  }, []);

  useEffect(() => {
    if (!checkUrl) return;
    QRCode.toDataURL(checkUrl, { width: 400, margin: 2 }).then(setQrDataUrl);
  }, [checkUrl]);

  const download = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = "attendance-qr-manual.png";
    a.click();
  };

  const print = () => {
    if (!qrDataUrl) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Attendance QR</title><style>
      body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; }
      img { width: 300px; height: 300px; }
      p { font-size: 14px; color: #555; margin-top: 12px; word-break: break-all; max-width: 300px; text-align: center; }
    </style></head><body>
      <img src="${qrDataUrl}" alt="Manual Check-in QR" />
      <p>${checkUrl}</p>
      <script>window.onload = function() { window.print(); }<\/script>
    </body></html>`);
    win.document.close();
  };

  return (
    <div className="card mt-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-medium text-gray-900">QR Code สำหรับติดห้องเรียน</h2>
        <button
          onClick={() => setOpen((v) => !v)}
          className="btn-outline text-[13px]"
          style={{ minHeight: 36 }}
        >
          {open ? "ซ่อน" : "แสดง QR"}
        </button>
      </div>
      <p className="text-[11px] text-gray-400">
        QR Code นี้ใช้ได้ถาวร · นักศึกษาสแกนแล้วกรอก OTP จากกระดานด้วยตัวเอง · เหมาะสำหรับปริ้นติดไว้หน้าห้อง
      </p>

      {open && (
        <div className="flex flex-col items-center gap-4 pt-4 mt-3 border-t border-gray-100">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Manual check-in QR"
              width={200}
              height={200}
              style={{ imageRendering: "crisp-edges" }}
            />
          ) : (
            <div className="w-[200px] h-[200px] rounded-lg bg-gray-100 animate-pulse" />
          )}
          <p className="text-[11px] font-mono text-gray-400 break-all text-center max-w-xs">{checkUrl}</p>
          <div className="flex gap-2">
            <button onClick={download} className="btn-outline text-[13px] flex items-center gap-1.5" style={{ minHeight: 36 }}>
              <IconDownload size={13} /> Download PNG
            </button>
            <button onClick={print} className="btn-outline text-[13px]" style={{ minHeight: 36 }}>
              Print
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
