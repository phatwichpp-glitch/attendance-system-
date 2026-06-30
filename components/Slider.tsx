"use client";

export default function Slider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-[13px] mb-1">
        <label className="text-gray-700">{label}</label>
        <span className="font-medium" style={{ color: "#185FA5" }}>{value} {unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full"
        style={{ accentColor: "#185FA5", touchAction: "none" }}
      />
    </div>
  );
}
