#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
富士市予算書 JSON バリデーション
期待するJSON構造をテストとして定義

構造:
{
  "款名": {
    "本年度予算額": int,
    "前年度予算額": int | null,
    "比較": int | null,
    "項": [
      {
        "項名": {
          "本年度予算額": int,
          "前年度予算額": int,
          "比較": int,
          "目": [
            {
              "目名": {
                "本年度予算額": int,
                "前年度予算額": int,
                "比較": int,
                "節": [...]  # optional
              }
            }
          ]
        }
      }
    ]
  }
}

ルール:
1. 各レベル（款/項/目/節）は {名称: データ} 形式
2. 名称キーは文字列、データは辞書
3. 項/目/節 は配列で、各要素は単一キーの辞書
4. 金額は整数（千円単位 or 円単位）
"""

import json
import sys
from typing import Tuple, List


def validate_named_item(item: dict, level: str, path: str) -> Tuple[bool, List[str]]:
    """
    {名称: データ} 形式の項目をバリデート
    Returns: (is_valid, error_messages)
    """
    errors = []

    if not isinstance(item, dict):
        return False, [f"{path}: 辞書ではない ({type(item).__name__})"]

    if len(item) != 1:
        return False, [f"{path}: 単一キーではない (keys: {list(item.keys())})"]

    name = list(item.keys())[0]
    data = item[name]

    if not isinstance(name, str):
        errors.append(f"{path}: 名称が文字列ではない ({type(name).__name__})")

    if not isinstance(data, dict):
        errors.append(f"{path}/{name}: データが辞書ではない ({type(data).__name__})")
        return False, errors

    return True, errors


def validate_amount(value, field: str, path: str, required: bool = True) -> List[str]:
    """金額フィールドをバリデート"""
    errors = []
    if field not in value:
        if required:
            errors.append(f"{path}: '{field}' がない")
    elif value[field] is not None and not isinstance(value[field], int):
        errors.append(f"{path}: '{field}' が整数ではない ({type(value[field]).__name__})")
    return errors


def validate_setsu(setsu: dict, path: str) -> List[str]:
    """節をバリデート"""
    errors = []

    valid, item_errors = validate_named_item(setsu, "節", path)
    errors.extend(item_errors)
    if not valid:
        return errors

    name = list(setsu.keys())[0]
    data = setsu[name]

    # 金額は必須
    errors.extend(validate_amount(data, "金額", f"{path}/{name}"))

    return errors


def validate_moku(moku: dict, path: str) -> List[str]:
    """目をバリデート"""
    errors = []

    valid, item_errors = validate_named_item(moku, "目", path)
    errors.extend(item_errors)
    if not valid:
        return errors

    name = list(moku.keys())[0]
    data = moku[name]

    # 金額フィールド（オプション - 元データにない場合がある）
    errors.extend(validate_amount(data, "本年度予算額", f"{path}/{name}", required=False))
    errors.extend(validate_amount(data, "前年度予算額", f"{path}/{name}", required=False))
    errors.extend(validate_amount(data, "比較", f"{path}/{name}", required=False))

    # 節があれば検証
    if "節" in data:
        if not isinstance(data["節"], list):
            errors.append(f"{path}/{name}: '節' が配列ではない")
        else:
            for i, setsu in enumerate(data["節"]):
                errors.extend(validate_setsu(setsu, f"{path}/{name}/節[{i}]"))

    return errors


def validate_kou(kou: dict, path: str) -> List[str]:
    """項をバリデート"""
    errors = []

    valid, item_errors = validate_named_item(kou, "項", path)
    errors.extend(item_errors)
    if not valid:
        return errors

    name = list(kou.keys())[0]
    data = kou[name]

    # 金額フィールド（オプション - 元データにない場合がある）
    errors.extend(validate_amount(data, "本年度予算額", f"{path}/{name}", required=False))
    errors.extend(validate_amount(data, "前年度予算額", f"{path}/{name}", required=False))
    errors.extend(validate_amount(data, "比較", f"{path}/{name}", required=False))

    # 目があれば検証
    if "目" in data:
        if not isinstance(data["目"], list):
            errors.append(f"{path}/{name}: '目' が配列ではない")
        else:
            for i, moku in enumerate(data["目"]):
                errors.extend(validate_moku(moku, f"{path}/{name}/目[{i}]"))

    return errors


def validate_kan(data: dict, filename: str) -> List[str]:
    """款JSONをバリデート"""
    errors = []

    if not isinstance(data, dict):
        return [f"{filename}: ルートが辞書ではない"]

    if len(data) != 1:
        return [f"{filename}: ルートが単一キーではない (keys: {list(data.keys())})"]

    kan_name = list(data.keys())[0]
    kan_data = data[kan_name]

    if not isinstance(kan_data, dict):
        return [f"{filename}: 款データが辞書ではない"]

    # 金額フィールド（款レベルはオプション - 元データにない場合がある）
    errors.extend(validate_amount(kan_data, "本年度予算額", f"{filename}/{kan_name}", required=False))
    errors.extend(validate_amount(kan_data, "前年度予算額", f"{filename}/{kan_name}", required=False))
    errors.extend(validate_amount(kan_data, "比較", f"{filename}/{kan_name}", required=False))

    # 項は必須
    if "項" not in kan_data:
        errors.append(f"{filename}/{kan_name}: '項' がない")
    elif not isinstance(kan_data["項"], list):
        errors.append(f"{filename}/{kan_name}: '項' が配列ではない")
    else:
        for i, kou in enumerate(kan_data["項"]):
            errors.extend(validate_kou(kou, f"{filename}/{kan_name}/項[{i}]"))

    return errors


def validate_file(filepath: str) -> Tuple[bool, List[str]]:
    """JSONファイルをバリデート"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        return False, [f"ファイル読み込みエラー: {e}"]

    errors = validate_kan(data, filepath)
    return len(errors) == 0, errors


def main():
    if len(sys.argv) < 2:
        print("使い方: python3 validate_json.py <json_file> [json_file2 ...]")
        sys.exit(1)

    total_errors = 0
    for filepath in sys.argv[1:]:
        is_valid, errors = validate_file(filepath)
        if is_valid:
            print(f"✓ {filepath}")
        else:
            print(f"✗ {filepath}")
            for err in errors[:10]:  # 最初の10件のみ表示
                print(f"  - {err}")
            if len(errors) > 10:
                print(f"  ... 他 {len(errors) - 10} 件のエラー")
            total_errors += len(errors)

    sys.exit(0 if total_errors == 0 else 1)


if __name__ == "__main__":
    main()
