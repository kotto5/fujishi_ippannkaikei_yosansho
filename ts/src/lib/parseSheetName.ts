/**
 * Step 0: SheetData → 款 (kan) code, name & amount.
 *
 * Sheet name pattern: "２款＿総務費" → code=2, name="総務費"
 * Amount: first numeric value found scanning right from COL.E on the 款 header row.
 */

import type { SheetData } from "./excel";
import { isKanHeader } from "./stripHeaders";
import { COL } from "./types";
import { normalizeDigits, requireFirstNumRight } from "./util";

export type KanMeta = Readonly<{ kan_code: number; kan_name: string; kan_amount: number }>;

const parseNameFromSheet = (sheetName: string): Readonly<{ kan_code: number; kan_name: string }> => {
  const match = sheetName.match(/^(.+?)款＿(.+?)$/);
  return match === null
    ? (() => { throw new Error(`Invalid sheet name: ${sheetName}`); })()
    : {
        kan_code: parseInt(normalizeDigits(match[1]!.trim()), 10),
        kan_name: match[2]!,
      };
};

/** Parse sheet → { kan_code, kan_name, kan_amount } */
export const parseKanMeta = (sheet: SheetData): KanMeta => {
  const { kan_code, kan_name } = parseNameFromSheet(sheet.sheetName);
  const headerRow = sheet.rows.find(isKanHeader);
  const kan_amount = headerRow !== undefined
    ? requireFirstNumRight(headerRow, COL.E, `款 "${kan_name}"`)
    : (() => { throw new Error(`款 header row not found for "${kan_name}"`); })();
  return { kan_code, kan_name, kan_amount };
};
