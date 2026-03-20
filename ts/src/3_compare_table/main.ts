/**
 * Step 3: Year[] → CompareRow[] (比較表生成)
 *
 * Catamorphism over the Year tree → flat ExportDataRow[] →
 * pivot by (dimension key) grouping amounts by year.
 *
 * Usage: tsx src/3_compare_table/main.ts merged.json > compare.json
 *    or: cat merged.json | tsx src/3_compare_table/main.ts
 */

import { readFileSync } from "node:fs";
import type {
  Year,
  Setsu,
  Setsumei,
  ExportDataRow,
  ExportDataKanRow,
  ExportDataKouRow,
  ExportDataMokuRow,
  ExportDataSetsuRow,
  ExportDataSetsumeiRow,
  CompareRow,
} from "../lib/types";

// ── Catamorphism: tree → flat rows ──────────────────────────────────────────

const flattenSetsu =
  (ctx: { kan_name: string; kou_name: string; moku_name: string; year: number }) =>
  (setsu: Setsu): ReadonlyArray<ExportDataSetsuRow> =>
    [
      { ...ctx, setsu_layer1_name: setsu.name, setsu_layer2_name: "", amount: setsu.amount },
      ...setsu.children.map(child => ({
        ...ctx,
        setsu_layer1_name: setsu.name,
        setsu_layer2_name: child.name,
        amount: child.amount,
      })),
    ];

const flattenSetsumei =
  (ctx: { kan_name: string; kou_name: string; moku_name: string; year: number }) =>
  (setsumei: Setsumei): ReadonlyArray<ExportDataSetsumeiRow> =>
    [
      { ...ctx, setsumei_layer1_name: setsumei.name, setsumei_layer2_name: "", setsumei_layer3_name: "", amount: setsumei.amount },
      ...setsumei.children.flatMap(l2 => [
        { ...ctx, setsumei_layer1_name: setsumei.name, setsumei_layer2_name: l2.name, setsumei_layer3_name: "", amount: l2.amount },
        ...l2.children.map(l3 => ({
          ...ctx,
          setsumei_layer1_name: setsumei.name,
          setsumei_layer2_name: l2.name,
          setsumei_layer3_name: l3.name,
          amount: l3.amount,
        })),
      ]),
    ];

const flattenYear = (year: Year): ReadonlyArray<ExportDataRow> =>
  year.kans.flatMap(kan => [
    { kan_name: kan.name, year: year.year, amount: 0 } satisfies ExportDataKanRow,
    ...kan.kou.flatMap(kou => [
      { kan_name: kan.name, kou_name: kou.name, year: year.year, amount: 0 } satisfies ExportDataKouRow,
      ...kou.moku.flatMap(moku => {
        const ctx = { kan_name: kan.name, kou_name: kou.name, moku_name: moku.name, year: year.year };
        return [
          { ...ctx, amount: moku.honendo ?? 0 } satisfies ExportDataMokuRow,
          ...moku.setsu.flatMap(flattenSetsu(ctx)),
          ...moku.setsumei.flatMap(flattenSetsumei(ctx)),
        ];
      }),
    ]),
  ]);

// ── Dimension key extraction (discriminate by structural presence) ───────────

const toKeyObj = (row: ExportDataRow): Omit<CompareRow, "amount"> =>
  "setsu_layer1_name" in row
    ? {
        kan_name: row.kan_name, kou_name: row.kou_name, moku_name: row.moku_name,
        setsu_layer1_name: row.setsu_layer1_name, setsu_layer2_name: row.setsu_layer2_name,
        setsumei_layer1_name: "", setsumei_layer2_name: "", setsumei_layer3_name: "",
      }
    : "setsumei_layer1_name" in row
    ? {
        kan_name: row.kan_name, kou_name: row.kou_name, moku_name: row.moku_name,
        setsu_layer1_name: "", setsu_layer2_name: "",
        setsumei_layer1_name: row.setsumei_layer1_name, setsumei_layer2_name: row.setsumei_layer2_name, setsumei_layer3_name: row.setsumei_layer3_name,
      }
    : "moku_name" in row
    ? {
        kan_name: row.kan_name, kou_name: row.kou_name, moku_name: row.moku_name,
        setsu_layer1_name: "", setsu_layer2_name: "",
        setsumei_layer1_name: "", setsumei_layer2_name: "", setsumei_layer3_name: "",
      }
    : "kou_name" in row
    ? {
        kan_name: row.kan_name, kou_name: row.kou_name, moku_name: "",
        setsu_layer1_name: "", setsu_layer2_name: "",
        setsumei_layer1_name: "", setsumei_layer2_name: "", setsumei_layer3_name: "",
      }
    : {
        kan_name: row.kan_name, kou_name: "", moku_name: "",
        setsu_layer1_name: "", setsu_layer2_name: "",
        setsumei_layer1_name: "", setsumei_layer2_name: "", setsumei_layer3_name: "",
      };

// ── Pivot: group by dimension key, accumulate amounts by year ────────────────
// Monoid: CompareRow.amount is a free monoid (list), concat via spread.

const pivotByYear = (rows: ReadonlyArray<ExportDataRow>): ReadonlyArray<CompareRow> =>
  Object.values(
    rows.reduce((acc: Record<string, CompareRow>, row) => {
      const keyObj = toKeyObj(row);
      const key = JSON.stringify(keyObj);
      const existing = acc[key] ?? { ...keyObj, amount: [] };
      return {
        ...acc,
        [key]: {
          ...existing,
          amount: [...existing.amount, { year: String(row.year), amount: row.amount }],
        },
      };
    }, {})
  );

// ── Entry point ──────────────────────────────────────────────────────────────

const arg = process.argv[2];
const inputJson = arg
  ? readFileSync(arg, "utf-8")
  : readFileSync("/dev/stdin", "utf-8");

const years: ReadonlyArray<Year> = JSON.parse(inputJson);
const result = pivotByYear(years.flatMap(flattenYear));
process.stdout.write(JSON.stringify(result, null, 2));
