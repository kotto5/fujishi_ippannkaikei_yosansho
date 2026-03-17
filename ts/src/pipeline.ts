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
import type { Kan, Kou, Moku, ValidationError } from "./types";
import { validateKouSum, validateSetsuSum, validateSetsumeiSum } from "./validate";

type PipelineResult = Readonly<{
  data: ReadonlyArray<Kan>;
  errors: ReadonlyArray<ValidationError>;
}>;

/** Process a single sheet → Kan */
const processSheet = (sheet: SheetData): Readonly<{ kan: Kan; errors: ReadonlyArray<ValidationError> }> => {
  const { kan_code, kan_name } = parseSheetName(sheet.sheetName);
  const cleanSheetRows = stripHeaders(sheet.rows);
  const kouChunks = splitByKou(cleanSheetRows);

  const kouResults = kouChunks.map((kouChunk) => {
    const { chunks: mokuChunks, keiRow } = splitByMoku(kouChunk.rows);

    const mokuResults = mokuChunks.map((mokuChunk) => {
      const setsuList = extractSetsu(mokuChunk.rows);
      const setsumeiTree = extractSetsumei(mokuChunk.rows);

      const moku: Moku = {
        code: mokuChunk.code,
        name: mokuChunk.name,
        ...mokuChunk.budget,
        setsu: setsuList,
        setsumei: setsumeiTree,
      };

      const ctx = { kan_code, kan_name, kou_code: kouChunk.code, kou_name: kouChunk.name, moku_code: mokuChunk.code, moku_name: mokuChunk.name };
      const errors: ReadonlyArray<ValidationError> = [
        ...validateSetsuSum(ctx, mokuChunk.budget, setsuList),
        ...validateSetsumeiSum(ctx, mokuChunk.budget, setsumeiTree),
      ];

      return { moku, errors, budget: mokuChunk.budget };
    });

    const kouErrors = validateKouSum(
      { kan_code, kan_name, kou_code: kouChunk.code, kou_name: kouChunk.name },
      keiRow,
      mokuResults.map((r) => r.budget),
    );

    const kou: Kou = {
      code: kouChunk.code,
      name: kouChunk.name,
      moku: mokuResults.map((r) => r.moku),
    };

    return { kou, errors: [...mokuResults.flatMap((r) => r.errors), ...kouErrors] };
  });

  const kan: Kan = {
    code: kan_code,
    name: kan_name,
    kou: kouResults.map((r) => r.kou),
  };

  return { kan, errors: kouResults.flatMap((r) => r.errors) };
};

/** Main pipeline: Buffer → domain tree + validation errors */
export const parseBudgetExcel = (buffer: Buffer): PipelineResult => {
  const sheets = readBudgetExcel(buffer);
  const results = sheets.map(processSheet);
  return {
    data: results.map((r) => r.kan),
    errors: results.flatMap((r) => r.errors),
  };
};
