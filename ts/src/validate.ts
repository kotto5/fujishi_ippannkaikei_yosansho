/**
 * Step 6: 検算
 *
 * - 各目の 本年度 ＝ その目の節レコードの 金額合計
 * - 各目の 本年度 ＝ その目の大事業レコードの BR金額合計
 * - 各項の合計行 ＝ その項の目の 本年度 合計
 */

import type {
    Context,
    DaijigyouRecord,
    MokuMeta,
    Row,
    SetsuRecord,
    ValidationError,
} from "./types";
import { COL } from "./types";

const sum = (ns: ReadonlyArray<number | null>): number =>
  ns.reduce<number>((acc, n) => acc + (n ?? 0), 0);

/** Validate 節 sum matches 目 本年度 */
export const validateSetsuSum = (
  context: Context,
  meta: MokuMeta,
  setsuList: ReadonlyArray<SetsuRecord>,
): ReadonlyArray<ValidationError> => {
  const expected = meta.本年度;
  return expected === null
    ? []
    : (() => {
        const actual = sum(setsuList.map((s) => s.金額));
        return actual === expected
          ? []
          : [{ type: "setsu_sum_mismatch" as const, context, expected, actual }];
      })();
};

/** Validate 大事業 BR sum matches 目 本年度 */
export const validateSetsumeiSum = (
  context: Context,
  meta: MokuMeta,
  tree: ReadonlyArray<DaijigyouRecord>,
): ReadonlyArray<ValidationError> => {
  const expected = meta.本年度;
  return expected === null
    ? []
    : (() => {
        const actual = sum(tree.map((d) => d.金額));
        return actual === expected
          ? []
          : [{ type: "setsumei_sum_mismatch" as const, context, expected, actual }];
      })();
};

/** Validate 項合計 (計 row) matches sum of 目 本年度 */
export const validateKouSum = (
  context: Readonly<{ 款_code: number; 款_name: string; 項_code: number; 項_name: string }>,
  keiRow: Row | null,
  mokuMetas: ReadonlyArray<MokuMeta>,
): ReadonlyArray<ValidationError> => {
  const expected = keiRow !== null
    ? (() => {
        const v = keiRow[COL.L];
        return typeof v === "number" ? v : null;
      })()
    : null;
  return expected === null
    ? []
    : (() => {
        const actual = sum(mokuMetas.map((m) => m.本年度));
        const ctx = { ...context, 目_code: 0, 目_name: "計" } as unknown as Context;
        return actual === expected
          ? []
          : [{ type: "kou_sum_mismatch" as const, context: ctx, expected, actual }];
      })();
};
