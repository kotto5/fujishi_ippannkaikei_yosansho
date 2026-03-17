/**
 * Debug script: 各パース過程の生データをファイルにダンプする。
 *
 * Usage: npx tsx src/debug.ts <path> [款名] [項名] [目名]
 *
 * フィルタなし → 全シートのサマリー
 * 款名指定    → そのシートの項チャンク一覧
 * 項名まで    → その項の stripHeaders 前後 + 目チャンク一覧
 * 目名まで    → その目の節・説明の生データ
 *
 * 出力先: outputs/debug/ 以下にテキストファイル
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readBudgetExcel } from "./excel";
import { extractSetsu } from "./extractSetsu";
import { extractSetsumei } from "./extractSetsumei";
import { parseSheetName } from "./parseSheetName";
import { splitByKou } from "./splitByKou";
import { splitByMoku } from "./splitByMoku";
import { isHeaderRow, stripHeaders } from "./stripHeaders";
import { COL, type Row } from "./types";
import { cellStr, cellNum, cellIsNumber, cellRaw } from "./util";

const inputBasename = (process.argv[2] ?? "unknown").replace(/^.*\//, "").replace(/\.[^.]+$/, "");
const OUT_DIR = join(import.meta.dirname ?? ".", "..", "..", "outputs", "debug", inputBasename);

/** Accumulate lines then flush to file */
const createWriter = () => {
  const lines: string[] = [];
  return {
    log: (msg: string): true => (lines.push(msg), true),
    logJson: (label: string, data: unknown): true => (
      lines.push(`\n=== ${label} ===`),
      lines.push(JSON.stringify(data, null, 2)),
      true
    ),
    flush: (filename: string): void => {
      const path = join(OUT_DIR, filename);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, lines.join("\n") + "\n");
      process.stderr.write(`Written: ${path}\n`);
    },
  };
};

/** Row を人間可読な要約に変換 */
const rowSummary = (row: Row, rowIdx: number): string => {
  const c = cellStr(row, COL.C);
  const e = cellStr(row, COL.E);
  const l = cellIsNumber(row, COL.L) ? cellNum(row, COL.L) : "";
  const al = cellStr(row, COL.AL);
  const an = cellStr(row, COL.AN);
  const aq = cellIsNumber(row, COL.AQ) ? cellNum(row, COL.AQ) : "";
  const at = cellRaw(row, COL.AT);
  const bl = cellIsNumber(row, COL.BL) ? cellNum(row, COL.BL) : "";
  const bn = cellIsNumber(row, COL.BN) ? cellNum(row, COL.BN) : "";
  const br = cellIsNumber(row, COL.BR) ? cellNum(row, COL.BR) : "";
  const isHeader = isHeaderRow(row);
  const tag = isHeader ? " [HEADER]" : "";
  return `  row${String(rowIdx).padStart(5)}${tag} | C=${c} | E=${e} | L=${String(l)} | AL=${al} | AN=${an} | AQ=${String(aq)} | AT=${String(at ?? "")} | BL=${String(bl)} | BN=${String(bn)} | BR=${String(br)}`;
};

/** Row を全セル生データとしてダンプ（列番号付き） */
const rowRawDump = (row: Row, rowIdx: number): string => {
  const cells = row
    .map((v, colIdx) => (v !== undefined && v !== null && String(v).trim() !== "")
      ? `${colIdx}=${JSON.stringify(v)}`
      : undefined)
    .filter((x): x is string => x !== undefined)
    .join(" | ");
  return `  row${String(rowIdx).padStart(5)} | ${cells}`;
};

