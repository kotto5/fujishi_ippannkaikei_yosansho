/**
 * Step 3: ヘッダー除去済みの項チャンク → 目チャンクに分割
 *
 * C列(col 3)に数値(string or number) + E列(col 5)に目名称 → 目の開始行。
 * C列が "計" の行は項合計行（検算用に別途返す）。
 */

import { COL, type MokuChunk, type MokuCode, type MokuMeta, type Row } from "./types";
import { cellCode, cellIsNumber, cellNum, cellStr } from "./util";

type MokuBoundary = Readonly<{
  index: number;
  code: MokuCode;
  name: string;
  meta: MokuMeta;
}>;

/** 目の開始行: C列に数値的な値 + E列に名称 */
const isMokuStart = (row: Row): boolean => {
  const code = cellCode(row, COL.C);
  const name = cellStr(row, COL.E);
  return code !== null && name.length > 0 && !name.includes("項");
};

const extractMeta = (row: Row): MokuMeta => ({
  本年度: cellIsNumber(row, COL.L) ? cellNum(row, COL.L) : null,
  前年度: cellIsNumber(row, COL.O) ? cellNum(row, COL.O) : null,
  比較: cellIsNumber(row, COL.R) ? cellNum(row, COL.R) : null,
  国県支出金: cellIsNumber(row, COL.U) ? cellNum(row, COL.U) : null,
  地方債: cellIsNumber(row, COL.X) ? cellNum(row, COL.X) : null,
  その他: cellIsNumber(row, COL.AA) ? cellNum(row, COL.AA) : null,
  一般財源: cellIsNumber(row, COL.AE) ? cellNum(row, COL.AE) : null,
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
              meta: extractMeta(row),
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
      目_code: boundary.code,
      目_name: boundary.name,
      meta: boundary.meta,
      rows: dataRows.slice(boundary.index, nextIndex),
    };
  });

  return { chunks, keiRow };
};
