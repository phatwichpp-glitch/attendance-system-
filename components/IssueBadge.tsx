"use client";

export type IssueType = "gps_fail" | "device_conflict" | "late" | "manual" | "flagged";

interface IssueBadgeProps {
  type: IssueType;
}

const BADGE_CONFIG: Record<IssueType, { label: string; className: string }> = {
  gps_fail: {
    label: "GPS Fail",
    className: "bg-red-100 text-red-700 border border-red-300",
  },
  device_conflict: {
    label: "Same Device",
    className: "bg-orange-100 text-orange-700 border border-orange-300",
  },
  late: {
    label: "Late",
    className: "bg-yellow-100 text-yellow-700 border border-yellow-300",
  },
  manual: {
    label: "Manual",
    className: "bg-blue-100 text-blue-700 border border-blue-300",
  },
  flagged: {
    label: "Flagged",
    className: "bg-purple-100 text-purple-700 border border-purple-300",
  },
};

export default function IssueBadge({ type }: IssueBadgeProps) {
  const config = BADGE_CONFIG[type];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
