#!/usr/bin/env python3
"""
予算書PDFを「款」セクションごとに分割するスクリプト

OCRファイル（_ocr拡張子）を使用してページと款の対応を解析し、
ghostscriptでPDFを分割・修復します。

使用方法:
    python split_budget_by_section.py <input_pdf> [output_dir]

例:
    python split_budget_by_section.py 8年度予算/bugget.pdf 8年度予算/分割

必要条件:
    - ghostscript (gs) コマンドがインストールされていること
    - brew install ghostscript
"""

import re
import shutil
import subprocess
import sys
from pathlib import Path


def parse_ocr_file(ocr_path: Path) -> dict[int, list[str]]:
    """
    OCRファイルを解析してページごとのテキストを取得する

    Returns:
        dict: {ページ番号(1-indexed): [そのページの行リスト]}
    """
    with open(ocr_path, "r", encoding="utf-8") as f:
        content = f.read()

    pages = {}
    current_page = 0
    current_lines = []

    for line in content.split("\n"):
        # 行番号を除去してテキストを取得
        match = re.match(r'\s*\d+→(.*)$', line)
        if match:
            text = match.group(1)
        else:
            text = line

        # ページ区切りを検出 「- N -」形式
        page_match = re.search(r'^-\s*(\d+)\s*-$', text.strip())
        if page_match:
            # 前のページのデータを保存
            if current_page > 0:
                pages[current_page] = current_lines
            current_page = int(page_match.group(1))
            current_lines = []
        else:
            current_lines.append(text)

    # 最後のページを保存
    if current_page > 0:
        pages[current_page] = current_lines

    return pages


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


def split_pdf_by_section(input_path: str, output_dir: str = None) -> dict:
    """
    PDFを款セクションごとに分割する（ghostscript使用）

    Args:
        input_path: 入力PDFファイルのパス
        output_dir: 出力ディレクトリ（指定なしの場合は入力ファイルと同じディレクトリに作成）

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
    print(f"検出されたセクション数: {len(section_ranges)}")

    if not section_ranges:
        print("エラー: 款セクションが検出できませんでした。")
        sys.exit(1)

    # PDFを分割して保存（ghostscript使用）
    print("\nPDFを分割中（ghostscriptで修復しながら分割）...")
    results = {}
    success_count = 0
    fail_count = 0

    for section_key, (start, end) in sorted(section_ranges.items()):
        # ファイル名を生成（ファイルシステムに安全な名前に変換）
        safe_name = section_key.replace("/", "・").replace("\\", "・")
        output_path = output_dir / f"{safe_name}.pdf"

        # ghostscriptでPDFを分割
        actual_end = min(end, total_pages)
        success = split_pdf_with_gs(input_path, output_path, start, actual_end)

        page_count = actual_end - start + 1
        if success:
            print(f"  {safe_name}: ページ {start}-{actual_end} ({page_count}ページ) -> {output_path.name}")
            results[section_key] = (start, actual_end, str(output_path))
            success_count += 1
        else:
            print(f"  {safe_name}: 失敗")
            fail_count += 1

    print(f"\n完了: {success_count} ファイルを {output_dir} に保存しました")
    if fail_count > 0:
        print(f"警告: {fail_count} ファイルの作成に失敗しました")

    return results


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None

    if not Path(input_path).exists():
        print(f"エラー: ファイルが見つかりません: {input_path}")
        sys.exit(1)

    split_pdf_by_section(input_path, output_dir)


if __name__ == "__main__":
    main()
