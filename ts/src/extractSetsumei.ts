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

// ── Indent detection ──

const ZENKAKU_SPACE = "\u3000";

/** Count leading full-width spaces (U+3000) */
const countLeadingZenkakuSpaces = (s: string): number => {
  const m = s.match(/^(\u3000*)/);
  return m?.[1]?.length ?? 0;
};

type IndentLevel = 0 | 1 | 4 | "continuation";

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
  indent: number;
  code: string | null;
  name: string;
  amount: number | null;
}>;

/** Check if AT text is a header remnant (e.g. "説　　明" with internal spaces) */
const isHeaderText = (s: string): boolean => {
  const collapsed = s.replace(/[\u3000\s]+/g, "");
  return collapsed === "説明" || collapsed === "千円";
};

/** Extract AT-column rows with indent classification */
const toSetsumeiRows = (rows: ReadonlyArray<Row>): ReadonlyArray<SetsumeiRow> => {
  const { result } = rows.reduce<{ result: SetsumeiRow[]; skipNext: boolean }>(
    ({ result, skipNext }, row, index, arr) => {
      if (skipNext) return { result, skipNext: false };

      const raw = cellRaw(row, COL.AT);
      if (raw.length <= 0 || isHeaderText(raw)) return { result, skipNext: false };

      const countSpaces = countLeadingZenkakuSpaces(raw);
      const nextRow = arr[index + 1]; // TODO: 三行以上の説明テキストへの対応. その場合は while で次行もチェックする必要がある. skipNext ではなく, skipLines: number みたいな形で管理する必要がある
      const nextraw = nextRow ? cellRaw(nextRow, COL.AT).trim() : "";
      const text = raw.trim() + nextraw;
      // using splitCodeName
      const { code, name } = splitCodeName(text);

      for (let i = COL.AT + 1; i < COL.RIGHTMOST; i++) {
        const amount = safeNum(row, i);
        if (amount !== null) {
          return {
            result: [...result, { indent: countSpaces, code, name, amount }],
            skipNext: i === COL.BR, // 大事業金額があれば次行は説明の続きの可能性が高いのでスキップする
          };
        }
      }
      // TODO: 先頭行でない行に amount が書かれる場合はあるか? あるなら対応しなければならない。上行は1行目に amount がある場合の例
      return {
        result: [...result, { indent: countSpaces, code, name, amount: null }],
        skipNext: false,
      };
    },
    { result: [], skipNext: false }
  );
  return result;
};

const buildTree = (arr: ReadonlyArray<SetsumeiRow>): ReadonlyArray<Setsumei> => {
  const root : Setsumei = { code: null, name: "root", amount: null, children: [] };
  // スタックに { node, indent } を積む
  const stack = [{ node: root, indent: -1 }];

  for (const line of arr) {
    const indent = line.indent;
    const name = line.name;
    const code = line.code;
    const amount = line.amount;
    const node = { name, children: [], code, amount };

    // インデントが自分以下になるまでスタックを巻き戻す
    const index = stack.length - 1;
    while (stack[index].indent >= indent) {
      stack.pop();
    }

    // スタックのトップが親
    const parent = stack[index]?.node;
    parent.children.push(node);

    // 自分をスタックに積む（次の要素の親候補になる）
    stack.push({ node, indent });
  }

  return root.children;
}

/** Extract 説明 tree from a 目 chunk */
export const extractSetsumei = (rows: ReadonlyArray<Row>): ReadonlyArray<Setsumei> => {
  const lines = toSetsumeiRows(rows);
  return buildTree(lines);
};
