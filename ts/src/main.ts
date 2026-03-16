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
            `[${e.type}] ${e.context.款_name}/${e.context.項_name}/${e.context.目_name}: expected=${e.expected}, actual=${e.actual}`,
        )
        .join("\n") +
      "\n",
    );

  // Summary to stderr
  process.stderr.write(
    `\nParsed: ${result.data.目.length} 目, ${result.data.節.length} 節, ${result.data.説明.length} 説明\n`,
  );
  process.stderr.write(`Validation errors: ${result.errors.length}\n`);

  // Structured data to stdout
  process.stdout.write(JSON.stringify(result.data, null, 2));
};

main();
