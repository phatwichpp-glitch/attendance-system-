import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  upsertCourse,
  upsertStudents,
  upsertSemesterConfig,
} from "@/lib/sheets";
import { Course, Student, SemesterConfig } from "@/types";

interface ImportBody {
  course_id: string;
  title: string;
  section: string;
  lecturer: string;
  students: Array<{
    student_id: string;
    firstname: string;
    lastname: string;
    order_num: number;
  }>;
  semester_config?: Omit<SemesterConfig, "course_id" | "section" | "created_at" | "updated_at">;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body: ImportBody = await req.json();
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const now = new Date();

    const course: Course = {
      course_id: body.course_id,
      title: body.title,
      section: body.section,
      semester: now.getMonth() >= 5 ? "1" : "2",
      year: now.getFullYear().toString(),
      lecturer: body.lecturer,
    };

    await upsertCourse(session.access_token, spreadsheetId, course);

    const students: Student[] = body.students.map((s) => ({
      ...s,
      course_id: body.course_id,
      section: body.section,
    }));

    await upsertStudents(
      session.access_token, spreadsheetId, body.course_id, body.section, students
    );

    if (body.semester_config) {
      const sc: SemesterConfig = {
        ...body.semester_config,
        course_id: body.course_id,
        section: body.section,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };
      await upsertSemesterConfig(session.access_token, spreadsheetId, sc);
    }

    return NextResponse.json({ success: true, count: students.length });
  } catch (err) {
    console.error("[import]", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
