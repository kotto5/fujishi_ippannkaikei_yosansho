/**
 * Step 2: ページヘッダー・フッタ除去
 *
 * シートレベルで動作し、印刷レイアウトの繰り返しヘッダーブロックを一括除去する。
 *
 * ヘッダーブロック構造（10行固定、150行周期で繰り返し）:
 *   起点: C列="目" && L列="本年度予算額" の行
 *   終端: "千円" を含む行
 *
 * 加えて以下も個別除去:
 *   - 款ヘッダー行: C列に "N款" パターン
 *   - ページフッタ行: A列に "歳出予算書"
 *   - "歳    出" 行: E列に "歳" と "出" を含む行
 */

import { COL, type Row } from "./types";
import { cellStr, normalizeDigits } from "./util";

/** ヘッダーブロック起点: C列="目" && L列に"本年度予算額" */
const isHeaderBlockStart = (row: Row): boolean =>
  cellStr(row, COL.C) === "目" && cellStr(row, COL.L).includes("本年度予算額");

/** ヘッダーブロック終端: "千円" が複数列に出現 */
const isHeaderBlockEnd = (row: Row): boolean =>
  cellStr(row, COL.K).includes("千円");

/** 款ヘッダー行: C列に "N款" パターン */
const isKanHeader = (row: Row): boolean =>
  /\d+款/.test(normalizeDigits(cellStr(row, COL.C)));

/** ページフッタ: A列に "歳出予算書" */
const isPageFooter = (row: Row): boolean =>
  cellStr(row, COL.A).includes("歳出予算書");

/** "歳    出" 表示行 */
const isSaisyutsuLabel = (row: Row): boolean =>
  cellStr(row, COL.E).includes("歳") && cellStr(row, COL.E).includes("出");

/**
 * ヘッダーブロック（起点〜終端）のインデックス集合を構築する。
 * 起点行を見つけたら、そこから終端行までの全行インデックスを収集。
 */
const collectHeaderBlockIndices = (rows: ReadonlyArray<Row>): ReadonlySet<number> =>
  rows.reduce<{ readonly indices: ReadonlySet<number>; readonly inBlock: boolean }>(
    (acc, row, i) =>
      acc.inBlock
        ? isHeaderBlockEnd(row)
          ? { indices: new Set([...acc.indices, i]), inBlock: false }
          : { indices: new Set([...acc.indices, i]), inBlock: true }
        : isHeaderBlockStart(row)
          ? { indices: new Set([...acc.indices, i]), inBlock: true }
          : acc,
    { indices: new Set<number>(), inBlock: false },
  ).indices;

/** Determine if a row is a header/footer that should be stripped */
export const isHeaderRow = (row: Row): boolean =>
  isKanHeader(row)
  || isPageFooter(row)
  || isSaisyutsuLabel(row);

/** Remove all header/footer rows from an entire sheet's rows (before splitByKou) */
export const stripHeaders = (rows: ReadonlyArray<Row>): ReadonlyArray<Row> => {
  const blockIndices = collectHeaderBlockIndices(rows);
  return rows.filter((row, i) => !blockIndices.has(i) && !isHeaderRow(row));
};
