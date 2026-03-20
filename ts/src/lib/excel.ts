/**
 * SheetJS wrapper: Buffer → ReadonlyArray<{sheetName, rows}>
 *
 * SheetJS stores merged-cell values only at the anchor (top-left) cell.
 * The parser functions already scan for non-empty cells in their target columns,
 * so merge resolution is unnecessary — anchor-only is sufficient.
 */

import * as XLSX from "xlsx";
import { type CellValue, type Row } from "./types";

export type SheetData = Readonly<{
  sheetName: string;
  rows: ReadonlyArray<Row>;
}>;


/** Convert worksheet to 2D array of CellValues (1-based column indexing in Row) */
const worksheetToRows = (ws: XLSX.WorkSheet): ReadonlyArray<Row> => {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const totalRows = range.e.r - range.s.r + 1;
  const totalCols = range.e.c - range.s.c + 1;

  return Array.from({ length: totalRows }, (_, ri) => {
    const r = range.s.r + ri;
    // Index 0 is unused (placeholder) so columns are 1-based
    return [
      undefined,
      ...Array.from({ length: totalCols }, (_, ci) => {
        const c = range.s.c + ci;
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr] as XLSX.CellObject | undefined;
        return cell?.v as CellValue;
      }),
    ] as Row;
  });
};


/** Read an Excel workbook buffer → array of sheet data */
export const readBudgetExcel = (buffer: Buffer): ReadonlyArray<SheetData> => {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return wb.SheetNames.map((sheetName) => {
    const ws = wb.Sheets[sheetName]!;
    return { sheetName, rows: worksheetToRows(ws) } as SheetData;
  });
};
