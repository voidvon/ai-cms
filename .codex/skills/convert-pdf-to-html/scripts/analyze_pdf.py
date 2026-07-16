#!/usr/bin/env python3
"""Create a deterministic, page-level PDF conversion inventory with PyMuPDF."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable

try:
    import pymupdf
except ImportError as error:  # pragma: no cover - exercised by the CLI preflight
    raise SystemExit(
        "PyMuPDF is required. Install it with: "
        "python3 -m pip install --break-system-packages 'PyMuPDF>=1.24,<2'"
    ) from error


DOCUMENT_CODE_RE = re.compile(
    r"\b(?:IM|TI|TIS|SB|SP|GP)-[A-Z0-9]+(?:-[A-Z0-9]+){1,5}\b",
    re.IGNORECASE,
)
STANDARD_RE = re.compile(
    r"\b(?:ASME|ASTM|ANSI|ISO|EN|BS|DIN)\s*[A-Z]?\s*\d+"
    r"(?:[-:/.]\d+)*(?:\s+Class\s+\d+)?\b",
    re.IGNORECASE,
)
PRESSURE_CLASS_RE = re.compile(r"\bPN\s*\d+(?:\.\d+)?\b", re.IGNORECASE)
MODEL_RE = re.compile(
    r"\b(?=[A-Z0-9.-]{2,20}\b)(?=[A-Z0-9.-]*[A-Z])"
    r"(?=[A-Z0-9.-]*\d)[A-Z]{1,6}\d[A-Z0-9.-]{0,14}\b"
)
MEASUREMENT_RE = re.compile(
    r"(?<![\w.])(?:[-+]?\d+(?:[.,]\d+)?(?:\s*(?:-|–|—|to)\s*"
    r"[-+]?\d+(?:[.,]\d+)?)?)\s*"
    r"(?:°\s?[CF]|bar(?:\s?[ag])?|kPa|MPa|Pa|psi|mm|cm|m|kg|g|lb|"
    r"N\s?m|Nm|m³/h|m3/h|kg/h|l/min|L/min|%)(?![\w/])",
    re.IGNORECASE,
)


class VisibleHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hidden_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"script", "style", "noscript"}:
            self.hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style", "noscript"} and self.hidden_depth:
            self.hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.hidden_depth and data.strip():
            self.parts.append(data)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="使用 PyMuPDF 生成 PDF 页级清单、预览、表格候选和事实对账报告。"
    )
    parser.add_argument("--pdf", required=True, type=Path, help="源 PDF")
    parser.add_argument("--output-dir", required=True, type=Path, help="报告输出目录")
    parser.add_argument(
        "--html",
        action="append",
        default=[],
        type=Path,
        help="用于 PDF→HTML 事实对账的 HTML，可重复传入",
    )
    parser.add_argument("--password", default="", help="加密 PDF 密码")
    parser.add_argument(
        "--render-scale",
        type=float,
        default=2.0,
        help="整页理解预览倍率，默认 2.0",
    )
    parser.add_argument("--no-render", action="store_true", help="不输出整页预览图")
    parser.add_argument(
        "--fail-on-missing-facts",
        action="store_true",
        help="HTML 缺少任一抽取事实时返回非零状态",
    )
    return parser.parse_args()


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\u00a0", " ")).strip()


def normalize_fact(value: str) -> str:
    return normalize_text(value).replace("–", "-").replace("—", "-").casefold()


def compact_fact(value: str) -> str:
    return re.sub(
        r"[\s()]",
        "",
        normalize_fact(value).replace("class", ""),
    )


def collect_facts(text: str, page_number: int, sink: dict[str, dict[str, set[int]]]) -> None:
    patterns = {
        "document_codes": DOCUMENT_CODE_RE,
        "standards": STANDARD_RE,
        "pressure_classes": PRESSURE_CLASS_RE,
        "models": MODEL_RE,
        "measurements": MEASUREMENT_RE,
    }
    document_codes = {normalize_fact(match.group(0)) for match in DOCUMENT_CODE_RE.finditer(text)}
    for category, pattern in patterns.items():
        for match in pattern.finditer(text):
            value = normalize_text(match.group(0))
            if not value:
                continue
            if category == "models" and normalize_fact(value) in document_codes:
                continue
            if category == "models" and re.match(r"^(?:ASME|ASTM|ANSI|ISO|EN|BS|DIN|PN)\d", value, re.IGNORECASE):
                continue
            if category == "models" and re.match(r"^([A-Z]+)\d+[A-Z.-]*\1\d+", value):
                continue
            sink[category][value].add(page_number)


def serialize_facts(facts: dict[str, dict[str, set[int]]]) -> dict[str, list[dict[str, Any]]]:
    return {
        category: [
            {"value": value, "pages": sorted(pages)}
            for value, pages in sorted(values.items(), key=lambda item: normalize_fact(item[0]))
        ]
        for category, values in facts.items()
    }


def visible_html_text(files: Iterable[Path]) -> tuple[str, list[str]]:
    all_parts: list[str] = []
    resolved_files: list[str] = []
    for file_path in files:
        resolved = file_path.expanduser().resolve()
        if not resolved.is_file():
            raise FileNotFoundError(f"HTML 不存在: {resolved}")
        parser = VisibleHtmlParser()
        parser.feed(resolved.read_text(encoding="utf-8"))
        all_parts.extend(parser.parts)
        resolved_files.append(str(resolved))
    return normalize_fact(" ".join(all_parts)), resolved_files


def compare_facts(
    serialized_facts: dict[str, list[dict[str, Any]]], html_files: Iterable[Path]
) -> dict[str, Any] | None:
    html_files = list(html_files)
    if not html_files:
        return None
    html_text, resolved_files = visible_html_text(html_files)
    compact_html_text = compact_fact(html_text)
    missing: dict[str, list[dict[str, Any]]] = {}
    matched_count = 0
    total_count = 0
    for category, entries in serialized_facts.items():
        category_missing = []
        for entry in entries:
            total_count += 1
            if compact_fact(entry["value"]) in compact_html_text:
                matched_count += 1
            else:
                category_missing.append(entry)
        if category_missing:
            missing[category] = category_missing
    return {
        "html_files": resolved_files,
        "fact_count": total_count,
        "matched_count": matched_count,
        "missing_count": total_count - matched_count,
        "missing": missing,
        "note": "该报告是确定性候选对账；版式拆词、OCR 和语义改写造成的差异需要人工复核。",
    }


def rect_to_list(rect: Any) -> list[float]:
    return [round(float(value), 3) for value in (rect.x0, rect.y0, rect.x1, rect.y1)]


def extract_fonts(text_dict: dict[str, Any]) -> list[dict[str, Any]]:
    fonts: dict[tuple[str, float], int] = defaultdict(int)
    for block in text_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                key = (str(span.get("font") or ""), round(float(span.get("size") or 0), 2))
                fonts[key] += len(str(span.get("text") or ""))
    return [
        {"name": name, "size": size, "character_count": count}
        for (name, size), count in sorted(fonts.items(), key=lambda item: (-item[1], item[0]))
    ]


def write_table_csv(table: Any, file_path: Path) -> tuple[int, int]:
    matrix = table.extract() or []
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with file_path.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.writer(target)
        for row in matrix:
            writer.writerow([normalize_text(str(cell or "")) for cell in row])
    row_count = len(matrix)
    column_count = max((len(row) for row in matrix), default=0)
    return row_count, column_count


def inspect_page(
    page: Any,
    page_number: int,
    output_dir: Path,
    render_scale: float,
    should_render: bool,
    facts: dict[str, dict[str, set[int]]],
) -> tuple[dict[str, Any], str]:
    text = page.get_text("text", sort=True)
    text_dict = page.get_text("dict", sort=True)
    words = page.get_text("words", sort=True)
    text_path = output_dir / "pages" / f"page-{page_number:03d}.txt"
    text_path.parent.mkdir(parents=True, exist_ok=True)
    text_path.write_text(text, encoding="utf-8")
    collect_facts(text, page_number, facts)

    preview_path = None
    if should_render:
        preview_path = output_dir / "previews" / f"page-{page_number:03d}.png"
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(render_scale, render_scale), alpha=False)
        pixmap.save(preview_path)

    image_candidates = []
    for index, info in enumerate(page.get_image_info(hashes=True, xrefs=True), start=1):
        bbox = pymupdf.Rect(info.get("bbox") or (0, 0, 0, 0))
        image_candidates.append(
            {
                "index": index,
                "xref": int(info.get("xref") or 0),
                "bbox": rect_to_list(bbox),
                "width": int(info.get("width") or 0),
                "height": int(info.get("height") or 0),
                "colorspace": int(info.get("colorspace") or 0),
                "digest": bytes(info.get("digest") or b"").hex(),
            }
        )

    table_candidates = []
    try:
        tables = page.find_tables().tables
    except Exception as error:  # PyMuPDF table recognition may reject malformed drawings
        tables = []
        table_error = str(error)
    else:
        table_error = ""
    for index, table in enumerate(tables, start=1):
        csv_path = output_dir / "tables" / f"page-{page_number:03d}-table-{index:02d}.csv"
        row_count, column_count = write_table_csv(table, csv_path)
        table_candidates.append(
            {
                "index": index,
                "bbox": rect_to_list(pymupdf.Rect(table.bbox)),
                "rows": row_count,
                "columns": column_count,
                "csv": str(csv_path.relative_to(output_dir)),
            }
        )

    text_blocks = [block for block in text_dict.get("blocks", []) if block.get("type") == 0]
    image_blocks = [block for block in text_dict.get("blocks", []) if block.get("type") == 1]
    character_count = len(re.sub(r"\s+", "", text))
    page_area = max(float(page.rect.width * page.rect.height), 1.0)
    max_image_ratio = max(
        (
            max(0.0, pymupdf.Rect(item["bbox"]).width * pymupdf.Rect(item["bbox"]).height) / page_area
            for item in image_candidates
        ),
        default=0.0,
    )
    scan_likely = character_count < 40 and max_image_ratio >= 0.5
    drawings = page.get_drawings()

    return (
        {
            "page": page_number,
            "width_points": round(float(page.rect.width), 3),
            "height_points": round(float(page.rect.height), 3),
            "rotation": int(page.rotation),
            "character_count": character_count,
            "word_count": len(words),
            "text_block_count": len(text_blocks),
            "image_block_count": len(image_blocks),
            "embedded_image_count": len(image_candidates),
            "vector_drawing_count": len(drawings),
            "link_count": len(page.get_links()),
            "scan_likely": scan_likely,
            "fonts": extract_fonts(text_dict),
            "image_candidates": image_candidates,
            "table_candidates": table_candidates,
            "table_detection_error": table_error or None,
            "text_file": str(text_path.relative_to(output_dir)),
            "preview_file": str(preview_path.relative_to(output_dir)) if preview_path else None,
        },
        text,
    )


def build_markdown(report: dict[str, Any]) -> str:
    document = report["document"]
    lines = [
        "# PDF 分析与对账报告",
        "",
        f"- 文件：`{document['file']}`",
        f"- SHA-256：`{document['sha256']}`",
        f"- PyMuPDF：`{report['tool']['version']}`",
        f"- 页数：{document['page_count']}",
        f"- 可疑扫描页：{', '.join(map(str, document['scan_likely_pages'])) or '无'}",
        f"- 表格候选：{document['table_candidate_count']}",
        f"- 图片候选：{document['image_candidate_count']}",
        "",
        "## 页级清单",
        "",
        "| 页 | 字符 | 词 | 文本块 | 图片 | 矢量 | 表格 | 扫描疑似 |",
        "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |",
    ]
    for page in report["pages"]:
        lines.append(
            f"| {page['page']} | {page['character_count']} | {page['word_count']} | "
            f"{page['text_block_count']} | {page['embedded_image_count']} | "
            f"{page['vector_drawing_count']} | {len(page['table_candidates'])} | "
            f"{'是' if page['scan_likely'] else '否'} |"
        )
    comparison = report.get("html_comparison")
    if comparison:
        lines.extend(
            [
                "",
                "## PDF → HTML 事实对账",
                "",
                f"- 事实候选：{comparison['fact_count']}",
                f"- 已匹配：{comparison['matched_count']}",
                f"- 待复核缺失：{comparison['missing_count']}",
            ]
        )
        for category, entries in comparison["missing"].items():
            lines.extend(["", f"### {category}", ""])
            lines.extend(
                f"- `{entry['value']}`（PDF 页 {', '.join(map(str, entry['pages']))}）"
                for entry in entries
            )
    lines.extend(
        [
            "",
            "## 使用说明",
            "",
            "整页预览只用于理解内容关系，不能作为最终正文。表格和图片均为候选，仍需按 PDF 语义、裁切边界和 HTML 结构人工验收。",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    pdf_path = args.pdf.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if not pdf_path.is_file():
        raise FileNotFoundError(f"PDF 不存在: {pdf_path}")
    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError(f"输入不是 PDF: {pdf_path}")
    if args.render_scale <= 0 or args.render_scale > 8:
        raise ValueError("--render-scale 必须大于 0 且不超过 8")

    output_dir.mkdir(parents=True, exist_ok=True)
    document = pymupdf.open(pdf_path)
    if document.needs_pass and not document.authenticate(args.password):
        raise ValueError("PDF 已加密且密码无效")

    facts: dict[str, dict[str, set[int]]] = defaultdict(lambda: defaultdict(set))
    pages = []
    source_text_parts = []
    for page_index in range(document.page_count):
        page_report, page_text = inspect_page(
            document.load_page(page_index),
            page_index + 1,
            output_dir,
            args.render_scale,
            not args.no_render,
            facts,
        )
        pages.append(page_report)
        source_text_parts.append(f"\n\n===== PAGE {page_index + 1} =====\n\n{page_text}")

    source_text = "".join(source_text_parts).lstrip()
    (output_dir / "source-text.txt").write_text(source_text, encoding="utf-8")
    serialized_facts = serialize_facts(facts)
    html_comparison = compare_facts(serialized_facts, args.html)
    report = {
        "schema_version": 1,
        "tool": {"name": "PyMuPDF", "version": pymupdf.VersionBind},
        "document": {
            "file": str(pdf_path),
            "file_name": pdf_path.name,
            "size_bytes": pdf_path.stat().st_size,
            "sha256": sha256_file(pdf_path),
            "page_count": document.page_count,
            "metadata": document.metadata,
            "is_pdf": bool(document.is_pdf),
            "is_encrypted": bool(document.is_encrypted),
            "scan_likely_pages": [page["page"] for page in pages if page["scan_likely"]],
            "table_candidate_count": sum(len(page["table_candidates"]) for page in pages),
            "image_candidate_count": sum(len(page["image_candidates"]) for page in pages),
        },
        "facts": serialized_facts,
        "pages": pages,
        "html_comparison": html_comparison,
    }
    (output_dir / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (output_dir / "report.md").write_text(build_markdown(report), encoding="utf-8")
    missing_fact_count = html_comparison["missing_count"] if html_comparison else None
    print(json.dumps({
        "success": not (args.fail_on_missing_facts and missing_fact_count),
        "requires_review": bool(missing_fact_count),
        "report": str(output_dir / "report.json"),
        "page_count": document.page_count,
        "table_candidate_count": report["document"]["table_candidate_count"],
        "image_candidate_count": report["document"]["image_candidate_count"],
        "missing_fact_count": missing_fact_count,
    }, ensure_ascii=False, indent=2))
    if args.fail_on_missing_facts and html_comparison and html_comparison["missing_count"]:
        return 1
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"PDF analysis failed: {error}", file=sys.stderr)
        raise SystemExit(2) from error