/** Dump全シート: 各過程の中間データを個別ファイルに出力 */
const dumpAll = (sheets: ReadonlyArray<ReturnType<typeof readBudgetExcel>[number]>): void => {
  // Step 0: Excel読み込み直後の全セル生データ
  sheets.map((s) => {
    const { kan_code, kan_name } = parseSheetName(s.sheetName);
    const prefix = `${String(kan_code).padStart(2, "0")}_${kan_name}`;
    const rawExcelWriter = createWriter();
    rawExcelWriter.log(`=== Sheet "${s.sheetName}" — ${s.rows.length} rows (raw Excel data) ===`);
    s.rows.map((row, i) => rawExcelWriter.log(rowRawDump(row, i)));
    return rawExcelWriter.flush(`${prefix}/00_raw_excel.txt`);
  });

  // サマリーファイル
  const summary = createWriter();
  summary.log("=== Sheets ===");
  sheets.map((s) => {
    const { kan_code, kan_name } = parseSheetName(s.sheetName);
    const clean = stripHeaders(s.rows);
    const kouChunks = splitByKou(clean);
    return summary.log(`  ${kan_code} ${kan_name}: ${s.rows.length} raw → ${clean.length} clean rows, ${kouChunks.length} 項`);
  });
  summary.flush("00_sheets.txt");

  // 各シートを処理
  sheets.map((s) => {
    const { kan_code, kan_name } = parseSheetName(s.sheetName);
    const prefix = `${String(kan_code).padStart(2, "0")}_${kan_name}`;
    const cleanSheetRows = stripHeaders(s.rows);
    const kouChunks = splitByKou(cleanSheetRows);

    // stripHeaders 前後比較
    const stripWriter = createWriter();
    stripWriter.log(`=== Sheet "${s.sheetName}" — ${s.rows.length} raw → ${cleanSheetRows.length} clean (${s.rows.length - cleanSheetRows.length} rows stripped) ===`);
    stripWriter.flush(`${prefix}/00_strip_summary.txt`);

    // 項一覧
    const kouWriter = createWriter();
    kouWriter.log(`=== ${kan_code} ${kan_name} — ${kouChunks.length} 項チャンク ===`);
    kouChunks.map((k) => {
      const { chunks } = splitByMoku(k.rows);
      return kouWriter.log(`  項${k.code} ${k.name}: ${k.rows.length} rows → ${chunks.length} 目`);
    });
    kouWriter.flush(`${prefix}/00_kou_summary.txt`);

    // 各項を処理
    kouChunks.map((k) => {
      const kouPrefix = `${prefix}/項${k.code}_${k.name}`;

      // clean rows (stripHeaders already applied at sheet level)
      const clean = k.rows;
      const cleanWriter = createWriter();
      cleanWriter.log(`=== Clean rows (${clean.length}) ===`);
      clean.map((row, i) => cleanWriter.log(rowSummary(row, i)));
      cleanWriter.flush(`${kouPrefix}/03_clean_rows.txt`);

      // 目チャンク
      const { chunks: mokuChunks, keiRow } = splitByMoku(clean);
      const mokuSummary = createWriter();
      mokuSummary.log(`=== 目チャンク (${mokuChunks.length}) ===`);
      mokuChunks.map((m) => {
        const setsuList = extractSetsu(m.rows);
        const setsumeiTree = extractSetsumei(m.rows);
        const setsuSum = setsuList.reduce((acc, s_) => acc + (s_.amount ?? 0), 0);
        const setsumeiSum = setsumeiTree.reduce((acc, d) => acc + (d.amount ?? 0), 0);
        return mokuSummary.log(`  目${m.code} ${m.name}: honendo=${m.budget.honendo} | ${m.rows.length} rows | ${setsuList.length} 節(sum=${setsuSum}) | ${setsumeiTree.length} 大事業(sum=${setsumeiSum})`);
      });
      keiRow !== null && mokuSummary.log(`  計 row: L=${cellIsNumber(keiRow, COL.L) ? cellNum(keiRow, COL.L) : "N/A"}`);
      mokuSummary.flush(`${kouPrefix}/04_moku_summary.txt`);

      // 各目の詳細
      mokuChunks.map((m) => {
        const mokuPrefix = `${kouPrefix}/目${m.code}_${m.name}`;

        // raw rows
        const mokuRaw = createWriter();
        mokuRaw.log(`=== 目${m.code} ${m.name} — ${m.rows.length} rows ===`);
        mokuRaw.logJson("Budget", m.budget);
        mokuRaw.log("\n=== Raw rows ===");
        m.rows.map((row, i) => mokuRaw.log(rowSummary(row, i)));
        mokuRaw.flush(`${mokuPrefix}/01_rows.txt`);

        // 節
        const setsuList = extractSetsu(m.rows);
        const setsuWriter = createWriter();
        setsuWriter.logJson("節 (extractSetsu)", setsuList);
        setsuWriter.flush(`${mokuPrefix}/02_setsu.json`);

        // 説明ツリー
        const setsumeiTree = extractSetsumei(m.rows);
        const setsumeiWriter = createWriter();
        setsumeiWriter.logJson("説明ツリー (extractSetsumei)", setsumeiTree);
        return setsumeiWriter.flush(`${mokuPrefix}/03_setsumei_tree.json`);
      });
      return undefined;
    });
    return undefined;
  });
};

const main = (): void => {
  const [,, inputPath] = process.argv;
  const buffer = readFileSync(inputPath ?? "/dev/stdin");
  const sheets = readBudgetExcel(buffer as Buffer);
  dumpAll(sheets);
  process.stderr.write(`\nDone. Output in: ${OUT_DIR}\n`);
};

main();
