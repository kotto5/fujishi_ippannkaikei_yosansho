/**
 * Step 4: CompareRow[] → CSV
 *
 * Pivot: amount[{year, amount}] → amount_<year> columns (dynamic, sorted).
 *
 * Usage: tsx src/4_to_csv/main.ts compare.json > compare.csv
 *    or: cat compare.json | tsx src/4_to_csv/main.ts
 */

import { readFileSync } from "node:fs";
import type { CompareRow } from "../lib/types";

const DIMENSION_KEYS = [
  "kan_name", "kou_name", "moku_name",
  "setsu_layer1_name", "setsu_layer2_name",
  "setsumei_layer1_name", "setsumei_layer2_name", "setsumei_layer3_name",
] as const;

const escape = (v: string | number | null | undefined): string =>
  v == null ? "" : String(v).includes(",") ? `"${String(v).replace(/"/g, '""')}"` : String(v);

const arg = process.argv[2];
const inputJson = arg ? readFileSync(arg, "utf-8") : readFileSync("/dev/stdin", "utf-8");

const rows: ReadonlyArray<CompareRow> = JSON.parse(inputJson);

const years = [...new Set(rows.flatMap(r => r.amount.map(a => a.year)))].sort();

const header = [...DIMENSION_KEYS, ...years.map(y => `amount_${y}`)].join(",");

const csvRows = rows.map(row => {
  const amountMap = Object.fromEntries(row.amount.map(a => [a.year, a.amount]));
  return [
    ...DIMENSION_KEYS.map(k => escape(row[k])),
    ...years.map(y => y in amountMap ? escape(amountMap[y]) : "0"),
  ].join(",");
});

process.stdout.write([header, ...csvRows].join("\n") + "\n");
