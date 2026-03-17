/**
 * Step 3: ヘッダー除去済みの項チャンク → 目チャンクに分割
 *
 * C列(col 3)に数値(string or number) + E列(col 5)に目名称 → 目の開始行。
 * C列が "計" の行は項合計行（検算用に別途返す）。
 */

import { COL, type MokuBudget, type MokuChunk, type MokuCode, type Row } from "./types";
import { cellCode, cellIsNumber, cellNum, cellStr } from "./util";

type MokuBoundary = Readonly<{
  index: number;
  code: MokuCode;
  name: string;
  budget: MokuBudget;
}>;

/** 目の開始行: C列に数値的な値 + E列に名称 */
const isMokuStart = (row: Row): boolean => {
  const code = cellCode(row, COL.C);
  const name = cellStr(row, COL.E);
  return code !== null && name.length > 0 && !name.includes("項");
};

const extractBudget = (row: Row): MokuBudget => ({
  honendo: cellIsNumber(row, COL.L) ? cellNum(row, COL.L) : null,
  zenendo: cellIsNumber(row, COL.O) ? cellNum(row, COL.O) : null,
  hikaku: cellIsNumber(row, COL.R) ? cellNum(row, COL.R) : null,
  kokuken_shishutukin: cellIsNumber(row, COL.U) ? cellNum(row, COL.U) : null,
  chihousai: cellIsNumber(row, COL.X) ? cellNum(row, COL.X) : null,
  sonota: cellIsNumber(row, COL.AA) ? cellNum(row, COL.AA) : null,
  ippan_zaigen: cellIsNumber(row, COL.AE) ? cellNum(row, COL.AE) : null,
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

  const boundaries: ReadonlyArray<MokuBoundary> = dataRows.reduce<ReadonlyArray<MokuBoundary>>(
    (acc, row, index) =>
      isMokuStart(row)
        ? [
            ...acc,
            {
              index,
              code: cellCode(row, COL.C)! as MokuCode,
              name: cellStr(row, COL.E),
              budget: extractBudget(row),
            },
          ]
        : acc,
    [],
  );

  const chunks: ReadonlyArray<MokuChunk> = boundaries.map((boundary, i) => {
    const nextIndex = i + 1 < boundaries.length
      ? boundaries[i + 1]!.index
      : dataRows.length;
    return {
      code: boundary.code,
      name: boundary.name,
      budget: boundary.budget,
      rows: dataRows.slice(boundary.index, nextIndex),
    };
  });

  return { chunks, keiRow };
};
