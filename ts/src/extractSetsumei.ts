/**
 * Step 4b: 目チャンク → 説明の抽出
 *
 * AT列(col 46)のテキストの先頭全角スペース数で階層判定:
 *   0    → 大事業
 *   1    → 事業
 *   2, 3 → 注釈テキスト（continuation — 括弧書きの定数情報等）
 *   4    → 細目
 *   5+   → 説明テキスト（細目の継続行、無視）
 *
 * 金額列: BR(大事業), BN(事業), BL(細目)
 * マージセル解決により、AT列のテキストがBL/BNに伝播している場合がある。
 * → 金額列は typeof === "number" で判定（文字列は無視）。
 */

import { match } from "ts-pattern";
import {
  COL,
  type Row,
  type Setsumei,
} from "./types";
import { cellIsNumber, cellRaw } from "./util";

// ── Indent detection ──

/** Count leading full-width spaces (U+3000) */
const countLeadingZenkakuSpaces = (s: string): number => {
  const m = s.match(/^(\u3000*)/);
  return m?.[1]?.length ?? 0;
};

type IndentLevel = 0 | 1 | 4 | "continuation";

const classifyIndent = (spaces: number): IndentLevel =>
  match(spaces)
    .with(0, () => 0 as const)
    .with(1, () => 1 as const)
    .with(2, () => "continuation" as const) // 注釈テキスト（括弧書き等）
    .with(3, () => "continuation" as const) // 注釈テキスト（定数/定数外等）
    .with(4, () => 4 as const)
    .otherwise(() => "continuation" as const);

// ── Code/name splitting ──

const CODE_NAME_PATTERN = /^(\d+)\s+(.+)$/;

const splitCodeName = (text: string): Readonly<{ code: string | null; name: string }> => {
  const trimmed = text.replace(/^\u3000+/, "").trim();
  const m = trimmed.match(CODE_NAME_PATTERN);
  return m === null
    ? { code: null, name: trimmed }
    : { code: m[1]!, name: m[2]!.trim() };
};

// ── Safe numeric extraction (ignores text from merge propagation) ──

const safeNum = (row: Row, col: number): number | null =>
  cellIsNumber(row, col) ? (row[col] as number) : null;

// ── Tagged row type ──

type SetsumeiRow = Readonly<{
  level: IndentLevel;
  text: string;
  row: Row;
}>;

/** Check if AT text is a header remnant (e.g. "説　　明" with internal spaces) */
const isHeaderText = (s: string): boolean => {
  const collapsed = s.replace(/[\u3000\s]+/g, "");
  return collapsed === "説明" || collapsed === "千円";
};

/** Extract AT-column rows with indent classification */
const toSetsumeiRows = (rows: ReadonlyArray<Row>): ReadonlyArray<SetsumeiRow> =>
  rows
    .filter((row) => {
      const raw = cellRaw(row, COL.AT).trim();
      return raw.length > 0 && !isHeaderText(raw);
    })
    .map((row) => {
      const raw = cellRaw(row, COL.AT);
      const spaces = countLeadingZenkakuSpaces(raw);
      return { level: classifyIndent(spaces), text: raw, row };
    });

// ── Chunk splitting ──

/** Split array at positions where predicate is true */
const splitAt = <T>(items: ReadonlyArray<T>, pred: (item: T) => boolean): ReadonlyArray<ReadonlyArray<T>> =>
  items.reduce<ReadonlyArray<ReadonlyArray<T>>>((acc, item) =>
    pred(item)
      ? [...acc, [item]]
      : acc.length === 0
        ? [[item]]
        : [...acc.slice(0, -1), [...acc[acc.length - 1]!, item]],
    [],
  );

// ── Tree construction using domain Setsumei type ──

/** Parse 細目 level (indent 4) → leaf Setsumei node */
const parseSaimoku = (sRows: ReadonlyArray<SetsumeiRow>): Setsumei => {
  const { name } = splitCodeName(sRows[0]!.text);
  const amount = safeNum(sRows[0]!.row, COL.BL);
  return { code: null, name, amount, children: [] };
};

/** Parse 事業 level (indent 1) → Setsumei node with saimoku children */
const parseJigyo = (jRows: ReadonlyArray<SetsumeiRow>): Setsumei => {
  const head = jRows[0]!;
  const { code, name } = splitCodeName(head.text);
  const amount = safeNum(head.row, COL.BN);
  const saimokuChunks = splitAt(jRows.slice(1), (r) => r.level === 4);
  const children = saimokuChunks
    .filter((chunk) => chunk[0]?.level === 4)
    .map(parseSaimoku);
  return { code, name, amount, children };
};

/** Parse 大事業 level (indent 0) → Setsumei node with jigyo children */
const parseDaijigyo = (dRows: ReadonlyArray<SetsumeiRow>): Setsumei => {
  const head = dRows[0]!;
  const { code, name } = splitCodeName(head.text);
  const amount = safeNum(head.row, COL.BR);
  const jigyoChunks = splitAt(dRows.slice(1), (r) => r.level === 1);
  const children = jigyoChunks
    .filter((chunk) => chunk[0]?.level === 1)
    .map(parseJigyo);
  return { code, name, amount, children };
};

/** Extract 説明 tree from a 目 chunk */
export const extractSetsumei = (rows: ReadonlyArray<Row>): ReadonlyArray<Setsumei> => {
  const sRows = toSetsumeiRows(rows);
  const daiChunks = splitAt(sRows, (r) => r.level === 0);
  return daiChunks
    .filter((chunk) => chunk[0]?.level === 0)
    .map(parseDaijigyo);
};
