/**
 * Step 0: Sheet name → 款 (kan) code & name.
 *
 * Pattern: "２款＿総務費" → (2, "総務費")
 * Handles both full-width (１〜９) and half-width (10+) digits.
 */

import { normalizeDigits } from "./util";

/** Parse sheet name like "２款＿総務費" → { kan_code, kan_name } */
export const parseSheetName = (
  sheetName: string,
): Readonly<{ kan_code: number; kan_name: string }> => {
  const match = sheetName.match(/^(.+?)款＿(.+?)$/);
  return match === null
    ? (() => { throw new Error(`Invalid sheet name: ${sheetName}`); })()
    : {
        kan_code: parseInt(normalizeDigits(match[1]!.trim()), 10),
        kan_name: match[2]!,
      };
};
