/**
 * Step 6: 検算
 *
 * - 各目の honendo ＝ その目の節レコードの amount 合計
 * - 各目の honendo ＝ その目の大事業レコードの BR amount 合計
 * - 各項の合計行 ＝ その項の目の honendo 合計
 */

import type {
    KouCtx,
    MokuBudget,
    MokuCtx,
    Row,
    Setsu,
    Setsumei,
    ValidationError,
} from "./types";
import { COL } from "./types";

const sum = (ns: ReadonlyArray<number | null>): number =>
  ns.reduce<number>((acc, n) => acc + (n ?? 0), 0);

/** Validate 節 sum matches 目 honendo */
export const validateSetsuSum = (
  context: MokuCtx,
  budget: MokuBudget,
  setsuList: ReadonlyArray<Setsu>,
): ReadonlyArray<ValidationError> => {
  const expected = budget.honendo;
  const actual = sum(setsuList.map((s) => s.amount));
  return actual === expected
    ? []
    : [{ type: "setsu_sum_mismatch" as const, context, expected, actual }];
};

/** Validate 大事業 BR sum matches 目 honendo */
export const validateSetsumeiSum = (
  context: MokuCtx,
  budget: MokuBudget,
  tree: ReadonlyArray<Setsumei>,
): ReadonlyArray<ValidationError> => {
  const expected = budget.honendo;
  const actual = sum(tree.map((d) => d.amount));
  return actual === expected
    ? []
    : [{ type: "setsumei_sum_mismatch" as const, context, expected, actual }];
};

/** Validate 項合計 (計 row) matches sum of 目 honendo */
export const validateKouSum = (
  context: KouCtx,
  keiRow: Row | null,
  budgets: ReadonlyArray<MokuBudget>,
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
        const actual = sum(budgets.map((m) => m.honendo));
        const mokuCtx: MokuCtx = { ...context, moku_code: 0, moku_name: "計" };
        return actual === expected
          ? []
          : [{ type: "kou_sum_mismatch" as const, context: mokuCtx, expected, actual }];
      })();
};
