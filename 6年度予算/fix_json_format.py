#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JSONフォーマット修正スクリプト
フラット形式を名前キー形式に変換する

変換前: {"項名": "市民税", "本年度予算額": ...}
変換後: {"市民税": {"本年度予算額": ...}}
"""

import json
import sys
import os


def get_name(item: dict) -> str:
    """名称キーを探して値を返す"""
    name_keys = ["名称", "項名", "目名", "節名", "名", "名前", "name"]
    for key in name_keys:
        if key in item and isinstance(item[key], str):
            return item[key]
    return None


def remove_meta_keys(item: dict) -> dict:
    """番号系のメタキーを除去"""
    meta_keys = ["番号", "項番号", "目番号", "節番号", "コード", "code", "number",
                 "名称", "項名", "目名", "節名", "名", "名前", "name"]
    return {k: v for k, v in item.items() if k not in meta_keys}


def normalize_amount_keys(item: dict) -> dict:
    """金額キーを正規化"""
    key_mapping = {
        "budget": "本年度予算額",
        "prev_budget": "前年度予算額",
        "comparison": "比較",
        "金額": "金額",
        "予算額": "本年度予算額",
    }
    result = {}
    for k, v in item.items():
        new_key = key_mapping.get(k, k)
        result[new_key] = v
    return result


def convert_setsu(setsu: dict) -> dict:
    """節を変換"""
    if not isinstance(setsu, dict):
        return None

    # 正規化
    setsu = normalize_amount_keys(setsu)

    name = get_name(setsu)
    if not name:
        # 説明フィールドを名前として使う場合
        if "説明" in setsu and isinstance(setsu["説明"], str):
            name = setsu.pop("説明")
        else:
            return None

    data = remove_meta_keys(setsu)

    # 金額がなければスキップ
    if "金額" not in data:
        return None

    return {name: data}


def convert_moku(moku: dict) -> dict:
    """目を変換"""
    if not isinstance(moku, dict):
        return None

    # 正規化
    moku = normalize_amount_keys(moku)

    name = get_name(moku)
    if not name:
        return None

    data = remove_meta_keys(moku)

    # 節があれば再帰変換
    if "節" in data and isinstance(data["節"], list):
        converted = [convert_setsu(s) for s in data["節"]]
        data["節"] = [x for x in converted if x is not None]

    return {name: data}


def convert_kou(kou: dict) -> dict:
    """項を変換"""
    if not isinstance(kou, dict):
        return None

    # 正規化
    kou = normalize_amount_keys(kou)

    # items/targets を 目 に変換
    if "items" in kou:
        kou["項"] = kou.pop("items")
    if "targets" in kou:
        kou["目"] = kou.pop("targets")

    name = get_name(kou)
    if not name:
        return None

    data = remove_meta_keys(kou)

    # 目があれば再帰変換
    if "目" in data:
        if isinstance(data["目"], list):
            converted = [convert_moku(m) for m in data["目"]]
            data["目"] = [x for x in converted if x is not None]
        elif isinstance(data["目"], int):
            # 目が整数（番号）の場合は削除
            del data["目"]

    return {name: data}


def convert_kan(data: dict) -> dict:
    """款JSONを変換"""
    # ルートが {"款": {...}} 形式の場合
    if "款" in data and len(data) == 1:
        kan_data = data["款"]
        kan_data = normalize_amount_keys(kan_data)

        # items を 項 に変換
        if "items" in kan_data:
            kan_data["項"] = kan_data.pop("items")

        name = get_name(kan_data)
        if not name:
            return None

        inner = remove_meta_keys(kan_data)

        # 項を再帰変換
        if "項" in inner and isinstance(inner["項"], list):
            converted = [convert_kou(k) for k in inner["項"]]
            inner["項"] = [x for x in converted if x is not None]

        return {name: inner}

    # ルートが {"款名": {...}} 形式の場合
    if len(data) == 1:
        kan_name = list(data.keys())[0]
        kan_data = data[kan_name]

        if isinstance(kan_data, dict):
            kan_data = normalize_amount_keys(kan_data)

            # 項を再帰変換
            if "項" in kan_data and isinstance(kan_data["項"], list):
                converted = [convert_kou(k) for k in kan_data["項"]]
                kan_data["項"] = [x for x in converted if x is not None]

            return {kan_name: kan_data}

    return data


def fix_file(filepath: str) -> bool:
    """ファイルを修正"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        converted = convert_kan(data)
        if converted is None:
            print(f"✗ {filepath}: 変換失敗")
            return False

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(converted, f, ensure_ascii=False, indent=2)

        print(f"✓ {filepath}: 変換完了")
        return True

    except Exception as e:
        print(f"✗ {filepath}: エラー - {e}")
        return False


def main():
    if len(sys.argv) < 2:
        print("使い方: python3 fix_json_format.py <json_file> [json_file2 ...]")
        sys.exit(1)

    success = 0
    for filepath in sys.argv[1:]:
        if fix_file(filepath):
            success += 1

    print(f"\n結果: {success}/{len(sys.argv)-1} ファイル変換成功")
    sys.exit(0 if success == len(sys.argv)-1 else 1)


if __name__ == "__main__":
    main()
