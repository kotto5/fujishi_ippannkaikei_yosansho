/**
 * Step 4a: 目チャンク → 節の抽出
 *
 * AL列(col 38)に数値的な値がある行を節の先頭として分割。
 * Handles both string "1" and number 1 in AL column.
 */

import { COL, type Row, type SaisetsuRecord, type SetsuCode, type SetsuRecord } from "./types";
import { cellCode, cellIsNumber, cellNum, cellStr } from "./util";

const hasSetsuCode = (row: Row): boolean =>
  cellCode(row, COL.AL) !== null;

/** Split rows at positions where AL column has a numeric value */
const splitAtSetsuBoundaries = (rows: ReadonlyArray<Row>): ReadonlyArray<ReadonlyArray<Row>> => {
  const indices = rows.reduce<ReadonlyArray<number>>(
    (acc, row, i) => hasSetsuCode(row) ? [...acc, i] : acc,
    [],
  );
  return indices.map((startIdx, i) => {
    const endIdx = i + 1 < indices.length ? indices[i + 1]! : rows.length;
    return rows.slice(startIdx, endIdx);
  });
};

/** Parse a single 節 chunk into a SetsuRecord */
const parseSetsuChunk = (chunk: ReadonlyArray<Row>): SetsuRecord => {
  const head = chunk[0]!;
  const code = cellCode(head, COL.AL)! as SetsuCode;
  const nameHead = cellStr(head, COL.AN);
  const amount = cellIsNumber(head, COL.AQ) ? cellNum(head, COL.AQ) : null;

  const { nameParts, saisetsu } = chunk.slice(1).reduce<
    Readonly<{ nameParts: ReadonlyArray<string>; saisetsu: ReadonlyArray<SaisetsuRecord> }>
  >(
    (acc, row) => {
      const an = cellStr(row, COL.AN);
      const aqIsNum = cellIsNumber(row, COL.AQ);
      const aq = aqIsNum ? cellNum(row, COL.AQ) : null;
      return an.length === 0
        ? acc
        : !aqIsNum
          ? { ...acc, nameParts: [...acc.nameParts, an] }
          : { ...acc, saisetsu: [...acc.saisetsu, { name: an, 金額: aq }] };
    },
    { nameParts: [], saisetsu: [] },
  );

  return {
    節_code: code,
    節_name: [nameHead, ...nameParts].join(""),
    金額: amount,
    細節: saisetsu,
  };
};

/** Extract all 節 records from a 目 chunk */
export const extractSetsu = (rows: ReadonlyArray<Row>): ReadonlyArray<SetsuRecord> =>
  splitAtSetsuBoundaries(rows).map(parseSetsuChunk);
