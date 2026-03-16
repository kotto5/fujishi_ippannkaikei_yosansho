/**
 * Domain types for the Fujishi budget Excel parser.
 * Single source of truth for all data structures.
 *
 * Hierarchy: 款(kan) → 項(kou) → 目(moku) → 節(setsu) / 説明(setsumei)
 */

// ── Branded types for type-safe IDs ──

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type KanCode = Brand<number, "KanCode">;
export type KouCode = Brand<number, "KouCode">;
export type MokuCode = Brand<number, "MokuCode">;
export type SetsuCode = Brand<number, "SetsuCode">;

// ── Cell value: what SheetJS gives us after merge resolution ──

export type CellValue = string | number | boolean | undefined;

/** A single row from the worksheet, indexed by 1-based column number */
export type Row = ReadonlyArray<CellValue>;

// ── Column indices (1-based, matching Excel column positions) ──

export const COL = {
  // Stream ① 目レベル（左側）
  A: 1,
  C: 3,   // 目番号 / 款ヘッダー
  E: 5,   // 目名称 / 項名称
  K: 11,  // 千円 unit row
  L: 12,  // 本年度予算額
  O: 15,  // 前年度予算額
  R: 18,  // 比較
  U: 21,  // 国県支出金
  X: 24,  // 地方債
  AA: 27, // その他
  AB: 28, // 合計再表示列
  AE: 31, // 一般財源

  // Stream ② 節レベル（中央）
  AL: 38, // 節番号
  AN: 40, // 節名称
  AQ: 43, // 節金額

  // Stream ③ 説明レベル（右側）
  AT: 46, // 説明テキスト
  BL: 64, // 細目金額
  BN: 66, // 事業金額
  BR: 70, // 大事業金額
} as const;

// ── 目メタデータ ──

export type MokuMeta = Readonly<{
  本年度: number | null;
  前年度: number | null;
  比較: number | null;
  国県支出金: number | null;
  地方債: number | null;
  その他: number | null;
  一般財源: number | null;
}>;

// ── 節レコード ──

export type SaisetsuRecord = Readonly<{
  name: string;
  金額: number | null;
}>;

export type SetsuRecord = Readonly<{
  節_code: SetsuCode;
  節_name: string;
  金額: number | null;
  細節: ReadonlyArray<SaisetsuRecord>;
}>;

// ── 説明ツリー ──

export type SaimokuRecord = Readonly<{
  name: string;
  金額: number | null;
}>;

export type JigyouRecord = Readonly<{
  事業_code: string | null;
  事業_name: string;
  金額: number | null;
  細目: ReadonlyArray<SaimokuRecord>;
}>;

export type DaijigyouRecord = Readonly<{
  大事業_code: string | null;
  大事業_name: string;
  金額: number | null;
  事業: ReadonlyArray<JigyouRecord>;
}>;

// ── チャンク型 ──

export type KouChunk = Readonly<{
  項_code: KouCode;
  項_name: string;
  rows: ReadonlyArray<Row>;
}>;

export type MokuChunk = Readonly<{
  目_code: MokuCode;
  目_name: string;
  meta: MokuMeta;
  rows: ReadonlyArray<Row>;
}>;

// ── 組み立て済みレコード ──

export type Context = Readonly<{
  款_code: KanCode;
  款_name: string;
  項_code: KouCode;
  項_name: string;
  目_code: MokuCode;
  目_name: string;
}>;

export type MokuOutput = Readonly<
  Context & MokuMeta
>;

export type SetsuOutput = Readonly<
  Context & {
    節_code: SetsuCode;
    節_name: string;
    金額: number | null;
    細節: ReadonlyArray<SaisetsuRecord>;
  }
>;

export type FlatSetsumeiRecord = Readonly<{
  大事業_code: string | null;
  大事業_name: string;
  大事業_金額: number | null;
  事業_code: string | null;
  事業_name: string;
  事業_金額: number | null;
  細目_name: string | null;
  細目_金額: number | null;
}>;

export type SetsumeiOutput = Readonly<
  Context & FlatSetsumeiRecord
>;

// ── パース結果 ──

export type ParseResult = Readonly<{
  目: ReadonlyArray<MokuOutput>;
  節: ReadonlyArray<SetsuOutput>;
  説明: ReadonlyArray<SetsumeiOutput>;
}>;

// ── 検算エラー ──

export type ValidationError = Readonly<{
  type: "setsu_sum_mismatch" | "setsumei_sum_mismatch" | "kou_sum_mismatch";
  context: Context;
  expected: number;
  actual: number;
}>;
