import { NextRequest, NextResponse } from "next/server";
import Holidays from "date-holidays";

// Accepts ?years=2026,2027 (comma-separated) so callers spanning a whole semester
// (which can cross a calendar year boundary) get full coverage instead of a
// rolling window from "now". Defaults to the current year when omitted.
export async function GET(req: NextRequest) {
  try {
    const yearsParam = req.nextUrl.searchParams.get("years");
    const years = yearsParam
      ? yearsParam.split(",").map((y) => parseInt(y.trim(), 10)).filter((y) => !Number.isNaN(y))
      : [new Date().getFullYear()];

    const hd = new Holidays("TH");
    const result: Array<{ date: string; name: string; type: string }> = [];

    for (const year of years) {
      const holidays = hd.getHolidays(year);
      for (const h of holidays) {
        if (h.type !== "public") continue;
        result.push({ date: h.date.slice(0, 10), name: h.name, type: h.type });
      }
    }

    return NextResponse.json({ holidays: result });
  } catch (err) {
    console.error("[holidays]", err);
    return NextResponse.json({ holidays: [] });
  }
}
