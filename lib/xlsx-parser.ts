import * as XLSX from "xlsx";
import { Student } from "@/types";

export interface ParsedImport {
  course_id: string;
  title: string;
  section: string;
  lecturer: string;
  students: Omit<Student, "course_id" | "section">[];
}

export function parseAttendanceXlsx(buffer: ArrayBuffer): ParsedImport {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];

  const findValue = (keyword: string): string => {
    const row = rows.find((r) =>
      r.some((c) => String(c).toUpperCase().includes(keyword.toUpperCase()))
    );
    if (!row) return "";
    const idx = row.findIndex((c) =>
      String(c).toUpperCase().includes(keyword.toUpperCase())
    );
    for (let i = idx + 1; i < row.length; i++) {
      const v = String(row[i] ?? "").trim();
      if (v) return v;
    }
    return "";
  };

  const course_id = findValue("COURSE NO");
  const title = findValue("TITLE");
  const section = findValue("SECTION");
  const lecturer = findValue("LECTURE");

  // Find student header row
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some((c) => String(c).includes("รหัสนักศึกษา"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error("ไม่พบหัวตาราง 'รหัสนักศึกษา'");

  const students: ParsedImport["students"] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !String(c).trim())) continue;

    const order_num = parseInt(String(row[0] ?? "").trim(), 10);
    const student_id = String(row[1] ?? "")
      .trim()
      .replace(/\D/g, "");
    const firstname = String(row[2] ?? "").trim();
    const lastname = String(row[3] ?? "").trim();

    if (!/^\d{9}$/.test(student_id)) continue;
    students.push({
      student_id,
      firstname,
      lastname,
      order_num: isNaN(order_num) ? students.length + 1 : order_num,
    });
  }

  return { course_id, title, section, lecturer, students };
}
