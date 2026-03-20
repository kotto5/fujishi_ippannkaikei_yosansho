/**
 * Multi-file merge: [r7.json, r8.json, ...] → stdout (JSON as Year[])
 *
 * Usage: tsx src/merge.ts <file1.json> <file2.json> [...]
 * year key is derived from the filename (without extension).
 *
 * e.g. tsx src/merge.ts r7.json r8.json
 *   → [{ year: "r7", kans: [...] }, { year: "r8", kans: [...] }]
 */

import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import type { Kan, Year } from "./types";

const paths = process.argv.slice(2);

const years: ReadonlyArray<Year> = paths.map((path) => {
  const year = basename(path, extname(path));
  const kans = JSON.parse(readFileSync(path, "utf-8")) as ReadonlyArray<Kan>;
  process.stderr.write(`[${year}] Merged: ${kans.length} 款\n`);
  return { year, kans };
});

process.stdout.write(JSON.stringify(years, null, 2));
