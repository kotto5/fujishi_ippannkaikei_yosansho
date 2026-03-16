# Excel → SQLite パイプライン設計

## 背景

入力が PDF から Excel に変わった。ただし入力 Excel は **印刷レイアウトそのもの** であり、
大量のマージセル・繰り返しヘッダ・狭列による擬似印刷を含む複雑な構造を持つ。

既存の PDF パイプライン（`ARCHITECTURE.md` 参照）の設計原則はそのまま維持する:
不変データ、純粋関数パイプライン、関心の分離。

---

## 入力 Excel の構造

### ファイル

- `inputs/r7.xlsx` — 令和7年度予算書
- `inputs/r8.xlsx` — 令和8年度予算書
- 14シート（款ごとに1シート）、78列（A〜BZ）、シートあたり最大 31,968 マージセル

### レイアウト特性

- **繰り返しヘッダ**: 約150行ごと（ページ区切り）にヘッダ行が再出現
- **2物理行 = 1論理行**: データは上下2行ペアで1つの論理レコード
- **r7 と r8 は構造同一**: 値のみが異なる

### 列マッピング（主要列）

| Excel列 | 内容 | 備考 |
|----------|------|------|
| C | 目 番号 | |
| E | 目 名称 | |
| L | 本年度予算額 | |
| O | 前年度予算額 | |
| R | 比較 | |
| U | 国県支出金 | |
| X | 地方債 | |
| AA | その他 | |
| AE | 一般財源 | |
| AL | 節 番号 | |
| AN | 節 名称 | |
| AQ | 節 金額 | |
| AT〜BZ | 説明（階層構造） | BL/BN/BR にレベル別金額 |

### 款・項の取得

シート名 = 款名。項はシート内のデータ行から取得（セル位置は要確認）。

---

## 技術選定

### 言語: TypeScript

パーサーのコアは「複雑な条件分岐 → 階層構造構築」であり、型安全性が最も効く領域。

- **Discriminated Union + exhaustive check** で行分類を型レベルで保証
- **ts-pattern** で宣言的なパターンマッチング
- **`as const` / `Readonly` / branded types** で款→項→目→節の階層を型で表現
- **better-sqlite3** は同期 API — 純粋関数パイプラインに自然に乗る

### Excel 読取: SheetJS (xlsx)

- `sheet['!merges']` でマージセル情報（`{s:{r,c}, e:{r,c}}[]`）が取得可能
- 論理セル境界の復元に必要十分
- Node.js ネイティブ、型定義あり

### SQLite: better-sqlite3

- 同期 API（async/callback 不要で純粋関数と合成しやすい）
- prepared statement、トランザクション、FK 制約サポート

---

## 出力: SQLite（正規化リレーショナルストア）

### なぜ SQLite か

- **FK 整合性**: 新年度データが既存マスタ（款/項/目）と一致するか検証可能
- **経年比較**: setsumei レベルの年度比較が SQL JOIN で自然に書ける
- **横展開**: 議会質問データ等の関連テーブルをスキーマ追加だけで対応可能
- **年度増加**: INSERT するだけ。ファイル結合やカラム追加不要
- **射影の自由度**: Excel/NDJSON/ダッシュボード等の出力は SELECT + 薄い変換

### スキーマ方針（詳細は Phase 2 で確定）

```
kan(id, number, name)                        ← 款マスタ
kou(id, kan_id FK, number, name)             ← 項マスタ
moku(id, kou_id FK, number, name)            ← 目マスタ

budget(id, moku_id FK, year, honendo, zenendo, hikaku,
       kokuken, chihousei, sonota, ippan)    ← 目×年度の予算額

setsu(id, budget_id FK, number, name, amount) ← 節

setsumei(id, setsu_id FK, code, level, name, amount) ← 説明
```

- マスタ（kan/kou/moku）は年度非依存。初回 INSERT 時に作成、以降は参照のみ。
- budget 以下が年度ごとのデータ。`year` カラムで区別。
- 議会質問等の横データは `gikai_question(id, setsumei_id FK, ...)` のように追加。

---

## パイプライン

```
複雑 Excel ──→ excel2db ──→ SQLite (canonical)
                                │
                                ├──→ db2csv    ──→ CSV (経年比較等)
                                ├──→ db2rows   ──→ NDJSON (パイプ用)
                                └──→ SQL 直接  ──→ 任意の射影
```

既存の PDF パイプライン（`pdf2long` 等）は引き続き利用可能。
新パイプラインは Excel 入力専用の別系統として共存する。

---

## 作業フェーズ

### Phase 1: Excel → TypeScript データ構造（パーサー）

**目的**: 複雑な印刷レイアウト Excel を構造化された TypeScript オブジェクトに変換する。
ここが最もリスクが高い。マージセル・繰り返しヘッダ・2行ペアの解析が核心。

1. r7.xlsx の1シートで SheetJS のセル構造を確認（使い捨てスクリプト）
2. ドメイン型の定義: discriminated union で行分類、Readonly で不変性保証
3. パース関数の実装: `parseBudgetExcel(path) => ReadonlyArray<BudgetRow>`
   - SQLite のことはまだ考えない
4. 全シート + r8.xlsx での動作確認
   - r7 と r8 の差分が「値のみ」であることを検証

**成果物**: 入力 Excel → 構造化データの純粋変換関数

### Phase 2: SQLite スキーマ & INSERT

**目的**: Phase 1 の実データパターンからスキーマを確定し、DB 投入する。

1. スキーマ確定 — Phase 1 で判明した setsumei コード体系・マスタ粒度を反映
2. `excel2db` CLI — Phase 1 のパーサー出力 → better-sqlite3 INSERT
3. r7, r8 の投入 + FK 整合性チェック

**成果物**: `nix run .#excel2db -- inputs/r7.xlsx budget.db`

### Phase 3: 射影レイヤー

**目的**: SQLite → 各種出力フォーマット。

1. 経年比較 CSV — setsumei レベルの年度比較
2. NDJSON パイプ — 既存 long2rows 相当
3. 横展開（議会質問等）の受け口確認

**成果物**: `nix run .#db2csv -- budget.db > result/comparison.csv`

---

## 既存パイプラインとの関係

| 観点 | 既存（PDF系） | 新規（Excel系） |
|------|--------------|----------------|
| 言語 | Python | TypeScript |
| 入力 | PDF | 印刷レイアウト Excel |
| 正準ストア | NDJSON(FlatRow) | SQLite |
| パーサー | pdfplumber → 幾何解析 | SheetJS → マージセル解析 |
| 出力 | long/short/trend Excel | CSV, NDJSON |

ドメインモデル（款→項→目→節→説明の階層）は共通。
新パイプラインは TypeScript で独立実装し、`ts/` ディレクトリに配置する。
