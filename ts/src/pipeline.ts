/**
 * Main pipeline: Excel buffer → ReadonlyArray<Kan>
 *
 * Pure function. No state machine. Context threaded as function arguments.
 * Builds the domain tree directly: Kan → Kou → Moku (with setsu + setsumei).
 */

import { readBudgetExcel, type SheetData } from "./excel";
import { extractSetsu } from "./extractSetsu";
import { extractSetsumei } from "./extractSetsumei";
import { parseSheetName } from "./parseSheetName";
import { splitByKou } from "./splitByKou";
import { splitByMoku } from "./splitByMoku";
import { stripHeaders } from "./stripHeaders";
import type { Kan, Kou, KouCtx, Moku, MokuBudget, MokuChunk, ValidationError } from "./types";
import { validateKouSum, validateSetsuSum, validateSetsumeiSum } from "./validate";

// ── Generic accumulator: chunk → node + errors ──

type WithErrors<T> = Readonly<{
  value: T;
  errors: ReadonlyArray<ValidationError>;
}>;

/** Fold chunks into a parent node, accumulating errors from each child + optional parent-level validation */
const foldChunks = <Chunk, Child, Parent>(
  chunks: ReadonlyArray<Chunk>,
  processChunk: (chunk: Chunk) => WithErrors<Child>,
  assemble: (children: ReadonlyArray<Child>) => Parent,
  validate: (children: ReadonlyArray<Child>) => ReadonlyArray<ValidationError> = () => [],
): WithErrors<Parent> => {
  const results = chunks.map(processChunk);
  const children = results.map((r) => r.value);
  return {
    value: assemble(children),
    errors: [...results.flatMap((r) => r.errors), ...validate(children)],
  };
};

// ── Per-level processors ──

const processMoku = (chunk: MokuChunk, ctx: KouCtx): WithErrors<Moku & { budget: MokuBudget }> => {
  const setsuList = extractSetsu(chunk.rows);
  const setsumeiTree = extractSetsumei(chunk.rows);
  const mokuCtx = { ...ctx, moku_code: chunk.code, moku_name: chunk.name };
  return {
    value: {
      code: chunk.code,
      name: chunk.name,
      ...chunk.budget,
      setsu: setsuList,
      setsumei: setsumeiTree,
      budget: chunk.budget,
    },
    errors: [
      ...validateSetsuSum(mokuCtx, chunk.budget, setsuList),
      ...validateSetsumeiSum(mokuCtx, chunk.budget, setsumeiTree),
    ],
  };
};

/** Process a single sheet → Kan */
const processSheet = (sheet: SheetData): WithErrors<Kan> => {
  const { kan_code, kan_name } = parseSheetName(sheet.sheetName);
  const cleanRows = stripHeaders(sheet.rows);

  return foldChunks(
    splitByKou(cleanRows),
    (kouChunk) => {
      const { chunks: mokuChunks, keiRow } = splitByMoku(kouChunk.rows);
      const kouCtx: KouCtx = { kan_code, kan_name, kou_code: kouChunk.code, kou_name: kouChunk.name };

      return foldChunks(
        mokuChunks,
        (mc) => processMoku(mc, kouCtx),
        (mokus): Kou => ({
          code: kouChunk.code,
          name: kouChunk.name,
          moku: mokus.map(({ budget: _, ...m }) => m),
        }),
        (mokus) => validateKouSum(kouCtx, keiRow, mokus.map((m) => m.budget)),
      );
    },
    (kous): Kan => ({ code: kan_code, name: kan_name, kou: kous }),
  );
};

/** Main pipeline: Buffer → domain tree + validation errors */
export const parseBudgetExcel = (buffer: Buffer): WithErrors<ReadonlyArray<Kan>> => {
  const sheets = readBudgetExcel(buffer);
  return foldChunks(
    sheets,
    processSheet,
    (kans) => kans,
  );
};
