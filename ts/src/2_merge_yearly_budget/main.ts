/**
 * Multi-file merge: [r7.json, r8.json, ...] → stdout (JSON as Year[])
 *
 * Each input file is a Year JSON produced by 1_parse_budget_to_json/main.ts.
 *
 * Usage: tsx src/merge.ts <file1.json> <file2.json> [...]
 * e.g. tsx src/merge.ts r7.json r8.json
 *   → [{ year: "r7", kans: [...] }, { year: "r8", kans: [...] }]
 */

import { readFileSync } from "node:fs";
import type { Year } from "../lib/types";

const paths = process.argv.slice(2);

const years: ReadonlyArray<Year> = paths.map((path) => {
  const year = JSON.parse(readFileSync(path, "utf-8")) as Year;
  process.stderr.write(`[${year.year}] Merged: ${year.kans.length} 款\n`);
  return year;
});

process.stdout.write(JSON.stringify(years, null, 2));
