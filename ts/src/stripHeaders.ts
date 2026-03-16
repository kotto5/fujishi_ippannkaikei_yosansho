/**
 * Step 2: ページヘッダー除去
 *
 * 印刷レイアウトの繰り返しヘッダー行を除去する。
 * 各行に対して独立に判定（ステートマシン不要）。
 */

import { COL, type Row } from "./types";
import { cellHasValue, cellStr, normalizeDigits } from "./util";

/** ヘッダー行判定パターン（plan Step 2 準拠） */
const HEADER_KEYWORDS = [
  "本年度予算額", "前年度予算額", "比較",
  "特定財源", "一般財源",
  "国県支出金", "地方債", "その他",
  "区分", "金額",
  "説明",
  "千円",
  "歳    出", // row 3 pattern: "３　　歳    出"
] as const;

const containsAny = (s: string, keywords: ReadonlyArray<string>): boolean =>
  keywords.some((kw) => s.includes(kw));

/** 款ヘッダー行: C列に "N款" + "項" を含む */
const isKanHeader = (row: Row): boolean => {
  const c = normalizeDigits(cellStr(row, COL.C));
  return /\d+款/.test(c);
};

/** 項合計再表示行: E列に "N項" + AB列に金額 */
const isKouTotalReshow = (row: Row): boolean => {
  const e = normalizeDigits(cellStr(row, COL.E));
  return /\d+項/.test(e) && cellHasValue(row, COL.AB);
};

/** テーブルヘッダー行: C列の値が "目" */
const isTableHeader = (row: Row): boolean =>
  cellStr(row, COL.C) === "目";

/** テーブルヘッダーの続き / フッタ: キーワード検出 */
const isHeaderOrFooterContent = (row: Row): boolean => {
  const allText = (row ?? [])
    .filter((v): v is string | number => v !== undefined && v !== null)
    .map((v) => String(v).trim())
    .filter((s) => s.length > 0)
    .join(" ");
  return containsAny(allText, [...HEADER_KEYWORDS]);
};

/** ページフッタ: A列に "歳出予算書" */
const isPageFooter = (row: Row): boolean =>
  cellStr(row, COL.A).includes("歳出予算書");

/** Determine if a row is a header/footer that should be stripped */
export const isHeaderRow = (row: Row): boolean =>
  isKanHeader(row)
  || isKouTotalReshow(row)
  || isTableHeader(row)
  || isHeaderOrFooterContent(row)
  || isPageFooter(row);

/** Remove all header rows from a chunk */
export const stripHeaders = (rows: ReadonlyArray<Row>): ReadonlyArray<Row> =>
  rows.filter((row) => !isHeaderRow(row));
