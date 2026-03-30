/**
 * Step 3: ヘッダー除去済みの項チャンク → 目チャンクに分割
 *
 * C列(col 3)に数値(string or number) + E列(col 5)に目名称 → 目の開始行。
 * E列の名称が複数行にまたがる場合、C列にコードを持たない後続行のE列テキストを結合する。
 * C列が "計" の行は項合計行（検算用に別途返す）。
 */

import { COL, type MokuBudget, type MokuChunk, type Row } from "./types";
import { cellCode, cellNum, cellStr } from "./util";

/** 目の開始行: C列に数値的な値 + E列に名称 */
const isMokuStart = (row: Row): boolean => {
  const code = cellCode(row, COL.C);
  const name = cellStr(row, COL.E);
  return code !== null && name.length > 0 && !name.includes("項");
};

/**
 * 名称継続の終端判定: L/O列に予算額がある行（＝コード無し廃目）か、
 * E列に「項」を含むページヘッダー行が現れたら名称エリア終了。
 */
const isNameAreaEnd = (row: Row): boolean =>
  cellNum(row, COL.L) !== null ||
  cellNum(row, COL.O) !== null ||
  cellStr(row, COL.E).includes("項");

/** 開始行〜名称エリア終端までのE列テキストを結合して完全な目名称を得る */
const collectFullName = (
  dataRows: ReadonlyArray<Row>,
  startIndex: number,
  endIndex: number,
): string => {
  const following = dataRows.slice(startIndex + 1, endIndex);
  const stopIdx = following.findIndex(isNameAreaEnd);
  const nameArea = stopIdx === -1 ? following : following.slice(0, stopIdx);
  return [
    cellStr(dataRows[startIndex]!, COL.E),
    ...nameArea
      .filter((row) => cellCode(row, COL.C) === null && cellStr(row, COL.E).length > 0)
      .map((row) => cellStr(row, COL.E)),
  ].join("");
};

const requireNum = (row: Row, col: number, field: string, mokuName: string): number => {
  const v = cellNum(row, col);
  return v !== null
    ? v
    : (() => { throw new Error(`Missing required budget field "${field}" in 目 "${mokuName}"`); })();
};

const extractBudget = (row: Row, mokuName: string): MokuBudget => ({
  honendo:              requireNum(row, COL.L,  "honendo",  mokuName),
  zenendo:              requireNum(row, COL.O,  "zenendo",  mokuName),
  hikaku:               requireNum(row, COL.R,  "hikaku",   mokuName),
  // 財源内訳は空セル = 0円（予算書の慣習）
  kokuken_shishutukin:  cellNum(row, COL.U)  ?? 0,
  chihousai:            cellNum(row, COL.X)  ?? 0,
  sonota:               cellNum(row, COL.AA) ?? 0,
  ippan_zaigen:         cellNum(row, COL.AE) ?? 0,
});

const isKeiRow = (row: Row): boolean =>
  cellStr(row, COL.C) === "計";

/** Split into 目 chunks + optional 計 row for validation */
export const splitByMoku = (
  rows: ReadonlyArray<Row>,
): Readonly<{
  chunks: ReadonlyArray<MokuChunk>;
  keiRow: Row | null;
}> => {
  const keiRow = rows.find(isKeiRow) ?? null;
  const dataRows = rows.filter((r) => !isKeiRow(r));

  // Pass 1: 目の開始行インデックスを収集
  const startIndices: ReadonlyArray<number> = dataRows.reduce<ReadonlyArray<number>>(
    (acc, row, index) => isMokuStart(row) ? [...acc, index] : acc,
    [],
  );

  // Pass 2: 各目の完全名称を結合しつつチャンクを構築
  const chunks: ReadonlyArray<MokuChunk> = startIndices.map((startIdx, i) => {
    const nextIdx = i + 1 < startIndices.length ? startIndices[i + 1]! : dataRows.length;
    const fullName = collectFullName(dataRows, startIdx, nextIdx);
    return {
      code: cellCode(dataRows[startIdx]!, COL.C)!,
      name: fullName,
      budget: extractBudget(dataRows[startIdx]!, fullName),
      rows: dataRows.slice(startIdx, nextIdx),
    };
  });

  return { chunks, keiRow };
};
