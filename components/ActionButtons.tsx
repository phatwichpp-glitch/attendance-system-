"use client";

export type ActionType = "approve" | "flag" | "mark_absent" | "revoke";

interface ActionButtonsProps {
  overridden: boolean;
  onAction: (action: ActionType) => void;
  disabled?: boolean;
}

// Two frequent actions, always visible side by side — no dropdown to open first.
// Flag / Revoke / Delete / Edit Status are rare, so they live in the row's "⋯" menu instead.
export default function ActionButtons({ overridden, onAction, disabled }: ActionButtonsProps) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {!overridden && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAction("approve")}
          className="px-2.5 py-1.5 rounded text-sm font-medium border border-transparent hover:border-current disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "#EAF3DE", color: "#3B6D11" }}
        >
          Approve
        </button>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAction("mark_absent")}
        className="px-2.5 py-1.5 rounded text-sm font-medium border border-transparent hover:border-current disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}
      >
        Mark Absent
      </button>
    </div>
  );
}
