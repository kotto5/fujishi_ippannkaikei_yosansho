#!/usr/bin/env python3
"""
PDFからテキストを抽出するスクリプト（並行処理対応）

使用方法:
    # 単一ファイル
    python pdf_to_text.py input.pdf

    # ディレクトリ内の全PDF
    python pdf_to_text.py 8年度予算/分割/

    # ワーカー数指定
    python pdf_to_text.py 8年度予算/分割/ --workers 8
"""

import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path


def pdf_to_text(pdf_path: Path) -> tuple[Path, str, bool]:
    """
    PDFからテキストを抽出する

    Args:
        pdf_path: PDFファイルのパス

    Returns:
        (pdf_path, text or error_message, success)
    """
    try:
        result = subprocess.run([
            "gs", "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER",
            "-sDEVICE=txtwrite",
            "-sOutputFile=-",
            str(pdf_path)
        ], capture_output=True, text=True, timeout=300)

        if result.returncode == 0:
            return (pdf_path, result.stdout, True)
        else:
            return (pdf_path, f"Error: {result.stderr}", False)
    except subprocess.TimeoutExpired:
        return (pdf_path, "Error: Timeout", False)
    except Exception as e:
        return (pdf_path, f"Error: {str(e)}", False)


def process_single_pdf(pdf_path: Path) -> tuple[Path, bool]:
    """
    単一のPDFを処理してテキストファイルを作成

    Returns:
        (output_path, success)
    """
    pdf_path = Path(pdf_path)
    txt_path = pdf_path.with_suffix('.txt')

    _, text, success = pdf_to_text(pdf_path)

    if success:
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write(text)
        return (txt_path, True)
    else:
        return (txt_path, False)


def process_directory(dir_path: Path, workers: int = 4) -> dict:
    """
    ディレクトリ内の全PDFを並行処理

    Args:
        dir_path: ディレクトリパス
        workers: 並行ワーカー数

    Returns:
        結果の辞書
    """
    pdf_files = list(dir_path.glob("*.pdf"))

    if not pdf_files:
        print(f"PDFファイルが見つかりません: {dir_path}")
        return {}

    print(f"処理対象: {len(pdf_files)} ファイル")
    print(f"並行ワーカー数: {workers}")

    results = {"success": [], "failed": []}

    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(process_single_pdf, pdf): pdf for pdf in pdf_files}

        for future in as_completed(futures):
            pdf_path = futures[future]
            try:
                txt_path, success = future.result()
                if success:
                    results["success"].append(txt_path)
                    print(f"  ✓ {txt_path.name}")
                else:
                    results["failed"].append(pdf_path)
                    print(f"  ✗ {pdf_path.name}")
            except Exception as e:
                results["failed"].append(pdf_path)
                print(f"  ✗ {pdf_path.name}: {e}")

    return results


def main():
    import argparse

    parser = argparse.ArgumentParser(description="PDFからテキストを抽出")
    parser.add_argument("path", help="PDFファイルまたはディレクトリのパス")
    parser.add_argument("--workers", "-w", type=int, default=4, help="並行ワーカー数（デフォルト: 4）")

    args = parser.parse_args()
    path = Path(args.path)

    if not path.exists():
        print(f"エラー: パスが存在しません: {path}")
        sys.exit(1)

    if path.is_file():
        # 単一ファイル処理
        print(f"処理中: {path}")
        txt_path, success = process_single_pdf(path)
        if success:
            print(f"完了: {txt_path}")
        else:
            print(f"失敗: {path}")
            sys.exit(1)
    else:
        # ディレクトリ処理
        results = process_directory(path, workers=args.workers)
        print(f"\n完了: {len(results['success'])} 成功, {len(results['failed'])} 失敗")


if __name__ == "__main__":
    main()
