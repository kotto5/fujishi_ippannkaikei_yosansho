/**
 * Exploration script: dump raw Excel structure for debugging.
 * Usage: npx tsx src/explore.ts ../inputs/r8.xlsx
 */

import { readFileSync } from "node:fs";
import { readBudgetExcel } from "./excel";
import { COL } from "./types";

const inputPath = process.argv[2] ?? "../inputs/r8.xlsx";
const buffer = readFileSync(inputPath);
const sheets = readBudgetExcel(buffer as Buffer);

// Show first sheet structure
const sheet = sheets[0]!;
console.log(`Sheet: ${sheet.sheetName}`);
console.log(`Total rows: ${sheet.rows.length}`);
console.log(`\n--- First 50 non-empty rows (key columns) ---`);

const keyColumns = [
  { name: "A", col: COL.A },
  { name: "C", col: COL.C },
  { name: "E", col: COL.E },
  { name: "L", col: COL.L },
  { name: "AL", col: COL.AL },
  { name: "AN", col: COL.AN },
  { name: "AQ", col: COL.AQ },
  { name: "AT", col: COL.AT },
  { name: "BL", col: COL.BL },
  { name: "BN", col: COL.BN },
  { name: "BR", col: COL.BR },
];

const nonEmpty = sheet.rows.filter((row) =>
  keyColumns.some((kc) => row[kc.col] !== undefined),
);

nonEmpty.slice(0, 50).map((row, i) => {
  const cells = keyColumns
    .filter((kc) => row[kc.col] !== undefined)
    .map((kc) => `${kc.name}=${JSON.stringify(row[kc.col])}`)
    .join(" | ");
  console.log(`  [${i}] ${cells}`);
});
