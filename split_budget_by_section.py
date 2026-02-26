#!/usr/bin/env python3
"""
予算書PDFを「款」セクションごとに分割するスクリプト

PDFから直接テキストを抽出して款の位置を検出し、
ghostscriptでPDFを分割・修復します。
各セクションのPDFとテキストファイルを同時に出力します。

使用方法:
    python split_budget_by_section.py <input_pdf> [output_dir] [--workers N]

例:
    python split_budget_by_section.py 8年度予算/repaired.pdf 8年度予算/分割
    python split_budget_by_section.py 8年度予算/repaired.pdf 8年度予算/分割 --workers 8

必要条件:
    - ghostscript (gs) コマンドがインストールされていること
    - brew install ghostscript
"""

import argparse
import re
import shutil
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path


def detect_kan_from_pdf(pdf_path: Path, total_pages: int) -> list[tuple[int, str, int, str]]:
    """
    PDFから直接款の位置を検出する

    Returns:
        list of (page_num, section_type, kan_num, kan_name)
    """
    print("PDFから款の位置を検出中...")

    kan_pages = {}  # {(section_type, kan_num): (page, name)}
    current_section = "歳入"
    prev_kan = 0

    for page in range(1, total_pages + 1):
        result = subprocess.run([
            "gs", "-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=txtwrite",
            f"-dFirstPage={page}", f"-dLastPage={page}",
            "-sOutputFile=-",
            str(pdf_path)
        ], capture_output=True, text=True, timeout=10)

        text = result.stdout if result.stdout else ""

        # 款を検出
        matches = re.findall(r'([１-９][０-９]?|[0-9]{1,2})款\s*(\S+)', text)
        for num_str, name in matches:
            num = int(num_str.translate(str.maketrans('０１２３４５６７８９', '0123456789')))
            name = re.sub(r'[　\s].*', '', name)  # 最初の単語だけ

            # 歳出判定（款番号が大きい数から1に戻ったら）
            if prev_kan >= 20 and num == 1:
                current_section = "歳出"

            key = (current_section, num)
            if key not in kan_pages:
                kan_pages[key] = (page, name)

            prev_kan = num

        if page % 50 == 0:
            print(f"  {page}/{total_pages} ページ処理済み")

    # 遷移リストに変換
    transitions = []
    for (section_type, kan_num), (page, name) in sorted(kan_pages.items(), key=lambda x: (x[0][0], x[0][1])):
        transitions.append((page, section_type, kan_num, name))

    # ページ順にソート
    transitions.sort(key=lambda x: x[0])

    print(f"  {len(transitions)} 款を検出")
    return transitions


def build_section_ranges(transitions: list[tuple[int, str, int, str]], max_page: int) -> dict[str, tuple[int, int]]:
    """
    款の遷移情報からページ範囲を構築する

    Returns:
        dict: {セクションキー: (開始ページ, 終了ページ)}
    """
    section_ranges = {}

    for i, (start_page, section_type, kan_num, kan_name) in enumerate(transitions):
        # 終了ページは次の款の開始ページ-1、または最後のページ
        if i + 1 < len(transitions):
            end_page = transitions[i + 1][0] - 1
        else:
            end_page = max_page

        key = f"{section_type}_{kan_num:02d}款_{kan_name}"
        section_ranges[key] = (start_page, end_page)

    return section_ranges


