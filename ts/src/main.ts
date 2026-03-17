/**
 * CLI entry point: stdin (Excel buffer) → stdout (JSON)
 *
 * Unix pipe abstraction: accepts byte stream, emits structured data.
 * Usage: cat inputs/r8.xlsx | npx tsx src/main.ts
 *    or: npx tsx src/main.ts < inputs/r8.xlsx
 */

import { readFileSync } from "node:fs";
import { parseBudgetExcel } from "./pipeline";

const main = (): void => {
  const inputPath = process.argv[2];
  const buffer = inputPath !== undefined
    ? readFileSync(inputPath)
    : readFileSync("/dev/stdin");

  const result = parseBudgetExcel(buffer as Buffer);

  // Report validation errors to stderr
  result.errors.length > 0 &&
    process.stderr.write(
      `\n=== Validation Errors (${result.errors.length}) ===\n` +
      result.errors
        .map(
          (e) =>
            `[${e.type}] ${e.context.kan_name}/${e.context.kou_name}/${e.context.moku_name}: expected=${e.expected}, actual=${e.actual}`,
        )
        .join("\n") +
      "\n",
    );

  // Summary to stderr
  const mokuCount = result.data.reduce((acc, kan) => acc + kan.kou.reduce((a, kou) => a + kou.moku.length, 0), 0);
  process.stderr.write(`\nParsed: ${result.data.length} 款, ${mokuCount} 目\n`);
  process.stderr.write(`Validation errors: ${result.errors.length}\n`);

  // Structured data to stdout
  process.stdout.write(JSON.stringify(result.data, null, 2));
};

main();
