#!/usr/bin/env python3
"""
OCRファイルを「款」セクションごとにJSONファイルに分割するスクリプト

使用方法:
    python ocr_to_json_by_section.py <ocr_file> [output_dir]

例:
    python ocr_to_json_by_section.py 8年度予算/bugget.pdf_ocr 8年度予算/json
"""

import json
import re
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


def extract_section_from_lines(lines: list[str]) -> tuple[str | None, str | None]:
    """
    ページの行から款情報と歳入/歳出の種類を抽出する

    Returns:
        (section_type, section_name): ("歳入"/"歳出", "01款_市税"など)
    """
    text = "\n".join(lines)

    # 歳入/歳出の判定
    section_type = None
    if "歳 入" in text or "歳入" in text:
        section_type = "歳入"
    if "歳 出" in text or "歳出" in text:
        section_type = "歳出"

    # 款情報の抽出
    section_name = None
    pattern = r'([１-９０][０-９]?|[0-9]{1,2})款\s+([^\s\d０-９千円]+)'

    for line in lines:
        match = re.search(pattern, line)
        if match:
            num = match.group(1)
            # 全角数字を半角に変換
            num = num.translate(str.maketrans('０１２３４５６７８９', '0123456789'))
            name = match.group(2).strip()
            # 不要な文字を除去
            name = re.sub(r'[項金額]$', '', name)
            if name:
                section_name = f"{int(num):02d}款_{name}"
                break

    return section_type, section_name


def group_pages_by_section(pages: dict[int, list[str]]) -> dict[str, dict]:
    """
    ページを款ごとにグループ化する

    Returns:
        dict: {
            "歳入_01款_市税": {
                "type": "歳入",
                "section": "01款_市税",
                "pages": {
                    18: ["行1", "行2", ...],
                    19: ["行1", "行2", ...],
                    ...
                }
            },
            ...
        }
    """
    sections = {}
    current_type = "歳入"
    current_section = None
    current_key = None

    for page_num in sorted(pages.keys()):
        lines = pages[page_num]
        detected_type, detected_section = extract_section_from_lines(lines)

        if detected_type:
            current_type = detected_type

        if detected_section:
            current_section = detected_section

        if current_section:
            key = f"{current_type}_{current_section}"

            if key != current_key:
                current_key = key
                if key not in sections:
                    sections[key] = {
                        "type": current_type,
                        "section": current_section,
                        "pages": {}
                    }

            sections[key]["pages"][page_num] = lines

    return sections


def convert_ocr_to_json(ocr_path: str, output_dir: str = None) -> dict:
    """
    OCRファイルを款セクションごとにJSONファイルに分割する

    Args:
        ocr_path: OCRファイルのパス
        output_dir: 出力ディレクトリ

    Returns:
        作成されたファイルの情報
    """
    ocr_path = Path(ocr_path)

    if not ocr_path.exists():
        print(f"エラー: ファイルが見つかりません: {ocr_path}")
        sys.exit(1)

    if output_dir is None:
        output_dir = ocr_path.parent / "json"
    else:
        output_dir = Path(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)

    # OCRファイルを解析
    print(f"OCRファイル解析中: {ocr_path}")
    pages = parse_ocr_file(ocr_path)
    print(f"検出されたページ数: {len(pages)}")

    # ページを款ごとにグループ化
    sections = group_pages_by_section(pages)
    print(f"検出されたセクション数: {len(sections)}")

    # 各セクションをJSONファイルとして保存
    print("\nJSONファイルを作成中...")
    results = {}

    for section_key, section_data in sorted(sections.items()):
        # ファイル名を生成
        safe_name = section_key.replace("/", "・").replace("\\", "・")
        output_path = output_dir / f"{safe_name}.json"

        # ページデータを整形
        json_data = {
            "section_key": section_key,
            "type": section_data["type"],
            "section": section_data["section"],
            "page_count": len(section_data["pages"]),
            "page_range": {
                "start": min(section_data["pages"].keys()),
                "end": max(section_data["pages"].keys())
            },
            "pages": [
                {
                    "page_number": page_num,
                    "lines": lines
                }
                for page_num, lines in sorted(section_data["pages"].items())
            ]
        }

        # JSONファイルとして保存
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)

        page_count = len(section_data["pages"])
        start_page = min(section_data["pages"].keys())
        end_page = max(section_data["pages"].keys())
        print(f"  {safe_name}: ページ {start_page}-{end_page} ({page_count}ページ) -> {output_path.name}")
        results[section_key] = str(output_path)

    # サマリーファイルを作成
    summary = {
        "source_file": str(ocr_path),
        "total_pages": len(pages),
        "total_sections": len(sections),
        "sections": [
            {
                "key": key,
                "type": data["type"],
                "section": data["section"],
                "page_count": len(data["pages"]),
                "page_range": [min(data["pages"].keys()), max(data["pages"].keys())],
                "file": f"{key}.json"
            }
            for key, data in sorted(sections.items())
        ]
    }

    summary_path = output_dir / "_summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"\n完了: {len(results)} ファイルを {output_dir} に保存しました")
    print(f"サマリー: {summary_path}")

    return results


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    ocr_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None

    convert_ocr_to_json(ocr_path, output_dir)


if __name__ == "__main__":
    main()