def get_pdf_page_count(pdf_path: Path) -> int:
    """PDFのページ数を取得する"""
    # 方法1: ghostscriptで取得
    try:
        result = subprocess.run(
            ["gs", "-q", "-dNODISPLAY", "-dNOSAFER",
             "-c", f"({pdf_path}) (r) file runpdfbegin pdfpagecount = quit"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            for line in result.stdout.strip().split('\n'):
                if line.strip().isdigit():
                    return int(line.strip())
    except Exception:
        pass

    # 方法2: gsでページを処理してカウント
    try:
        result = subprocess.run(
            ["gs", "-q", "-dNODISPLAY", "-dBATCH", "-dNOPAUSE",
             "-sDEVICE=nullpage", str(pdf_path)],
            capture_output=True, text=True, timeout=60
        )
        # "Page N"の出力をカウント
        page_count = result.stderr.count("Page ")
        if page_count > 0:
            return page_count
    except Exception:
        pass

    # 方法3: pypdfで取得（フォールバック）
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(pdf_path))
        return len(reader.pages)
    except Exception:
        pass

    # 最後の手段: OCRファイルから推定
    return 318  # デフォルト値


def split_pdf_with_gs(input_path: Path, output_path: Path, first_page: int, last_page: int) -> bool:
    """ghostscriptでPDFを分割（修復も同時に行う）"""
    result = subprocess.run([
        "gs",
        "-sDEVICE=pdfwrite",
        "-dNOPAUSE",
        "-dBATCH",
        "-dSAFER",
        "-dQUIET",
        f"-dFirstPage={first_page}",
        f"-dLastPage={last_page}",
        f"-sOutputFile={output_path}",
        str(input_path)
    ], capture_output=True, text=True)

    return output_path.exists()


def extract_text_from_pdf(pdf_path: Path) -> str:
    """PDFからテキストを抽出する"""
    result = subprocess.run([
        "gs", "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER",
        "-sDEVICE=txtwrite",
        "-sOutputFile=-",
        str(pdf_path)
    ], capture_output=True, text=True, timeout=300)

    return result.stdout if result.returncode == 0 else ""


def process_section(args: tuple) -> tuple[str, bool, str]:
    """
    1つのセクションを処理（PDF分割 + テキスト抽出）
    並行処理用の関数

    Args:
        args: (input_path, output_dir, section_key, start, end)

    Returns:
        (section_key, success, message)
    """
    input_path, output_dir, section_key, start, end = args

    input_path = Path(input_path)
    output_dir = Path(output_dir)

    safe_name = section_key.replace("/", "・").replace("\\", "・")
    pdf_path = output_dir / f"{safe_name}.pdf"
    txt_path = output_dir / f"{safe_name}.txt"

    # PDF分割
    pdf_success = split_pdf_with_gs(input_path, pdf_path, start, end)

    if not pdf_success:
        return (section_key, False, "PDF分割失敗")

    # テキスト抽出
    text = extract_text_from_pdf(pdf_path)

    if text:
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write(text)
        return (section_key, True, f"ページ {start}-{end}")
    else:
        return (section_key, True, f"ページ {start}-{end} (テキスト抽出失敗)")


def split_pdf_by_section(input_path: str, output_dir: str = None, workers: int = 4) -> dict:
    """
    PDFを款セクションごとに分割する（ghostscript使用、並行処理）

    Args:
        input_path: 入力PDFファイルのパス
        output_dir: 出力ディレクトリ（指定なしの場合は入力ファイルと同じディレクトリに作成）
        workers: 並行処理のワーカー数

    Returns:
        分割結果の辞書 {セクション名: (開始ページ, 終了ページ, 出力パス)}
    """
    # ghostscriptの存在確認
    if not shutil.which("gs"):
        print("エラー: ghostscript (gs) がインストールされていません。")
        print("インストール: brew install ghostscript")
        sys.exit(1)

    input_path = Path(input_path)

    if output_dir is None:
        output_dir = input_path.parent / "分割"
    else:
        output_dir = Path(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)

    # PDFのページ数を取得
    print(f"PDF解析中: {input_path}")
    total_pages = get_pdf_page_count(input_path)
    print(f"総ページ数（PDF）: {total_pages}")

    # PDFから直接款の位置を検出
    transitions = detect_kan_from_pdf(input_path, total_pages)

    if not transitions:
        print("エラー: 款が検出できませんでした。")
        sys.exit(1)

    # 款ごとのページ範囲を構築
    section_ranges = build_section_ranges(transitions, total_pages)

    # 最初の款が始まる前のページを「00_概要」として追加
    if transitions:
        first_kan_page = transitions[0][0]
        if first_kan_page > 1:
            section_ranges["00_概要"] = (1, first_kan_page - 1)

    print(f"検出されたセクション数: {len(section_ranges)}")

    if not section_ranges:
        print("エラー: 款セクションが検出できませんでした。")
        sys.exit(1)

    # 並行処理用のタスクを作成
    tasks = []
    for section_key, (start, end) in section_ranges.items():
        actual_end = min(end, total_pages)
        tasks.append((str(input_path), str(output_dir), section_key, start, actual_end))

    # PDF分割 + テキスト抽出を並行処理
    print(f"\nPDF分割 + テキスト抽出中（{workers}ワーカー）...")
    results = {}
    success_count = 0
    fail_count = 0

    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(process_section, task): task[2] for task in tasks}

        for future in as_completed(futures):
            section_key = futures[future]
            try:
                key, success, message = future.result()
                safe_name = key.replace("/", "・").replace("\\", "・")

                if success:
                    print(f"  ✓ {safe_name}: {message}")
                    start, end = section_ranges[key]
                    results[key] = (start, min(end, total_pages), str(output_dir / f"{safe_name}.pdf"))
                    success_count += 1
                else:
                    print(f"  ✗ {safe_name}: {message}")
                    fail_count += 1
            except Exception as e:
                print(f"  ✗ {section_key}: {e}")
                fail_count += 1

    print(f"\n完了: {success_count} セクション（PDF + テキスト）を {output_dir} に保存しました")
    if fail_count > 0:
        print(f"警告: {fail_count} セクションの処理に失敗しました")

    return results


def main():
    parser = argparse.ArgumentParser(
        description="予算書PDFを款セクションごとに分割（PDF + テキスト出力）"
    )
    parser.add_argument("input_pdf", help="入力PDFファイルのパス")
    parser.add_argument("output_dir", nargs="?", default=None, help="出力ディレクトリ（省略時は入力ファイルと同じ場所に「分割」フォルダを作成）")
    parser.add_argument("--workers", "-w", type=int, default=4, help="並行処理のワーカー数（デフォルト: 4）")

    args = parser.parse_args()

    if not Path(args.input_pdf).exists():
        print(f"エラー: ファイルが見つかりません: {args.input_pdf}")
        sys.exit(1)

    split_pdf_by_section(args.input_pdf, args.output_dir, args.workers)


if __name__ == "__main__":
    main()
