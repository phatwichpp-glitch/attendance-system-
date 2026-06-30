"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

export type ActionType = "approve" | "flag" | "mark_absent" | "revoke";

interface ActionOption {
  action: ActionType;
  label: string;
  description: string;
  className: string;
}

const ACTIONS: ActionOption[] = [
  { action: "approve",      label: "Approve",      description: "Mark as verified present", className: "text-green-700 hover:bg-green-50" },
  { action: "flag",         label: "Flag",         description: "Mark as suspicious",       className: "text-purple-700 hover:bg-purple-50" },
  { action: "mark_absent",  label: "Mark Absent",  description: "Override to absent",       className: "text-red-700 hover:bg-red-50" },
  { action: "revoke",       label: "Revoke",       description: "Remove approval",          className: "text-gray-700 hover:bg-gray-50" },
];

const DROPDOWN_HEIGHT = 160;
const DROPDOWN_WIDTH  = 220;

interface DropPos {
  top: number;
  left: number;
  openUpward: boolean;
}

interface ActionDropdownProps {
  status: string;
  overridden: boolean;
  flagged?: boolean;
  actionTaken?: string | null;
  onAction: (action: ActionType) => void;
  disabled?: boolean;
}

export default function ActionDropdown({
  status, overridden, flagged, actionTaken, onAction, disabled,
}: ActionDropdownProps) {
  const [open, setOpen]   = useState(false);
  const [pos, setPos]     = useState<DropPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef    = useRef<HTMLDivElement>(null);

  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect       = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < DROPDOWN_HEIGHT && (spaceAbove >= DROPDOWN_HEIGHT || spaceAbove > spaceBelow);
    const alignRight = rect.right + DROPDOWN_WIDTH > window.innerWidth;
    setPos({
      top:  openUpward ? rect.top - DROPDOWN_HEIGHT - 4 : rect.bottom + 4,
      left: alignRight ? rect.right - DROPDOWN_WIDTH   : rect.left,
      openUpward,
    });
  }, []);

  // Recalculate on scroll / resize while open
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", calcPos, true);
    window.addEventListener("resize",  calcPos);
    return () => {
      window.removeEventListener("scroll", calcPos, true);
      window.removeEventListener("resize",  calcPos);
    };
  }, [open, calcPos]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = () => {
    if (open) { setOpen(false); return; }
    calcPos();
    setOpen(true);
  };

  // Status label
  let statusLabel = "Review";
  let statusClass = "bg-gray-100 text-gray-700";
  if (overridden) {
    statusLabel = "Approved"; statusClass = "bg-green-100 text-green-700";
  } else if (status === "absent" && actionTaken === "mark_absent") {
    statusLabel = "Absent"; statusClass = "bg-red-100 text-red-700";
  } else if (flagged) {
    statusLabel = "Flagged"; statusClass = "bg-purple-100 text-purple-700";
  }

  const available = ACTIONS.filter((a) => {
    if (a.action === "approve" && overridden) return false;
    if (a.action === "revoke"  && !overridden) return false;
    if (a.action === "flag"    && flagged) return false;
    return true;
  });

  const portal = open && pos ? createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top:   pos.top,
        left:  pos.left,
        width: DROPDOWN_WIDTH,
        zIndex: 9999,
        animation: "dd-appear 0.15s ease",
        transformOrigin: pos.openUpward ? "bottom center" : "top center",
      }}
      className="rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5"
    >
      {/* keyframe shared by all dd-appear animations on page */}
      <style>{`@keyframes dd-appear{from{opacity:0;transform:scaleY(0.92)}to{opacity:1;transform:scaleY(1)}}`}</style>
      <div className="py-1">
        {available.map((opt) => (
          <button
            key={opt.action}
            onClick={() => { onAction(opt.action); setOpen(false); }}
            className={`w-full text-left px-3 py-2.5 text-sm ${opt.className}`}
          >
            <div className="font-medium">{opt.label}</div>
            <div className="text-gray-400 text-[12px]">{opt.description}</div>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div className="inline-block">
      <button
        ref={triggerRef}
        disabled={disabled}
        onClick={handleToggle}
        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-sm font-medium border ${statusClass} border-transparent hover:border-current disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {statusLabel}
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {portal}
    </div>
  );
}
