#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
富士市予算書 JSON統合スクリプト
各款の個別JSONファイルを統合して一つのbugget.jsonを作成する
フォーマット変換: {"款": {"名称": "...", ...}} → {"款名": {...}}
"""

import json
import glob
import os
import sys

def load_json_file(filepath):
    """JSONファイルを読み込む"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"警告: {filepath} の読み込みに失敗: {e}", file=sys.stderr)
        return None


def is_valid_item(item):
    """有効な項目かどうかをチェック（不正なデータパターンを検出）"""
    if not isinstance(item, dict):
        return False
    # 明確に不正なキーパターンをチェック
    # 例: {"名": "ゴルフ場利用税交付金"} や {"number": "１"} や {"目": 1}
    keys = list(item.keys())
    # 単一キーで値が文字列・整数で、かつ予算関連キーがない場合は不正
    if len(keys) == 1:
        key = keys[0]
        val = item[key]
        if key in ["名", "number", "目"] and isinstance(val, (str, int)):
            return False
    return True


def normalize_keys(item):
    """英語キーを日本語キーに変換"""
    key_mapping = {
        "budget": "本年度予算額",
        "prev_budget": "前年度予算額",
        "comparison": "比較",
        "mokuteki": "目",
        "name": "名称",
        "number": "番号",
        "items": "項",
        "targets": "目",
        "code": "番号",
    }
    result = {}
    for k, v in item.items():
        new_key = key_mapping.get(k, k)
        result[new_key] = v
    return result


def convert_item(item, level="項"):
    """
    {"名称": "xxx", "本年度予算額": ..., ...}
    → {"xxx": {"本年度予算額": ..., ...}}
    様々な名称キー形式に対応: 名称、項名、目名、名、名前、name
    """
    if isinstance(item, dict):
        # 不正な項目はスキップ
        if not is_valid_item(item):
            return None

        # 英語キーを正規化
        item = normalize_keys(item)

        # 名称キーを探す（様々な形式に対応）
        name = None
        for name_key in ["名称", "項名", "目名", "名", "名前"]:
            if name_key in item:
                name = item.pop(name_key)
                break

        if name:
            # 番号も除去（必要に応じて）
            item.pop("番号", None)
            item.pop("款番号", None)
            item.pop("項番号", None)
            item.pop("目番号", None)

            # 下位階層を再帰的に変換（Noneをフィルタリング）
            if "項" in item and isinstance(item["項"], list):
                normalized = [normalize_keys(i) if isinstance(i, dict) else i for i in item["項"]]
                item["項"] = [x for x in [convert_item(i, "項") for i in normalized] if x is not None]
            if "目" in item:
                if isinstance(item["目"], list):
                    normalized = [normalize_keys(i) if isinstance(i, dict) else i for i in item["目"]]
                    item["目"] = [x for x in [convert_item(i, "目") for i in normalized] if x is not None]
                elif isinstance(item["目"], int):
                    # 目が整数（番号）の場合は削除
                    del item["目"]
            if "節" in item:
                item["節"] = [x for x in [convert_setsu(s) for s in item["節"]] if x is not None]

            return {name: item}

        # 節名キーがある場合（節の形式）
        if "節名" in item:
            return convert_setsu(item)

    return item


