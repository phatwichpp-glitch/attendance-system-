import { AttendanceRecord, ConflictReason, DeviceConflict } from "@/types";
import { calculateDistance } from "@/lib/haversine";

const PROXIMITY_TIME_MS = 30_000; // checked in within 30s of each other
const PROXIMITY_DISTANCE_M = 10;  // and within 10m of each other

// Groups attendance records into device-conflict clusters using whichever signal
// matches: exact device_fingerprint (UA-based), exact device_fingerprint_gpu
// (canvas/WebGL — stable across browsers/incognito on the same hardware), or the
// same IP address combined with a tight check-in time + GPS proximity window.
// Fingerprint/GPU matches are "confirmed" (same device); IP+proximity alone is
// "possible" (same network and roughly the same spot at the same time) since campus
// WiFi can share one IP across many unrelated students.
export function buildDeviceConflicts(attendance: AttendanceRecord[]): DeviceConflict[] {
  const n = attendance.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function union(a: number, b: number) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  const pairReasons: { i: number; j: number; reason: ConflictReason }[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = attendance[i], b = attendance[j];
      let reason: ConflictReason | null = null;

      if (a.device_fingerprint && a.device_fingerprint === b.device_fingerprint) {
        reason = "fingerprint";
      } else if (a.device_fingerprint_gpu && a.device_fingerprint_gpu === b.device_fingerprint_gpu) {
        reason = "fingerprint_gpu";
      } else if (
        a.ip_address && a.ip_address === b.ip_address &&
        a.lat != null && a.lng != null && b.lat != null && b.lng != null &&
        Math.abs(new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()) <= PROXIMITY_TIME_MS &&
        calculateDistance(a.lat, a.lng, b.lat, b.lng) <= PROXIMITY_DISTANCE_M
      ) {
        reason = "ip_proximity";
      }

      if (reason) {
        union(i, j);
        pairReasons.push({ i, j, reason });
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  const conflicts: DeviceConflict[] = [];
  let idx = 0;
  for (const [root, members] of groups) {
    if (members.length < 2) continue;

    const reasons = new Set<ConflictReason>();
    for (const pr of pairReasons) {
      if (find(pr.i) === root) reasons.add(pr.reason);
    }
    const tier: DeviceConflict["tier"] =
      reasons.has("fingerprint") || reasons.has("fingerprint_gpu") ? "confirmed" : "possible";

    conflicts.push({
      id: `conflict-${idx++}`,
      fingerprint: attendance[members[0]].device_fingerprint || "",
      tier,
      reasons: [...reasons],
      students: members.map((mi) => {
        const a = attendance[mi];
        return {
          student_id: a.student_id, firstname: a.firstname, lastname: a.lastname,
          checked_at: a.checked_at, status: a.status,
        };
      }),
    });
  }
  return conflicts;
}
