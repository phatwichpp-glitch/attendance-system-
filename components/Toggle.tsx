export default function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between select-none min-h-[44px] ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <span className="text-[13px] text-gray-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0"
        style={{ backgroundColor: checked ? "#185FA5" : "#d1d5db", cursor: disabled ? "not-allowed" : "pointer" }}
      >
        <span
          className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform"
          style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
        />
      </button>
    </label>
  );
}
