import * as XLSX from "xlsx";
import { Student } from "@/types";

export interface SkippedRow {
  rowNumber: number; // 1-based, counting only non-blank data rows
  reason: "invalid_id" | "duplicate_id";
  raw: string; // best-effort human-readable snippet of the offending row
}

export interface ParsedImport {
  course_id: string;
  title: string;
  section: string;
  lecturer: string;
  students: Omit<Student, "course_id" | "section">[];
  skipped: SkippedRow[];
}

export interface GenericFileData {
  headers: string[];
  preview: string[][];   // first 5 data rows
  allRows: string[][];   // all data rows for final parse
}

/** Detect if a file matches CMU format (contains "COURSE NO" or "รหัสนักศึกษา") */
export function isCmuFormat(buffer: ArrayBuffer): boolean {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1, defval: "", raw: false,
  }) as string[][];

  const first10 = rows.slice(0, 10);
  return first10.some((r) =>
    r.some((c) =>
      String(c).toUpperCase().includes("COURSE NO") ||
      String(c).includes("รหัสนักศึกษา")
    )
  );
}

/** Parse CMU format (existing logic, unchanged) */
export function parseAttendanceXlsx(buffer: ArrayBuffer): ParsedImport {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1, defval: "", raw: false,
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
  const title     = findValue("TITLE");
  const section   = findValue("SECTION");
  const lecturer  = findValue("LECTURE");

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some((c) => String(c).includes("รหัสนักศึกษา"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error("ไม่พบหัวตาราง 'รหัสนักศึกษา'");

  const students: ParsedImport["students"] = [];
  const skipped: SkippedRow[] = [];
  const seenIds = new Set<string>();
  let rowNumber = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !String(c).trim())) continue;
    rowNumber++;
    const order_num = parseInt(String(row[0] ?? "").trim(), 10);
    const student_id = String(row[1] ?? "").trim().replace(/\D/g, "");
    const firstname  = String(row[2] ?? "").trim();
    const lastname   = String(row[3] ?? "").trim();
    if (!/^\d{9}$/.test(student_id)) {
      skipped.push({ rowNumber, reason: "invalid_id", raw: row.slice(0, 4).join(" ") });
      continue;
    }
    if (seenIds.has(student_id)) {
      skipped.push({ rowNumber, reason: "duplicate_id", raw: `${student_id} ${firstname} ${lastname}` });
      continue;
    }
    seenIds.add(student_id);
    students.push({
      student_id, firstname, lastname,
      order_num: isNaN(order_num) ? students.length + 1 : order_num,
    });
  }

  return { course_id, title, section, lecturer, students, skipped };
}

/** Parse a generic xlsx/csv file and return headers + preview rows for column mapping */
export function parseGenericFile(buffer: ArrayBuffer): GenericFileData {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const allSheetRows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1, defval: "", raw: false,
  }) as string[][];

  // Find first non-empty row to use as header
  const headerIdx = allSheetRows.findIndex((r) => r.some((c) => String(c).trim()));
  if (headerIdx === -1) return { headers: [], preview: [], allRows: [] };

  const headers = allSheetRows[headerIdx].map((c) => String(c).trim());
  const dataRows = allSheetRows
    .slice(headerIdx + 1)
    .filter((r) => r.some((c) => String(c).trim()));

  return {
    headers,
    preview: dataRows.slice(0, 5),
    allRows: dataRows,
  };
}

export interface DetectedMapping {
  studentId?: number;
  firstname?: number;
  lastname?: number;
  orderNum?: number;
}

/**
 * Guess which column holds each field from header names (English/Thai variants).
 * Falls back to scanning cell contents for the student-id column when no header
 * matches — a column where most values are 9-digit numbers.
 */
export function autoDetectMapping(headers: string[], sampleRows: string[][]): DetectedMapping {
  const norm = headers.map((h) => h.toLowerCase().replace(/[\s_.\-()]+/g, ""));
  const find = (re: RegExp) => {
    const i = norm.findIndex((h) => re.test(h));
    return i === -1 ? undefined : i;
  };

  const detected: DetectedMapping = {
    studentId: find(/^(studentid|studentno|studentcode|รหัสนักศึกษา|รหัสนศ|รหัส|id)$/),
    firstname: find(/^(firstname|first|ชื่อจริง|ชื่อ|name)$/),
    lastname:  find(/^(lastname|last|surname|familyname|นามสกุล|สกุล)$/),
    orderNum:  find(/^(#|no|ลำดับ|ลำดับที่|ที่|order|ordernum)$/),
  };

  if (detected.studentId === undefined) {
    for (let c = 0; c < headers.length; c++) {
      const vals = sampleRows.map((r) => String(r[c] ?? "").trim()).filter(Boolean);
      if (vals.length === 0) continue;
      const hits = vals.filter((v) => /^\d{9}$/.test(v)).length;
      if (hits >= Math.ceil(vals.length * 0.8)) { detected.studentId = c; break; }
    }
  }

  return detected;
}

/**
 * Pull course-id / section hints out of an export filename,
 * e.g. "summary_251363_sec001 _ 000 (2).csv" → { course_id: "251363", section: "001" }.
 */
export function parseFilenameInfo(filename: string): { course_id?: string; section?: string } {
  const base = filename.replace(/\.[^.]+$/, "");
  // Match a maximal digit run that's exactly 6 digits — /\d{6}/ alone would carve
  // the first 6 digits out of a longer run (e.g. an 8-digit date prefix like
  // "20260703_251363_sec001" would wrongly match "202607" instead of "251363").
  const course = base.match(/\d+/g)?.find((n) => n.length === 6);
  const section = base.match(/sec(?:tion)?[\s_.\-]*(\d+)/i)?.[1];
  return { course_id: course, section };
}

/** Apply a column mapping to generic file rows and extract students */
export function applyColumnMapping(
  allRows: string[][],
  mapping: { studentId: number; firstname: number; lastname: number; orderNum?: number }
): { students: ParsedImport["students"]; skipped: SkippedRow[] } {
  const students: ParsedImport["students"] = [];
  const skipped: SkippedRow[] = [];
  const seenIds = new Set<string>();
  let counter = 1;
  let rowNumber = 0;
  for (const row of allRows) {
    rowNumber++;
    const student_id = String(row[mapping.studentId] ?? "").trim().replace(/\D/g, "");
    const firstname = String(row[mapping.firstname] ?? "").trim();
    const lastname  = String(row[mapping.lastname] ?? "").trim();
    if (!/^\d{9}$/.test(student_id)) {
      skipped.push({ rowNumber, reason: "invalid_id", raw: row.slice(0, 4).join(" ") });
      continue;
    }
    if (seenIds.has(student_id)) {
      skipped.push({ rowNumber, reason: "duplicate_id", raw: `${student_id} ${firstname} ${lastname}` });
      continue;
    }
    seenIds.add(student_id);
    const raw_order = mapping.orderNum !== undefined
      ? parseInt(String(row[mapping.orderNum] ?? ""), 10)
      : NaN;
    students.push({
      student_id, firstname, lastname,
      order_num: isNaN(raw_order) ? counter : raw_order,
    });
    counter++;
  }
  return { students, skipped };
}
