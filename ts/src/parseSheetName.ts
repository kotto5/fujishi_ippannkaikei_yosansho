/**
 * Step 0: Sheet name → 款 (kan) code & name.
 *
 * Pattern: "２款＿総務費" → (2, "総務費")
 * Handles both full-width (１〜９) and half-width (10+) digits.
 */

import type { KanCode } from "./types";
import { normalizeDigits } from "./util";

/** Parse sheet name like "２款＿総務費" → { 款_code, 款_name } */
export const parseSheetName = (
  sheetName: string,
): Readonly<{ 款_code: KanCode; 款_name: string }> => {
  const match = sheetName.match(/^(.+?)款＿(.+?)$/);
  return match === null
    ? (() => { throw new Error(`Invalid sheet name: ${sheetName}`); })()
    : {
        款_code: parseInt(normalizeDigits(match[1]!.trim()), 10) as KanCode,
        款_name: match[2]!,
      };
};