def convert_setsu(setsu):
    """
    節の変換: {"節名": "xxx", "金額": ..., "説明": ...}
    → {"xxx": {"金額": ..., "説明": {...}}}
    様々な形式に対応
    """
    if not isinstance(setsu, dict):
        return setsu

    # 英語キーを正規化
    setsu = normalize_keys(setsu)

    # 名称キーを探す（様々な形式に対応）
    name = None
    for name_key in ["節名", "名称", "名", "名前", "説明"]:
        if name_key in setsu and isinstance(setsu[name_key], str):
            # "説明"が金額と同居している場合は節名として使用
            if name_key == "説明" and "金額" in setsu:
                name = setsu.pop(name_key)
                break
            elif name_key != "説明":
                name = setsu.pop(name_key)
                break

    # "節"キーが番号文字列の場合は番号として扱い、削除
    if "節" in setsu and isinstance(setsu["節"], str) and setsu["節"].isdigit():
        setsu.pop("節")

    setsu.pop("節名", None)
    setsu.pop("節番号", None)
    setsu.pop("番号", None)

    # 説明の変換
    setsumei = setsu.get("説明", {})
    if isinstance(setsumei, list):
        # 説明がリストの場合、辞書に変換
        new_setsumei = {}
        for item in setsumei:
            if isinstance(item, dict):
                # 様々なキー形式に対応
                item_name = item.get("事業名") or item.get("項目") or item.get("区分名") or item.get("区分", "")
                if item_name:
                    remaining = {k: v for k, v in item.items()
                                 if k not in ["事業名", "項目", "区分名", "区分"]}
                    if "金額" in remaining and len(remaining) == 1:
                        new_setsumei[item_name] = {"金額": remaining["金額"]}
                    else:
                        new_setsumei[item_name] = remaining if remaining else {}
        if new_setsumei:
            setsu["説明"] = new_setsumei
        else:
            setsu["説明"] = {}
    elif isinstance(setsumei, str) and setsumei:
        setsu["説明"] = {"備考": setsumei}
    elif not isinstance(setsumei, dict):
        setsu["説明"] = {}

    return {name: setsu} if name else setsu


def convert_kan_format(data):
    """
    款データのフォーマット変換
    {"款": {"名称": "xxx", ...}} → {"xxx": {...}}
    すでに {"款名": {...}} 形式でも、内部の項・目・節を変換する
    """
    if not data:
        return None

    # 款キーがある場合
    if "款" in data:
        kan_data = data["款"]
        if isinstance(kan_data, dict):
            # 英語キーを正規化してから確認
            kan_data = normalize_keys(kan_data)
            if "名称" in kan_data:
                return convert_item(kan_data, "款")

    # すでに款形式の場合、内部を再帰的に変換
    # {"市税": {...}} 形式を想定
    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            if isinstance(value, dict):
                # 英語キーを正規化
                value = normalize_keys(value)
                # 項リストがあれば変換（Noneをフィルタリング）
                if "項" in value and isinstance(value["項"], list):
                    # 各項目も正規化してから変換
                    normalized_items = [normalize_keys(i) if isinstance(i, dict) else i for i in value["項"]]
                    converted_kou = [convert_item(i, "項") for i in normalized_items]
                    value["項"] = [x for x in converted_kou if x is not None]
                # 目が整数（番号）の場合は削除
                if "目" in value and isinstance(value["目"], int):
                    del value["目"]
                result[key] = value
            else:
                result[key] = value
        return result

    return data


def merge_budget_json(ocr_dir, output_file):
    """歳入・歳出のJSONを統合"""

    result = {
        "歳入": {"款": []},
        "歳出": {"款": []}
    }

    # 歳入JSONの読み込み（01〜22）
    revenue_files = sorted(glob.glob(os.path.join(ocr_dir, "歳入_*.json")))
    for filepath in revenue_files:
        data = load_json_file(filepath)
        if data:
            converted = convert_kan_format(data)
            if converted:
                result["歳入"]["款"].append(converted)
                print(f"歳入読み込み完了: {os.path.basename(filepath)}", file=sys.stderr)

    # 歳出JSONの読み込み（01〜14）
    expense_files = sorted(glob.glob(os.path.join(ocr_dir, "歳出_*.json")))
    for filepath in expense_files:
        data = load_json_file(filepath)
        if data:
            converted = convert_kan_format(data)
            if converted:
                result["歳出"]["款"].append(converted)
                print(f"歳出読み込み完了: {os.path.basename(filepath)}", file=sys.stderr)

    # 統合JSONを出力
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n統合完了: {output_file}", file=sys.stderr)
    print(f"歳入: {len(result['歳入']['款'])}款", file=sys.stderr)
    print(f"歳出: {len(result['歳出']['款'])}款", file=sys.stderr)

    return result

def main():
    if len(sys.argv) < 3:
        print("使い方: python3 merge_json.py <ocr_dir> <output.json>")
        print("例: python3 merge_json.py ./ocr ./bugget.json")
        sys.exit(1)

    ocr_dir = sys.argv[1]
    output_file = sys.argv[2]

    merge_budget_json(ocr_dir, output_file)

if __name__ == "__main__":
    main()
