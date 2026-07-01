"use client";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Spinner from "@/components/Spinner";
import ProjectorClient from "@/app/projector/[sessionId]/ProjectorClient";

const POLL_MS = 10_000;

// Stable, bookmarkable per-course/section classroom display. Unlike /projector/[sessionId]
// (which needs a specific session's id, generated fresh each time a session opens), this
// resolves "whichever session is open right now" itself — so a classroom screen left
// pointed at this URL keeps working across auto-opened sessions with no one touching it.
export default function CourseProjectorClient({ courseId }: { courseId: string }) {
  const searchParams = useSearchParams();
  const section = searchParams.get("section");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const poll = useCallback(async () => {
    if (!section) return;
    try {
      const res = await fetch(
        `/api/sheets/sessions/current?course_id=${encodeURIComponent(courseId)}&section=${encodeURIComponent(section)}`
      );
      const d = await res.json();
      setSessionId(d.session?.session_id ?? null);
    } catch {
      // keep showing whatever we last had rather than flashing to idle on a network blip
    } finally {
      setChecked(true);
    }
  }, [courseId, section]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  if (!section) {
    return (
      <div className="flex items-center justify-center min-h-screen text-center px-4">
        <p className="text-gray-500 text-[14px]">ต้องระบุ ?section= ใน URL</p>
      </div>
    );
  }

  if (!checked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner className="h-8 w-8 text-[#185FA5]" />
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center px-4 gap-2">
        <p className="text-gray-400 text-[16px]">รอเปิดคาบถัดไป...</p>
        <p className="text-gray-300 text-[12px]">{courseId} · Sec.{section}</p>
      </div>
    );
  }

  return <ProjectorClient key={sessionId} sessionId={sessionId} />;
}
