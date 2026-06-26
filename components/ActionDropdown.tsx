"use client";

import { useState, useRef, useEffect } from "react";

export type ActionType = "approve" | "flag" | "mark_absent" | "revoke";

interface ActionOption {
  action: ActionType;
  label: string;
  description: string;
  className: string;
}

const ACTIONS: ActionOption[] = [
  {
    action: "approve",
    label: "Approve",
    description: "Mark as verified present",
    className: "text-green-700 hover:bg-green-50",
  },
  {
    action: "flag",
    label: "Flag",
    description: "Mark as suspicious",
    className: "text-purple-700 hover:bg-purple-50",
  },
  {
    action: "mark_absent",
    label: "Mark Absent",
    description: "Override to absent",
    className: "text-red-700 hover:bg-red-50",
  },
  {
    action: "revoke",
    label: "Revoke",
    description: "Remove approval",
    className: "text-gray-700 hover:bg-gray-50",
  },
];

interface ActionDropdownProps {
  status: string;
  overridden: boolean;
  flagged?: boolean;
  actionTaken?: string | null;
  onAction: (action: ActionType) => void;
  disabled?: boolean;
}

export default function ActionDropdown({
  status,
  overridden,
  flagged,
  actionTaken,
  onAction,
  disabled,
}: ActionDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Compute current status label
  let statusLabel = "Review";
  let statusClass = "bg-gray-100 text-gray-700";
  if (overridden) {
    statusLabel = "Approved";
    statusClass = "bg-green-100 text-green-700";
  } else if (status === "absent" && actionTaken === "mark_absent") {
    statusLabel = "Absent";
    statusClass = "bg-red-100 text-red-700";
  } else if (flagged) {
    statusLabel = "Flagged";
    statusClass = "bg-purple-100 text-purple-700";
  }

  // Filter relevant actions
  const availableActions = ACTIONS.filter((a) => {
    if (a.action === "approve" && overridden) return false;
    if (a.action === "revoke" && !overridden) return false;
    if (a.action === "flag" && flagged) return false;
    return true;
  });

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${statusClass} border-transparent hover:border-current disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {statusLabel}
        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-44 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5">
          <div className="py-1">
            {availableActions.map((opt) => (
              <button
                key={opt.action}
                onClick={() => { onAction(opt.action); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs ${opt.className}`}
              >
                <div className="font-medium">{opt.label}</div>
                <div className="text-gray-400 text-[10px]">{opt.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
