"use client";
import { useState, useEffect } from "react";

// Common no-class-date reasons pre-filled as a dropdown so labels stay
// consistent across entries (free text drifted: "สอบกลาง" vs "สอบกลางภาค" vs
// "Midterm") — "อื่นๆ" still allows any custom text for cases not covered.
const PRESETS = ["สอบกลางภาค", "สอบปลายภาค", "วันหยุดพิเศษ/ติดธุระ"];
const CUSTOM = "__custom__";

export default function BlackoutLabelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [mode, setMode] = useState<string>(PRESETS.includes(value) ? value : value ? CUSTOM : "");

  // Keeps the dropdown in sync when the parent resets `value` to "" after a
  // successful add, or when it's initialized to an already-saved preset.
  useEffect(() => {
    if (PRESETS.includes(value)) setMode(value);
    else if (value === "") setMode("");
  }, [value]);

  const handleSelect = (v: string) => {
    setMode(v);
    if (v !== CUSTOM) onChange(v);
    else onChange("");
  };

  return (
    <div className="space-y-2">
      <select
        className="input text-[13px] w-full"
        value={mode}
        onChange={(e) => handleSelect(e.target.value)}
      >
        <option value="" disabled>เลือกประเภทช่วงเวลา</option>
        {PRESETS.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
        <option value={CUSTOM}>อื่นๆ (พิมพ์เอง)</option>
      </select>
      {mode === CUSTOM && (
        <input
          type="text"
          className="input text-[13px] w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="พิมพ์ชื่อช่วงเวลาเอง"
          autoFocus
        />
      )}
    </div>
  );
}
