#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
予算書PDF座標ベース抽出スクリプト v3
見開きページをY座標でマッチングしてJSON構造を構築
"""

import pdfplumber
import json
import re
from collections import defaultdict
from typing import List, Dict, Tuple, Optional


# ページ範囲定義
SAINYUU_PAGES = (28, 175)  # 0-indexed: 27-174
SAISHUTSU_PAGES = (176, 596)  # 0-indexed: 175-595（予備費まで含む）


def extract_spread_rows(pdf, left_page_num: int, right_page_num: int, y_tolerance: int = 12) -> List[Dict]:
    """見開き2ページをY座標でマッチングして行データを抽出"""
    if left_page_num >= len(pdf.pages) or right_page_num >= len(pdf.pages):
        return []

    left_page = pdf.pages[left_page_num]
    right_page = pdf.pages[right_page_num]

    left_words = left_page.extract_words()
    right_words = right_page.extract_words()

    page_width = left_page.width

    for w in left_words:
        w['source'] = 'left'
    for w in right_words:
        w['source'] = 'right'
        w['x0'] += page_width
        w['x1'] += page_width

    all_words = left_words + right_words

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
        })

    return rows


def parse_amount(text: str) -> Optional[int]:
    """金額文字列をパース（千円単位→円）"""
    if not text:
        return None
    text = text.replace(',', '').replace('△', '-').replace('千円', '').strip()
    try:
        return int(text) * 1000  # 千円単位を円に変換
    except:
        return None


def parse_amount_raw(text: str) -> Optional[int]:
    """金額文字列をパース（単位変換なし）"""
    if not text:
        return None
    text = text.replace(',', '').replace('△', '-').strip()
    try:
        return int(text)
    except:
        return None


def parse_right_setsu(right_text: str) -> List[Dict]:
    """右側テキストから節・説明を抽出"""
    if not right_text.strip():
        return []

    results = []
    parts = right_text.split()

    i = 0
    while i < len(parts):
        if parts[i].isdigit():
            setsu_num = int(parts[i])
            j = i + 1
            name_parts = []
            amount = None

            while j < len(parts):
                amount_match = re.match(r'^[\d,]+$', parts[j])
                if amount_match:
                    val = int(parts[j].replace(',', ''))
                    if val >= 100:  # 金額と判断
                        amount = val * 1000  # 千円→円
                        break
                name_parts.append(parts[j])
                j += 1

            if name_parts and amount is not None:
                name = ''.join(name_parts)  # スペースなしで結合
                explanation = ' '.join(parts[j+1:]) if j + 1 < len(parts) else ''
                results.append({
                    '節名': name,
                    '金額': amount,
                    '説明_raw': explanation,
                })
                # 次の節を探す
                i = j + 1
                continue
        i += 1

    return results


def identify_row_type(left_text: str) -> Tuple[str, Optional[str], Optional[Dict]]:
    """左側テキストから行タイプを識別"""
    left_text = left_text.strip()

    if not left_text:
        return ('empty', None, None)

    if '本年度予算額' in left_text or '前年度予算額' in left_text:
        return ('header', None, None)
    if left_text in ['千円', '千円 千円 千円']:
        return ('header', None, None)
    if re.match(r'^-\s*\d+\s*-$', left_text):
        return ('page_number', None, None)

    # 款ヘッダー
    kan_match = re.match(r'[（(]?(\d+|[０-９]+)款\s+(.+?)\s+([\d,]+)千円', left_text)
    if kan_match:
        return ('kan_header', kan_match.group(2), {
            '番号': kan_match.group(1),
            '本年度予算額': parse_amount(kan_match.group(3)),
        })

    # 項ヘッダー
    kou_match = re.match(r'(\d+|[０-９]+)項\s+(.+?)\s+([\d,]+)千円', left_text)
    if kou_match:
        return ('kou_header', kou_match.group(2), {
            '番号': kou_match.group(1),
            '本年度予算額': parse_amount(kou_match.group(3)),
        })

    # 計の行
    total_match = re.match(r'計\s+([\d,△\-]+)\s+([\d,△\-]+)\s+([\d,△\-]+)', left_text)
    if total_match:
        return ('total', None, {
            '本年度予算額': parse_amount(total_match.group(1)),
            '前年度予算額': parse_amount(total_match.group(2)),
            '比較': parse_amount(total_match.group(3)),
        })

    # 目の行
    moku_match = re.match(r'(\d+)\s+(.+?)\s+([\d,△\-]+)\s+([\d,△\-]+)\s+([\d,△\-]+)', left_text)
    if moku_match:
        return ('moku', moku_match.group(2), {
            '番号': moku_match.group(1),
            '本年度予算額': parse_amount(moku_match.group(3)),
            '前年度予算額': parse_amount(moku_match.group(4)),
            '比較': parse_amount(moku_match.group(5)),
        })

    return ('unknown', left_text, None)


def process_spread_pages(pdf, left_idx: int, right_idx: int) -> List[Dict]:
    """見開きページを処理してデータ行を返す"""
    rows = extract_spread_rows(pdf, left_idx, right_idx)
    result = []

    for row in rows:
        row_type, name, data = identify_row_type(row['left'])

        if row_type in ['empty', 'header', 'page_number', 'unknown']:
            continue

        entry = {
            'type': row_type,
            'name': name,
            'data': data or {},
        }

        # 右側から節を抽出
        if row_type == 'moku':
            setsu_list = parse_right_setsu(row['right'])
            if setsu_list:
                entry['節'] = setsu_list

        result.append(entry)

    return result


def build_budget_structure(pdf, start_page: int, end_page: int) -> Dict:
    """
    指定ページ範囲から予算構造を構築

    Returns:
        {"款": [{"款名": {..., "項": [...]}}]}
    """
    result = {"款": []}

    current_kan = None
    current_kou = None
    current_moku_list = []

    # 見開きページペアで処理
    for left_idx in range(start_page - 1, end_page - 1, 2):
        right_idx = left_idx + 1
        if right_idx >= len(pdf.pages):
            break

        entries = process_spread_pages(pdf, left_idx, right_idx)

        for entry in entries:
            if entry['type'] == 'kan_header':
                # 新しい款
                kan_name = entry['name']
                if current_kan is None or list(current_kan.keys())[0] != kan_name:
                    # 前の款を保存
                    if current_kan:
                        result['款'].append(current_kan)
                    current_kan = {
                        kan_name: {
                            '本年度予算額': entry['data'].get('本年度予算額'),
                            '項': []
                        }
                    }
                    current_kou = None

            elif entry['type'] == 'kou_header':
                # 新しい項
                kou_name = entry['name']
                if current_kan:
                    kan_name = list(current_kan.keys())[0]
                    # 同じ項が既にあるかチェック
                    existing = None
                    for k in current_kan[kan_name]['項']:
                        if list(k.keys())[0] == kou_name:
                            existing = k
                            break

                    if existing is None:
                        current_kou = {
                            kou_name: {
                                '本年度予算額': entry['data'].get('本年度予算額'),
                                '目': []
                            }
                        }
                        current_kan[kan_name]['項'].append(current_kou)
                    else:
                        current_kou = existing

            elif entry['type'] == 'moku':
                # 目
                moku_name = entry['name']
                if current_kou:
                    kou_name = list(current_kou.keys())[0]

                    moku_data = {
                        '本年度予算額': entry['data'].get('本年度予算額'),
                        '前年度予算額': entry['data'].get('前年度予算額'),
                        '比較': entry['data'].get('比較'),
                    }

                    # 節を追加
                    if '節' in entry:
                        moku_data['節'] = []
                        for s in entry['節']:
                            setsu_entry = {
                                s['節名']: {
                                    '金額': s['金額'],
                                }
                            }
                            if s.get('説明_raw'):
                                setsu_entry[s['節名']]['説明'] = {'備考': s['説明_raw']}
                            moku_data['節'].append(setsu_entry)

                    moku_entry = {moku_name: moku_data}
                    current_kou[kou_name]['目'].append(moku_entry)

    # 最後の款を保存
    if current_kan:
        result['款'].append(current_kan)

    return result


def main():
    import sys

    pdf_path = sys.argv[1] if len(sys.argv) > 1 else "bugget.pdf"
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    with pdfplumber.open(pdf_path) as pdf:
        print(f"PDF: {pdf_path}", file=sys.stderr)
        print(f"総ページ数: {len(pdf.pages)}", file=sys.stderr)

        # 歳入を抽出
        print("歳入を抽出中...", file=sys.stderr)
        sainyuu = build_budget_structure(pdf, SAINYUU_PAGES[0], SAINYUU_PAGES[1])
        print(f"  歳入: {len(sainyuu['款'])}款", file=sys.stderr)

        # 歳出を抽出
        print("歳出を抽出中...", file=sys.stderr)
        saishutsu = build_budget_structure(pdf, SAISHUTSU_PAGES[0], SAISHUTSU_PAGES[1])
        print(f"  歳出: {len(saishutsu['款'])}款", file=sys.stderr)

        result = {
            "歳入": sainyuu,
            "歳出": saishutsu,
        }

        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"出力: {output_path}", file=sys.stderr)
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
