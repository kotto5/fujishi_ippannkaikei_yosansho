#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
シンプルなJSON統合スクリプト
バリデーション済みのJSONファイルをそのまま統合
"""

import json
import glob
import os
import sys


def main():
    if len(sys.argv) < 3:
        print("使い方: python3 merge_simple.py <ocr_dir> <output.json>")
        sys.exit(1)

    ocr_dir = sys.argv[1]
    output_file = sys.argv[2]

    result = {
        "歳入": {"款": []},
        "歳出": {"款": []}
    }

    # 歳入
    for filepath in sorted(glob.glob(os.path.join(ocr_dir, "歳入_*.json"))):
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        result["歳入"]["款"].append(data)
        print(f"歳入: {os.path.basename(filepath)}", file=sys.stderr)

    # 歳出
    for filepath in sorted(glob.glob(os.path.join(ocr_dir, "歳出_*.json"))):
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        result["歳出"]["款"].append(data)
        print(f"歳出: {os.path.basename(filepath)}", file=sys.stderr)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n統合完了: {output_file}", file=sys.stderr)
    print(f"歳入: {len(result['歳入']['款'])}款", file=sys.stderr)
    print(f"歳出: {len(result['歳出']['款'])}款", file=sys.stderr)


if __name__ == "__main__":
    main()
