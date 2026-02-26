#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
予算書PDF座標ベース抽出スクリプト v2
見開きページをY座標でマッチングして抽出
"""

import pdfplumber
import json
import re
from collections import defaultdict
from typing import List, Dict, Tuple, Optional


def extract_spread_rows(pdf, left_page_num: int, right_page_num: int, y_tolerance: int = 5) -> List[Dict]:
    """
    見開き2ページをY座標でマッチングして行データを抽出

    Args:
        pdf: pdfplumberのPDFオブジェクト
        left_page_num: 左ページ番号 (0-indexed)
        right_page_num: 右ページ番号 (0-indexed)
        y_tolerance: Y座標のグルーピング許容値（px）

    Returns:
        行ごとのデータリスト
    """
    left_page = pdf.pages[left_page_num]
    right_page = pdf.pages[right_page_num]

    left_words = left_page.extract_words()
    right_words = right_page.extract_words()

    page_width = left_page.width

    # ソースを記録
    for w in left_words:
        w['source'] = 'left'
    for w in right_words:
        w['source'] = 'right'
        w['x0'] += page_width
        w['x1'] += page_width

    all_words = left_words + right_words

    # Y座標でグループ化
    y_groups = defaultdict(list)
    for w in all_words:
        y = round(w['top'] / y_tolerance) * y_tolerance
        y_groups[y].append(w)

    rows = []
    for y in sorted(y_groups.keys()):
        words = sorted(y_groups[y], key=lambda w: w['x0'])
        left_texts = [w['text'] for w in words if w['source'] == 'left']
        right_texts = [w['text'] for w in words if w['source'] == 'right']

        rows.append({
            'y': y,
            'left': ' '.join(left_texts),
            'right': ' '.join(right_texts),
            'left_words': left_texts,
            'right_words': right_texts,
        })

    return rows


def parse_amount(text: str) -> Optional[int]:
    """金額文字列をパース（千円単位）"""
    text = text.replace(',', '').replace('△', '-').replace('千円', '').strip()
    try:
        return int(text)
    except:
        return None


def parse_right_text(right_text: str) -> List[Dict]:
    """
    右側テキストから節・説明を抽出

    例: "1 現年課税分 830,000 現年課税分 830,000"
    → [{"節番号": 1, "節名": "現年課税分", "金額": 830000, "説明": "現年課税分 830,000"}]
    """
    if not right_text.strip():
        return []

    results = []

    # 節のパターン: "番号 名称 金額 説明..."
    # 例: "1 現年課税分 830,000 現年課税分 830,000"
    setsu_pattern = re.compile(r'(\d+)\s+([^\d\s]+(?:\s+[^\d\s]+)*)\s+([\d,]+)\s+(.*)')

    parts = right_text.split()
    i = 0
    while i < len(parts):
        # 番号から始まるパターンを探す
        if parts[i].isdigit():
            setsu_num = int(parts[i])
            # 次の数値を探して名称と金額を特定
            j = i + 1
            name_parts = []
            amount = None

            while j < len(parts):
                # 金額パターン（カンマ区切りの数字）
                amount_match = re.match(r'^[\d,]+$', parts[j])
                if amount_match and int(parts[j].replace(',', '')) >= 1000:
                    amount = int(parts[j].replace(',', ''))
                    break
                name_parts.append(parts[j])
                j += 1

            if name_parts and amount is not None:
                name = ' '.join(name_parts)
                # 残りは説明
                explanation = ' '.join(parts[j+1:]) if j + 1 < len(parts) else ''
                results.append({
                    '節番号': setsu_num,
                    '節名': name,
                    '金額': amount,
                    '説明_raw': explanation,
                })
                break
        i += 1

    return results


def identify_row_type(left_text: str) -> Tuple[str, Optional[str], Optional[Dict]]:
    """
    左側テキストから行タイプを識別

    Returns:
        (type, name, data) - type: 'kan'/'kou'/'moku'/'setsu'/'total'/'header'/'empty'
    """
    left_text = left_text.strip()

    if not left_text:
        return ('empty', None, None)

    # ヘッダー行
    if '本年度予算額' in left_text or '前年度予算額' in left_text:
        return ('header', None, None)
    if left_text in ['千円', '千円 千円 千円']:
        return ('header', None, None)

    # ページ番号
    if re.match(r'^-\s*\d+\s*-$', left_text):
        return ('page_number', None, None)

    # 款ヘッダー（例: １款 市税 46,460,600千円）
    kan_match = re.match(r'[（(]?(\d+|[０-９]+)款\s+(.+?)\s+([\d,]+)千円', left_text)
    if kan_match:
        return ('kan_header', kan_match.group(2), {
            '番号': kan_match.group(1),
            '本年度予算額': int(kan_match.group(3).replace(',', '')) * 1000
        })

    # 項ヘッダー（例: ２項 固定資産税 23,139,800千円）
    kou_match = re.match(r'(\d+|[０-９]+)項\s+(.+?)\s+([\d,]+)千円', left_text)
    if kou_match:
        return ('kou_header', kou_match.group(2), {
            '番号': kou_match.group(1),
            '本年度予算額': int(kou_match.group(3).replace(',', '')) * 1000
        })

    # 計の行（例: 計 887,800 867,400 20,400）
    total_match = re.match(r'計\s+([\d,△\-]+)\s+([\d,△\-]+)\s+([\d,△\-]+)', left_text)
    if total_match:
        return ('total', None, {
            '本年度予算額': parse_amount(total_match.group(1)),
            '前年度予算額': parse_amount(total_match.group(2)),
            '比較': parse_amount(total_match.group(3)),
        })

    # 目の行（例: 1 固定資産税 23,084,800 23,282,800 △198,000）
    moku_match = re.match(r'(\d+)\s+(.+?)\s+([\d,△\-]+)\s+([\d,△\-]+)\s+([\d,△\-]+)', left_text)
    if moku_match:
        return ('moku', moku_match.group(2), {
            '番号': moku_match.group(1),
            '本年度予算額': parse_amount(moku_match.group(3)),
            '前年度予算額': parse_amount(moku_match.group(4)),
            '比較': parse_amount(moku_match.group(5)),
        })

    return ('unknown', left_text, None)


def analyze_spread_pages(pdf, left_idx: int, right_idx: int):
    """見開きページを解析してデバッグ出力"""
    rows = extract_spread_rows(pdf, left_idx, right_idx)

    print(f"\n=== 見開きページ {left_idx+1}-{right_idx+1} ===")
    for row in rows:
        row_type, name, data = identify_row_type(row['left'])
        if row_type not in ['empty', 'header', 'page_number']:
            print(f"y={row['y']:5.0f} [{row_type:12s}] {name or ''}")
            if data:
                print(f"           データ: {data}")
            if row['right']:
                setsu_list = parse_right_text(row['right'])
                if setsu_list:
                    for s in setsu_list:
                        print(f"           節: {s}")


def find_budget_pages(pdf) -> Dict[str, List[int]]:
    """予算書の歳入・歳出ページ範囲を特定"""

    result = {'歳入': [], '歳出': []}

    for i in range(len(pdf.pages)):
        text = pdf.pages[i].extract_text() or ""

        # 歳入の詳細ページ
        if '歳入' in text and ('款' in text or '項' in text) and '節' in text:
            if i not in result['歳入']:
                result['歳入'].append(i)

        # 歳出の詳細ページ
        if '歳出' in text and ('款' in text or '項' in text) and '節' in text:
            if i not in result['歳出']:
                result['歳出'].append(i)

    return result


def main():
    import sys

    pdf_path = sys.argv[1] if len(sys.argv) > 1 else "bugget.pdf"

    with pdfplumber.open(pdf_path) as pdf:
        print(f"PDF: {pdf_path}")
        print(f"総ページ数: {len(pdf.pages)}")

        # テスト: 数ページを解析
        for left_idx in [29, 31, 33]:  # 偶数ページ（0-indexed）
            if left_idx + 1 < len(pdf.pages):
                analyze_spread_pages(pdf, left_idx, left_idx + 1)


if __name__ == "__main__":
    main()
