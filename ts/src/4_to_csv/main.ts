/**
 * Step 4: CompareRow[] → CSV
 *
 * Pivot: amount[{year, amount}] → amount_<year> columns (dynamic, sorted).
 * Derived: 増減額, 増減率, 状態, 増減額順位.
 *
 * Usage: tsx src/4_to_csv/main.ts compare.json > compare.csv
 *    or: cat compare.json | tsx src/4_to_csv/main.ts
 */

import { readFileSync } from "node:fs";
import type { CompareRow, BudgetStatus } from "../lib/types";

const DIMENSION_KEYS = [
  "kan_name", "kou_name", "moku_name",
  "setsu_layer1_name", "setsu_layer2_name",
  "setsumei_layer1_name", "setsumei_layer2_name", "setsumei_layer3_name",
] as const;

const HEADER_LABEL: Readonly<Record<string, string>> = {
  kan_name: "款",
  kou_name: "項",
  moku_name: "目",
  setsu_layer1_name: "節",
  setsu_layer2_name: "細節",
  setsumei_layer1_name: "説明1",
  setsumei_layer2_name: "説明2",
  setsumei_layer3_name: "説明3",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const escape = (v: string | number | null | undefined): string =>
  v == null ? "" : String(v).includes(",") ? `"${String(v).replace(/"/g, '""')}"` : String(v);

/** Missing year → 0 (item didn't exist that year), null amount preserved (blank cell) */
const lookupAmount = (amountMap: Readonly<Record<string, number | null>>, year: string): number | null =>
  year in amountMap ? amountMap[year] : 0;

// ── Derived column computations ─────────────────────────────────────────────

/** 新規/廃止 を先にチェックし、増額/減額/横ばい の判定を正確に行う */
const deriveStatus = (prev: number | null, next: number | null): BudgetStatus =>
  prev === 0 && next !== null && next >= 1 ? '新規'
  : next === 0 && (prev === null || prev >= 1) ? '廃止'
  : prev !== null && prev >= 1 && next !== null && next > prev ? '増額'
  : next !== null && next >= 1 && prev !== null && prev > next ? '減額'
  : prev !== null && next !== null && prev === next ? '横ばい'
  : '不明';

const computeChange = (prev: number | null, next: number | null): number | null =>
  prev !== null && next !== null ? next - prev : null;

/** Rate as percentage (50.0 = 50%). null when prev is 0 or either is null. */
const computeRate = (prev: number | null, next: number | null): number | null =>
  prev !== null && next !== null && prev !== 0
    ? Math.round(((next - prev) / prev) * 1000) / 10
    : null;

// ── Enriched row ────────────────────────────────────────────────────────────

type EnrichedRow = Readonly<{
  row: CompareRow;
  amountMap: Readonly<Record<string, number | null>>;
  change: number | null;
  rate: number | null;
  status: BudgetStatus;
}>;

// ── Entry point ─────────────────────────────────────────────────────────────

const arg = process.argv[2];
const inputJson = arg ? readFileSync(arg, "utf-8") : readFileSync("/dev/stdin", "utf-8");
const rows: ReadonlyArray<CompareRow> = JSON.parse(inputJson);

const years = [...new Set(rows.flatMap(r => r.amount.map(a => a.year)))].sort();
const [prevYear, nextYear] = [years[0], years[years.length - 1]];

const enrichedRows: ReadonlyArray<EnrichedRow> = rows.map(row => {
  const amountMap: Readonly<Record<string, number | null>> =
    Object.fromEntries(row.amount.map(a => [a.year, a.amount]));
  const prev = lookupAmount(amountMap, prevYear);
  const next = lookupAmount(amountMap, nextYear);
  return { row, amountMap, change: computeChange(prev, next), rate: computeRate(prev, next), status: deriveStatus(prev, next) };
});

// ── Rank by 増減額 descending (rank 1 = largest increase) ───────────────────

const rankMap: ReadonlyMap<number, number> = new Map(
  enrichedRows
    .map((r, i) => [i, r.change] as const)
    .filter((pair): pair is readonly [number, number] => pair[1] !== null)
    .sort(([, a], [, b]) => b - a)
    .map(([origIdx], rank) => [origIdx, rank + 1] as const)
);

// ── CSV output ──────────────────────────────────────────────────────────────

const header = [
  ...DIMENSION_KEYS.map(k => HEADER_LABEL[k] ?? k),
  ...years.map(y => `${y}年度`),
  "増減額",
  "増減率",
  "状態",
  "増減額順位",
].join(",");

const csvRows = enrichedRows.map((enriched, idx) =>
  [
    ...DIMENSION_KEYS.map(k => escape(enriched.row[k])),
    ...years.map(y => y in enriched.amountMap ? escape(enriched.amountMap[y]) : "0"),
    escape(enriched.change),
    enriched.rate !== null ? escape(enriched.rate) : "",
    escape(enriched.status),
    rankMap.has(idx) ? String(rankMap.get(idx)) : "",
  ].join(",")
);

process.stdout.write([header, ...csvRows].join("\n") + "\n");
