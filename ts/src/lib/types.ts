/**
 * Domain types for the Fujishi budget Excel parser.
 * Single source of truth for all data structures.
 *
 * Hierarchy: 款(kan) → 項(kou) → 目(moku) → 節(setsu) / 説明(setsumei)
 */

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
  AT: 46, // 説明 Layer1
  RIGHTMOST: 76, // 右端 BY
} as const;


// ── 予算項目の状態 ──
export type BudgetStatus = '新規' | '増額' | '減額' | '横ばい' | '廃止' | '不明';

// 比較データ
export type CompareRow = Readonly<{
  kan_name: string;
  kou_name: string;
  moku_name: string;
  setsu_layer1_name: string;
  setsu_layer2_name: string;
  setsumei_layer1_name: string;
  setsumei_layer2_name: string;
  setsumei_layer3_name: string;
  // amount は year と 金額 のタプルの配列.
  amount: ReadonlyArray<Readonly<{ year: string; amount: number | null }>>;
}>;


// 中間データ形式
export type ExportDataRow =
  | ExportDataKanRow
  | ExportDataKouRow
  | ExportDataMokuRow
  | ExportDataSetsuRow
  | ExportDataSetsumeiRow;

export type ExportDataKanRow = Readonly<{
  kan_name: string;
  year: number;
  amount: number;
}>

export type ExportDataKouRow = Readonly<{
  kan_name: string;
  kou_name: string;
  year: number;
  amount: number;
}>

export type ExportDataMokuRow = Readonly<{
  kan_name: string;
  kou_name: string;
  moku_name: string;
  year: number;
  amount: number;
}>

export type ExportDataSetsuRow = Readonly<{
  kan_name: string;
  kou_name: string;
  moku_name: string;
  setsu_layer1_name: string;
  setsu_layer2_name: string;
  year: number;
  amount: number | null;
}>

export type ExportDataSetsumeiRow = Readonly<{
  kan_name: string;
  kou_name: string;
  moku_name: string;
  setsumei_layer1_name: string;
  setsumei_layer2_name: string;
  setsumei_layer3_name: string;
  year: number;
  amount: number | null;
}>

// ── Domain model ──

export type Year = Readonly<{
  year: number;
  kans: ReadonlyArray<Kan>;
}>

export type Kan = Readonly<{
  code: number;
  name: string;
  amount: number;
  kou: ReadonlyArray<Kou>;
}>;

export type Kou = Readonly<{
  code: number;
  name: string;
  amount: number;
  moku: ReadonlyArray<Moku>;
}>;

export type Moku = Readonly<{
  code: number;
  name: string;
  honendo: number;
  zenendo: number;
  hikaku: number;
  kokuken_shishutukin: number;
  chihousai: number;
  sonota: number;
  ippan_zaigen: number;
  setsu: ReadonlyArray<Setsu>;
  setsumei: ReadonlyArray<Setsumei>;
}>;

export type Setsu = Readonly<{
  code: string | null;
  name: string;
  amount: number | null;
  children: ReadonlyArray<Setsu>;
}>;

export type SetsuLayer2 = Readonly<Omit<Setsu, "code" | "children">>;

export type Setsumei = Readonly<{
  code: string | null;
  name: string;
  amount: number | null;
  children: ReadonlyArray<Setsumei>;
}>;

/** Budget amounts attached to a Moku (subset for pipeline use) */
export type MokuBudget = Pick<Moku, "honendo" | "zenendo" | "hikaku" | "kokuken_shishutukin" | "chihousai" | "sonota" | "ippan_zaigen">;

// ── Parser intermediate types ──

export type KouChunk = Readonly<{
  code: number;
  name: string;
  amount: number;
  rows: ReadonlyArray<Row>;
}>;

export type MokuChunk = Readonly<{
  code: number;
  name: string;
  budget: MokuBudget;
  rows: ReadonlyArray<Row>;
}>;

// ── Hierarchical context: each level extends the parent ──

export type KanCtx = Readonly<{ kan_code: number; kan_name: string }>;
export type KouCtx = KanCtx & Readonly<{ kou_code: number; kou_name: string }>;
export type MokuCtx = KouCtx & Readonly<{ moku_code: number; moku_name: string }>;

// ── Validation ──

export type ValidationError =
  | Readonly<{
      type: "setsu_sum_mismatch" | "setsumei_sum_mismatch" | "kou_sum_mismatch";
      context: MokuCtx;
      expected: number;
      actual: number;
    }>
  | Readonly<{
      type: "moku_sum_vs_kou";
      context: KouCtx;
      expected: number;
      actual: number;
    }>
  | Readonly<{
      type: "kou_sum_vs_kan";
      context: KanCtx;
      expected: number;
      actual: number;
    }>;
