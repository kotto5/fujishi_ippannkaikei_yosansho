/**
 * Shared utilities for cell value extraction and full-width handling.
 */

import type { CellValue, Row } from "./types";

// ── Full-width → half-width conversion ──

const FW_DIGIT_MAP: Readonly<Record<string, string>> = {
  "０": "0", "１": "1", "２": "2", "３": "3", "４": "4",
  "５": "5", "６": "6", "７": "7", "８": "8", "９": "9",
};

/** Convert full-width digits to half-width */
export const normalizeDigits = (s: string): string =>
  [...s].map((ch) => FW_DIGIT_MAP[ch] ?? ch).join("");

/** Parse a string that may contain full-width digits into a number, or return null */
export const parseNumeric = (s: string): number | null => {
  const normalized = normalizeDigits(s.trim());
  const n = parseInt(normalized, 10);
  return Number.isNaN(n) ? null : n;
};

// ── Cell value extractors ──

/** Get cell as trimmed string (empty string if undefined/null) */
export const cellStr = (row: Row, col: number): string => {
  const v: CellValue = row[col];
  return v === undefined || v === null ? "" : String(v).trim();
};

/** Get cell as raw string without trimming (preserves leading spaces for indent detection) */
export const cellRaw = (row: Row, col: number): string => {
  const v: CellValue = row[col];
  return v === undefined || v === null ? "" : String(v);
};

/** Get cell as number (handles both numeric cells and string-encoded numbers) */
export const cellNum = (row: Row, col: number): number | null => {
  const v: CellValue = row[col];
  return typeof v === "number"
    ? v
    : typeof v === "string"
      ? parseNumeric(v)
      : null;
};

/** Get cell as integer code (for 目番号, 節番号 etc. — string or number) */
export const cellCode = (row: Row, col: number): number | null => {
  const v: CellValue = row[col];
  return typeof v === "number"
    ? v
    : typeof v === "string"
      ? parseNumeric(v)
      : null;
};

/** Check if cell has a meaningful value (not empty/undefined/null) */
export const cellHasValue = (row: Row, col: number): boolean => {
  const v: CellValue = row[col];
  return v !== undefined && v !== null && v !== "";
};

/** Check if cell value is a number (not text propagated from merge) */
export const cellIsNumber = (row: Row, col: number): boolean =>
  typeof row[col] === "number";
