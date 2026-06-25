import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { upsertCourse, upsertStudents, getSpreadsheetId } from "@/lib/sheets";
import { ImportedData, Student, Course } from "@/lib/types";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data: ImportedData = await req.json();
    const spreadsheetId = await getSpreadsheetId(session.access_token);

    const now = new Date();
    const course: Course = {
      course_id: data.course_id,
      title: data.title,
      section: data.section,
      semester: now.getMonth() >= 5 ? "1" : "2",
      year: now.getFullYear().toString(),
      lecturer: data.lecturer,
    };

    await upsertCourse(session.access_token, spreadsheetId, course);

    const students: Student[] = data.students.map((s) => ({
      student_id: s.student_id,
      firstname: s.firstname,
      lastname: s.lastname,
      course_id: data.course_id,
      section: data.section,
      order_num: s.order_num,
    }));

    await upsertStudents(session.access_token, spreadsheetId, students);

    return NextResponse.json({ success: true, count: students.length });
  } catch (err) {
    console.error("import error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
