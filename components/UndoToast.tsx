"use client";

import { useEffect, useState } from "react";

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  durationMs?: number;
  // Position index within a stack of simultaneous toasts (0 = bottom-most),
  // so correcting several students in a row doesn't drop earlier undos —
  // each gets its own timer/instance instead of sharing one slot.
  stackIndex?: number;
}

export default function UndoToast({ message, onUndo, onDismiss, durationMs = 5000, stackIndex = 0 }: UndoToastProps) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p - (100 / (durationMs / 100));
        if (next <= 0) {
          clearInterval(interval);
          onDismiss();
          return 0;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [durationMs, onDismiss]);

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-50 flex flex-col gap-0 shadow-lg rounded-lg overflow-hidden min-w-72"
      style={{ bottom: 16 + stackIndex * 64 }}
    >
      <div className="flex items-center gap-3 bg-gray-800 text-white px-4 py-3">
        <span className="text-sm flex-1">{message}</span>
        <button
          onClick={() => { onUndo(); onDismiss(); }}
          className="text-sm font-medium text-yellow-300 hover:text-yellow-100 shrink-0"
        >
          Undo
        </button>
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-white shrink-0"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
      <div className="h-1 bg-gray-700">
        <div
          className="h-full bg-yellow-400 transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
