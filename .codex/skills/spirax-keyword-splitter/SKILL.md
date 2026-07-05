---
name: spirax-keyword-splitter
description: Classify Spirax Sarco keyword CSV rows into product-series/type files and non-product attribute files under docs/关键词列表. Use when continuing or auditing the keyword split workflow, researching whether remaining English keywords are products, moving rows from 全球EN站关键词合并去重.csv into 按产品系列类型拆分, updating README/summary/progress CSVs, renaming category files as Volume-count-name.csv, or validating this keyword classification dataset.
---

# Spirax Keyword Splitter

Use this skill to continue the repo's keyword classification workflow for:

- `docs/关键词列表/全球EN站关键词合并去重.csv`
- `docs/关键词列表/按产品系列类型拆分/`
- `docs/关键词列表/按产品系列类型拆分/非产品属性拆分/`

Keep the CMS code, database, and generated `html/` output untouched unless the user explicitly asks for unrelated CMS work.

## Core Rules

- Treat CSV files as real CSV, not line-oriented text. Preserve UTF-8 BOM when rewriting CSV/README files in this dataset.
- Classify product keywords into product series/type CSVs. Classify non-product attributes into `非产品属性拆分/`.
- Do not force ambiguous short codes into product files. Move short codes only when evidence is strong.
- Series/type keywords belong in a product category when official/local evidence clearly maps the series/type to a product family.
- For specifications, material grades, document numbers, spare parts, company terms, finance, hiring, downloads, training, tools, generic site navigation, and invalid/noise queries, use non-product attribute files.
- Keep each edit batch small enough to explain and verify.

## Evidence Standard

Use one or more of these evidence sources before moving a keyword:

1. Official Spirax Sarco search, for example `https://www.spiraxsarco.com/search-results?q=<query>`.
2. Official Spirax Sarco product pages, PDFs, or installation/maintenance documents.
3. Local evidence in `docs/关键词列表/全部产品型号列表.md` or existing classified CSVs.
4. Strong search result evidence from another source when official evidence is unavailable.

For short codes and abbreviations, require precise evidence. Broad substring matches are not enough. If a term is multi-meaning and no dominant product mapping is clear, leave it in the main CSV or put it in an explicit non-product bucket only if the non-product intent is clear.

## Workflow

1. Inspect the current state:
   - Read `按产品系列类型拆分/README.md`.
   - Count remaining rows in `全球EN站关键词合并去重.csv`.
   - List existing product and non-product category files.

2. Research candidate keywords:
   - Query the official search URL with the keyword or model token.
   - Compare titles/snippets against local product lists and existing category files.
   - Record a concise evidence phrase for every moved row.

3. Prepare a move plan JSON and run the helper:
   - Use `scripts/keyword_splitter_tools.mjs apply`.
   - The helper removes exact keyword rows from the main CSV, appends them to target category CSVs, updates summary files, renames category files to match `最高Volume-关键词行数-分类.csv`, and validates the dataset.

4. Re-run validation:
   - Use `scripts/keyword_splitter_tools.mjs validate`.
   - Fix any missing BOM, bad counts, duplicate rows, main/target overlaps, or missing referenced files before reporting completion.

5. Report only the meaningful result:
   - Moved product rows by category.
   - Moved non-product rows by category.
   - Remaining main CSV row count.
   - Validation result.

## Move Plan Format

Create a temporary JSON file outside tracked docs, for example `/private/tmp/spirax-keyword-plan.json`:

```json
{
  "moves": [
    {
      "keyword": "spirax sarco b series",
      "targetType": "product",
      "category": "疏水阀",
      "token": "B series",
      "evidence": "Official/local evidence: B Series inverted bucket steam trap",
      "batch": "batch-70"
    },
    {
      "keyword": "spirax sarco pn16",
      "targetType": "non-product",
      "category": "规格参数",
      "token": "PN16",
      "evidence": "Pure pressure rating/specification"
    }
  ]
}
```

Required fields: `keyword`, `targetType`, `category`, `evidence`.

`targetType` must be `product` or `non-product`. `token` and `batch` are recommended for progress files.

## Helper Script

Run from the repo root:

```bash
node .codex/skills/spirax-keyword-splitter/scripts/keyword_splitter_tools.mjs validate
node .codex/skills/spirax-keyword-splitter/scripts/keyword_splitter_tools.mjs apply --plan /private/tmp/spirax-keyword-plan.json --batch batch-70
node .codex/skills/spirax-keyword-splitter/scripts/keyword_splitter_tools.mjs rename
```

The helper assumes the default root is `docs/关键词列表`. Pass `--root <path>` only for tests or copies.

## Naming Rule

Category CSV files use the same naming style as the keyword country files:

```text
最高Volume-关键词行数-分类名称.csv
```

`最高Volume` is the maximum numeric value in the CSV `Volume` column, not the sum. `关键词行数` is data rows excluding the header.

Keep management files unprefixed:

- `README.md`
- `匹配摘要.csv`
- `人工语义分类摘要.csv`
- `人工语义分类规则.csv`
- `自动型号分类候选.csv`
- `自动型号分类进度.csv`
- `非产品属性分类规则.csv`
- `非产品属性分类进度.csv`

## References

Read `references/category-policy.md` when you need the established category policy, non-product buckets, or evidence examples.
