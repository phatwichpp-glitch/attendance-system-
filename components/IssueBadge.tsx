"use client";

export type IssueType = "gps_fail" | "device_conflict" | "late" | "manual" | "flagged" | "auto_flag";

interface IssueBadgeProps {
  type: IssueType;
  title?: string;
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
  // System-raised at check-in time (device conflict or GPS anomaly) — kept visually
  // distinct (dark red, not purple) from a teacher's manual "flag" so it stands out
  // as something nobody has reviewed yet.
  auto_flag: {
    label: "Auto-Flagged",
    className: "bg-red-200 text-red-900 border border-red-600",
  },
};

export default function IssueBadge({ type, title }: IssueBadgeProps) {
  const config = BADGE_CONFIG[type];
  return (
    <span
      title={title}
      className={`inline-flex items-center px-2 py-1 rounded text-sm font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
