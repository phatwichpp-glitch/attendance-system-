"use client";

export type ActionType = "approve" | "flag" | "mark_absent" | "revoke";

interface ActionButtonsProps {
  overridden: boolean;
  onAction: (action: ActionType) => void;
  disabled?: boolean;
}

// Two frequent actions, always visible side by side — no dropdown to open first.
// Flag / Revoke / Delete / Edit Status are rare, so they live in the row's "⋯" menu instead.
//
// .btn-row-approve/.btn-row-absent use the same recipe as the app's .btn-outline/.btn-danger
// (transparent fill + solid border, fills in on hover) — deliberately the opposite of the
// status/issue tags (light fill + thin border, no hover) so it's clear what's clickable.
export default function ActionButtons({ overridden, onAction, disabled }: ActionButtonsProps) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {!overridden && (
        <button type="button" disabled={disabled} onClick={() => onAction("approve")} className="btn-row-approve">
          Approve
        </button>
      )}
      <button type="button" disabled={disabled} onClick={() => onAction("mark_absent")} className="btn-row-absent">
        Mark Absent
      </button>
    </div>
  );
}
