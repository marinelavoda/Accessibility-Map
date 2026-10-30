// Turns rows into a CSV file that opens correctly in Excel and Google Sheets.
// No imports, so the tests can load it directly.

type Cell = string | number | boolean | Date | null | undefined;

export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(formatCell).join(","));
  // The invisible "BOM" character at the start tells Excel the file is UTF-8,
  // otherwise Romanian letters like ă, ț, ș show up garbled.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

function formatCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  let text = value instanceof Date ? value.toISOString() : value;
  // Text starting with = + - @ would run as a formula in Excel. Text that people typed
  // (like assessment notes) could abuse that, so such cells get a leading apostrophe.
  // Real numbers (like a negative coordinate) are returned above and stay untouched.
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  // Cells with commas, quotes or line breaks go in quotes; quotes inside are doubled.
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
