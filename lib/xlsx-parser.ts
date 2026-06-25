import * as XLSX from "xlsx";
import { ImportedData, ImportedStudent } from "./types";

export function parseAttendanceXlsx(buffer: ArrayBuffer): ImportedData {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as string[][];

  const getCellValue = (row: string[]): string => {
    // Row format: ["LABEL :", "", "VALUE"] — value is at index 2 or first non-empty after index 1
    for (let i = 1; i < row.length; i++) {
      const v = String(row[i] ?? "").trim();
      if (v) return v;
    }
    return "";
  };

  const course_id = getCellValue(rows[1] ?? []);
  const title = getCellValue(rows[2] ?? []);
  const section = getCellValue(rows[3] ?? []);
  const lecturer = getCellValue(rows[4] ?? []);

  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some((c) => String(c).includes("รหัสนักศึกษา"))) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) throw new Error("ไม่พบหัวตารางรหัสนักศึกษา");

  const students: ImportedStudent[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c)) continue;

    const order_num = parseInt(String(row[0] ?? "").trim(), 10);
    const student_id = String(row[1] ?? "").trim().replace(/\D/g, "");
    const firstname = String(row[2] ?? "").trim();
    const lastname = String(row[3] ?? "").trim();

    if (!/^\d{9}$/.test(student_id)) continue;

    students.push({ order_num: isNaN(order_num) ? i - headerIdx : order_num, student_id, firstname, lastname });
  }

  return { course_id, title, section, lecturer, students };
}
