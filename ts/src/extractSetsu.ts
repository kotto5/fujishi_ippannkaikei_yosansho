/**
 * Step 4a: 目チャンク → 節の抽出
 *
 * AL列(col 38)に数値的な値がある行を節の先頭(indent 0)として分割。
 * 同一チャンク内でAQ列に数値を持つ行は子ノード(indent 1)として扱う。
 * AN列のみ持つ行は先頭ノードの名称継続行として結合する。
 */

import { COL, type Row, type Setsu } from "./types";
import { cellCode, cellIsNumber, cellNum, cellStr } from "./util";
import { buildTree, type TreeRow } from "./treeBuilder";

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

/**
 * Convert a single 節 chunk into TreeRows.
 * - Head row  → indent 0, code from AL, name from AN (merged with continuation rows)
 * - Child row → indent 1, code null, name from AN, amount from AQ
 */
const chunkToTreeRows = (chunk: ReadonlyArray<Row>): ReadonlyArray<TreeRow> => {
  const head = chunk[0]!;
  const codeNum = cellCode(head, COL.AL);
  const code = codeNum !== null ? String(codeNum) : null;
  const nameHead = cellStr(head, COL.AN);
  const amount = cellIsNumber(head, COL.AQ) ? cellNum(head, COL.AQ) : null;

  const { nameParts, children } = chunk.slice(1).reduce<
    Readonly<{ nameParts: ReadonlyArray<string>; children: ReadonlyArray<TreeRow> }>
  >(
    (acc, row) => {
      const an = cellStr(row, COL.AN);
      const aqIsNum = cellIsNumber(row, COL.AQ);
      const aq = aqIsNum ? cellNum(row, COL.AQ) : null;
      return an.length === 0
        ? acc
        : !aqIsNum
          ? { ...acc, nameParts: [...acc.nameParts, an] }
          : { ...acc, children: [...acc.children, { indent: 1, code: null, name: an, amount: aq }] };
    },
    { nameParts: [], children: [] },
  );

  const headRow: TreeRow = { indent: 0, code, name: [nameHead, ...nameParts].join(""), amount };
  return [headRow, ...children];
};

export const toSetsuRows = (rows: ReadonlyArray<Row>): ReadonlyArray<TreeRow> =>
  splitAtSetsuBoundaries(rows).flatMap(chunkToTreeRows);

/** Extract all 節 records from a 目 chunk */
export const extractSetsu = (rows: ReadonlyArray<Row>): ReadonlyArray<Setsu> =>
  buildTree(toSetsuRows(rows));
