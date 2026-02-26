# 富士市予算書データ化プロジェクト

## タスク概要

富士市の一般会計予算書をデータ化するプロジェクトです。
予算書はPDFで配布されており、データ分析がしづらい状態になっています。
そのため、PDFを分析可能な形（JSON→CSV）に変換することを目的としています。

## 具体的なステップ

```
PDF → 款ごとに分割 → テキスト抽出 → JSON作成 → CSV変換 → スプレッドシートで分析
```

1. **PDF分割・テキスト抽出**: `split_budget_by_section.py` で款ごとに分割し、PDF+テキストを出力
2. **JSON作成**: 抽出したテキストからJSONを作成（AI活用推奨）
3. **CSV変換**: `json_to_csv.py` でJSONをCSVに変換
4. **分析**: CSVをスプレッドシートにインポート

## ファイル構成

```
./ (root)
├── README.md                     # このファイル
├── split_budget_by_section.py    # PDF分割 + テキスト抽出
├── json_to_csv.py                # JSON → CSV変換
├── sample_歳入.json              # JSONのサンプル（期待する構造の参考）
│
└── n年度予算/
    ├── bugget.pdf                # 予算の元データ
    ├── repaired.pdf              # 修復済みPDF（必要な場合）
    ├── 分割/                     # 款ごとに分割されたファイル
    │   ├── 00_概要.pdf, .txt
    │   ├── 歳入_01款_市税.pdf, .txt
    │   ├── ...
    │   └── 99_附属資料.pdf, .txt
    ├── bugget.json               # 予算JSON（統合版）
    ├── bugget.csv                # 最終出力CSV
    ├── JSON_SPEC.md              # JSON構造の仕様書
    └── validate_json.py          # JSONバリデーション
```

## 作業手順

### Step 1: PDF分割とテキスト抽出

```bash
# 必要条件: ghostscript
brew install ghostscript

# 元PDFが破損している場合は修復（必要に応じて）
gs -sDEVICE=pdfwrite -dNOPAUSE -dBATCH -dSAFER -sOutputFile=n年度予算/repaired.pdf n年度予算/bugget.pdf

# 款ごとに分割（PDF + テキストを同時出力）
python split_budget_by_section.py n年度予算/repaired.pdf n年度予算/分割 --workers 8
```

出力ファイル:
- `00_概要.pdf/txt`: 予算の概要部分（款の前）
- `歳入_01款_市税.pdf/txt`: 各款のPDF+テキスト
- `99_附属資料.pdf/txt`: 給与費明細書、地方債調書など（款の後）

### Step 2: テキストの確認

```bash
# 内容を確認
cat n年度予算/分割/歳出_10款_教育費.txt

# 特定のキーワードを検索
grep -r "補助金" n年度予算/分割/*.txt
```

### Step 3: JSON作成

分割したテキストファイルからJSONを作成します。

**推奨ワークフロー（AI活用）**:
1. 分割テキストファイルをLLMに渡す
2. `sample_歳入.json` と `JSON_SPEC.md` を参照させる
3. 款単位でJSONを生成
4. `validate_json.py` でバリデーション

### Step 4: CSV変換

```bash
# JSONの検証
python n年度予算/validate_json.py n年度予算/bugget.json

# CSV出力
python json_to_csv.py n年度予算/bugget.json n年度予算/bugget.csv
```

## 注意点

### データ形式のルール

1. **CSVは編集しない**: 編集するのはJSONのみ。CSVはプログラムで生成する。

2. **計算式はテキストとして扱う**:
   ```
   測定見込額 408,000×98.9％ → "測定見込額": "408000*98.9%"
   ```
   - 演算子: ×→*, ÷→/
   - カンマ削除、単位は半角

3. **金額の単位**: (千円)表記の場合は1000倍して入力

4. **重複データ**: 節と説明で重複している行は説明側を削除

### 期待するJSON形式

```json
{
  "現年課税分": {
    "金額": 15717000000,
    "説明": {
      "均等割": {
        "金額": 403000000,
        "測定見込額": "408000*98.9%"
      }
    }
  }
}
```

### CSV出力フォーマット

```csv
款,項,目,節,説明,R6,R7
議会費,,,,,481596,499446
,議会費,,,,481596,499446
```
- UTF-8（BOMなし）、LF改行
- 金額は千円単位、カンマ区切りなし

## データソース

富士市のサイト: https://www.city.fuji.shizuoka.jp/documents/7863/hngtkl000000jj0q_1.pdf

**重要**: スキャンPDFではなく、テキスト埋め込みPDFを使うこと。

## よくある問題と解決策

| 問題 | 原因 | 解決策 |
|------|------|--------|
| PDFが白紙で表示される | PDF構造の破損 | ghostscriptで修復 |
| 款の分割位置がずれる | 検出ロジックの問題 | テキストを確認して手動調整 |
| JSONフォーマットがバラバラ | 仕様不統一 | スキーマ定義→バリデーション→再生成 |

## 学びの記録

各年度の作業で得た知見は `学び.md` に記録してください。
