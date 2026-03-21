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

import {
  COL,
  type Row,
  type Setsumei,
} from "./types";
import { cellIsNumber, cellRaw } from "./util";
import { buildTree, type TreeRow } from "./treeBuilder";

// ── Indent detection ──

/** Count leading full-width spaces (U+3000) */
const countLeadingZenkakuSpaces = (s: string): number =>
  s.match(/^(\u3000*)/)?.[1]?.length ?? 0;

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

// 説明金額列: BL(細目) → BN(事業) → BR(大事業) の順に左優先でスキャン
const SETSUMEI_AMOUNT_COLS = [64, 66, 70] as const; // BL, BN, BR

/** Find the first numeric amount in the known setsumei amount columns (BL/BN/BR) */
const findAmount = (row: Row): Readonly<{ amount: number | null; col: number | null }> => {
  const entry = SETSUMEI_AMOUNT_COLS
    .map(i => ({ col: i, amount: safeNum(row, i) }))
    .find(e => e.amount !== null);
  return entry ?? { amount: null, col: null };
};

/** Check if AT text is a header remnant (e.g. "説　　明" with internal spaces) */
const isHeaderText = (s: string): boolean => {
  const collapsed = s.replace(/[\u3000\s]+/g, "");
  return collapsed === "説明" || collapsed === "千円";
};

/** Extract AT-column rows with indent classification */
export const toSetsumeiRows = (rows: ReadonlyArray<Row>): ReadonlyArray<TreeRow> => {
  const { result } = rows.reduce<{ result: TreeRow[]; skipNext: boolean }>(
    ({ result, skipNext }, row, index, arr) => {
      if (skipNext) return { result, skipNext: false };

      const raw = cellRaw(row, COL.AT);
      if (raw.length <= 0 || isHeaderText(raw)) return { result, skipNext: false };

      const countSpaces = countLeadingZenkakuSpaces(raw);
      const nextRow = arr[index + 1]; // TODO: 三行以上の説明テキストへの対応
      const nextraw = nextRow ? cellRaw(nextRow, COL.AT).trim() : "";
      const text = raw.trim() + nextraw;
      const { code, name } = splitCodeName(text);

      const { amount, col } = findAmount(row);
      return {
        result: [...result, { indent: countSpaces, code, name, amount }],
        // テキストがある次の行は、続き or 空行のはずなので、skip
        skipNext: amount !== null,
      };
    },
    { result: [], skipNext: false }
  );
  return result;
};

/** Extract 説明 tree from a 目 chunk */
export const extractSetsumei = (rows: ReadonlyArray<Row>): ReadonlyArray<Setsumei> =>
  buildTree(toSetsumeiRows(rows));
