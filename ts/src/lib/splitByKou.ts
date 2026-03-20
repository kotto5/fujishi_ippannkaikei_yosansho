/**
 * Step 1: 款チャンク → 項チャンクに分割
 *
 * E列(col 5)に "N項　XXX" パターンが出現する行を境界とする。
 * 同じ項番号の繰り返し（ページヘッダーによる再表示）は無視し、
 * kou_code が変化した行だけを真の境界とする。
 *
 * Full-width digits (１, ２, ...) are normalized before matching.
 */

import { COL, type KouChunk, type KouCode, type Row } from "./types";
import { cellStr, normalizeDigits } from "./util";

/** 項パターン: "　N項　XXX" — handles full-width digits and spaces */
const KOU_PATTERN = /^\s*(\d+)項\s+(.+)$/;

type KouBoundary = Readonly<{
  index: number;
  code: KouCode;
  name: string;
}>;

/** Find all 項 boundary rows where kou_code changes */
const findKouBoundaries = (rows: ReadonlyArray<Row>): ReadonlyArray<KouBoundary> =>
  rows.reduce<ReadonlyArray<KouBoundary>>((acc, row, index) => {
    const eVal = normalizeDigits(cellStr(row, COL.E));
    const m = eVal.match(KOU_PATTERN);
    return m === null
      ? acc
      : (() => {
          const code = parseInt(m[1]!, 10) as KouCode;
          const lastCode = acc.length > 0 ? acc[acc.length - 1]!.code : -1;
          return code === lastCode
            ? acc
            : [...acc, { index, code, name: m[2]!.trim() }];
        })();
  }, []);

/** Split rows into 項 chunks based on boundaries */
export const splitByKou = (rows: ReadonlyArray<Row>): ReadonlyArray<KouChunk> => {
  const boundaries = findKouBoundaries(rows);
  return boundaries.map((boundary, i) => {
    const nextIndex = i + 1 < boundaries.length
      ? boundaries[i + 1]!.index
      : rows.length;
    return {
      code: boundary.code,
      name: boundary.name,
      rows: rows.slice(boundary.index, nextIndex),
    };
  });
};
