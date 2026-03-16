/**
 * Step 5: 組み立てパイプライン
 *
 * Sheet[] → ParseResult (目テーブル + 節テーブル + 説明テーブル)
 *
 * Pure function: workbook buffer → structured data + validation errors.
 * No state machine. Context is threaded as function arguments.
 */

import { readBudgetExcel, type SheetData } from "./excel";
import { extractSetsu } from "./extractSetsu";
import { extractSetsumei, flattenSetsumeiTree } from "./extractSetsumei";
import { parseSheetName } from "./parseSheetName";
import { splitByKou } from "./splitByKou";
import { splitByMoku } from "./splitByMoku";
import { stripHeaders } from "./stripHeaders";
import type {
    Context,
    MokuOutput,
    ParseResult,
    SetsuOutput,
    SetsumeiOutput,
    ValidationError
} from "./types";
import { validateKouSum, validateSetsuSum, validateSetsumeiSum } from "./validate";

type PipelineResult = Readonly<{
  data: ParseResult;
  errors: ReadonlyArray<ValidationError>;
}>;

/** Process a single sheet (款) */
const processSheet = (sheet: SheetData): PipelineResult => {
  const { 款_code, 款_name } = parseSheetName(sheet.sheetName);
  const cleanSheetRows = stripHeaders(sheet.rows);
  const kouChunks = splitByKou(cleanSheetRows);

  return kouChunks.reduce<PipelineResult>(
    (outerAcc, kou) => {
      const cleanRows = kou.rows;
      const { chunks: mokuChunks, keiRow } = splitByMoku(cleanRows);

      const mokuResults = mokuChunks.map((moku) => {
        const context: Context = {
          款_code, 款_name,
          項_code: kou.項_code,
          項_name: kou.項_name,
          目_code: moku.目_code,
          目_name: moku.目_name,
        };

        const setsuList = extractSetsu(moku.rows);
        const setsumeiTree = extractSetsumei(moku.rows);
        const flatSetsumei = flattenSetsumeiTree(setsumeiTree);

        const mokuOutput: MokuOutput = { ...context, ...moku.meta };

        const setsuOutputs: ReadonlyArray<SetsuOutput> = setsuList.map((s) => ({
          ...context,
          節_code: s.節_code,
          節_name: s.節_name,
          金額: s.金額,
          細節: s.細節,
        }));

        const setsumeiOutputs: ReadonlyArray<SetsumeiOutput> = flatSetsumei.map((s) => ({
          ...context,
          ...s,
        }));

        const errors: ReadonlyArray<ValidationError> = [
          ...validateSetsuSum(context, moku.meta, setsuList),
          ...validateSetsumeiSum(context, moku.meta, setsumeiTree),
        ];

        return { mokuOutput, setsuOutputs, setsumeiOutputs, errors, meta: moku.meta };
      });

      // 項 level validation
      const kouErrors = validateKouSum(
        { 款_code, 款_name, 項_code: kou.項_code, 項_name: kou.項_name },
        keiRow,
        mokuResults.map((r) => r.meta),
      );

      return {
        data: {
          目: [...outerAcc.data.目, ...mokuResults.map((r) => r.mokuOutput)],
          節: [...outerAcc.data.節, ...mokuResults.flatMap((r) => r.setsuOutputs)],
          説明: [...outerAcc.data.説明, ...mokuResults.flatMap((r) => r.setsumeiOutputs)],
        },
        errors: [
          ...outerAcc.errors,
          ...mokuResults.flatMap((r) => r.errors),
          ...kouErrors,
        ],
      };
    },
    { data: { 目: [], 節: [], 説明: [] }, errors: [] },
  );
};

/** Main pipeline: Buffer → ParseResult + ValidationErrors */
export const parseBudgetExcel = (buffer: Buffer): PipelineResult => {
  const sheets = readBudgetExcel(buffer);
  return sheets.reduce<PipelineResult>(
    (acc, sheet) => {
      const result = processSheet(sheet);
      return {
        data: {
          目: [...acc.data.目, ...result.data.目],
          節: [...acc.data.節, ...result.data.節],
          説明: [...acc.data.説明, ...result.data.説明],
        },
        errors: [...acc.errors, ...result.errors],
      };
    },
    { data: { 目: [], 節: [], 説明: [] }, errors: [] },
  );
};
