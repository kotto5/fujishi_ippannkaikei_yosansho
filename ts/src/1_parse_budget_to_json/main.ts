/**
 * CLI entry point: Excel file → stdout (Year JSON)
 *
 * Unix pipe abstraction: accepts byte stream, emits structured data.
 * Usage: npx tsx src/main.ts inputs/r8.xlsx
 *    or: cat inputs/r8.xlsx | npx tsx src/main.ts r8
 *
 * argv[2]: file path (year derived from basename) OR year label for stdin
 */

import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { parseBudgetExcel } from "../lib/pipeline";
import type { Year } from "../lib/types";

// "r7" → 2025, "r8" → 2026（令和年 + 2018）
const reiwaToYear = (label: string): number =>
  2018 + parseInt(label.replace(/^r/, ""), 10);

const main = (): void => {
  const arg = process.argv[2];
  const isFilePath = arg !== undefined && arg.includes(".");
  const [buffer, year] = isFilePath
    ? [readFileSync(arg), reiwaToYear(basename(arg, extname(arg)))] as const
    : [readFileSync("/dev/stdin"), reiwaToYear(arg ?? "0")] as const;

  const { value: kans, errors } = parseBudgetExcel(buffer as Buffer);

  // Report validation errors to stderr
  errors.length > 0 &&
    process.stderr.write(
      `\n=== Validation Errors (${errors.length}) ===\n` +
      errors
        .map((e) =>
          e.type === "kou_sum_vs_kan"
            ? `[${e.type}] ${e.context.kan_name}: expected=${e.expected}, actual=${e.actual}`
            : e.type === "moku_sum_vs_kou"
              ? `[${e.type}] ${e.context.kan_name}/${e.context.kou_name}: expected=${e.expected}, actual=${e.actual}`
              : `[${e.type}] ${e.context.kan_name}/${e.context.kou_name}/${e.context.moku_name}: expected=${e.expected}, actual=${e.actual}`,
        )
        .join("\n") +
      "\n",
    );

  // Summary to stderr
  const mokuCount = kans.reduce((acc, kan) => acc + kan.kou.reduce((a, kou) => a + kou.moku.length, 0), 0);
  process.stderr.write(`\nParsed: ${kans.length} 款, ${mokuCount} 目\n`);
  process.stderr.write(`Validation errors: ${errors.length}\n`);

  // Structured data to stdout
  const output: Year = { year, kans };
  process.stdout.write(JSON.stringify(output, null, 2));
};

main();
