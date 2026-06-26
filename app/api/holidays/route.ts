import { NextResponse } from "next/server";
import Holidays from "date-holidays";

export async function GET() {
  try {
    const hd = new Holidays("TH");
    const result: Array<{ date: string; name: string; type: string }> = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const h = hd.isHoliday(d);
      if (h && h.length > 0 && h[0].type === "public") {
        result.push({
          date: d.toISOString().split("T")[0],
          name: h[0].name,
          type: h[0].type,
        });
      }
    }

    return NextResponse.json({ holidays: result });
  } catch (err) {
    console.error("[holidays]", err);
    return NextResponse.json({ holidays: [] });
  }
}
