import { useState, useEffect } from "react";

interface ClockData {
  date: string;
  time: string;
  timeShort: string;
  combined: string;
}

export function useClock(): ClockData {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!now) return { date: "", time: "", timeShort: "", combined: "" };

  const date = now.toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const time = now.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const timeShort = now.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return { date, time, timeShort, combined: `${date} · ${time}` };
}
