#!/usr/bin/env python3
"""
扫描静态 HTML 页面中的站内链接，统计缺失的 HTML 页面链接。

规则：
- 只检查 <a href="..."> 链接
- 忽略图片、PDF、CSS、JS 等非 HTML 资源
- 忽略 mailto/tel/javascript/hash
- 忽略 Yandex 域名
- 对无扩展名的站内路径，优先按目录 URL 解析到 index.html
"""

from __future__ import annotations

import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit


IGNORE_PREFIXES = ("mailto:", "tel:", "javascript:", "#")
IGNORE_HOSTS = {
    "yandex.ru",
    "yandex.com",
    "yandex.by",
    "yandex.kz",
    "yandex.uz",
    "yastatic.net",
}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "localhost:1231", "127.0.0.1:1231"}
IGNORED_EXTS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".svg",
    ".webp",
    ".avif",
    ".bmp",
    ".ico",
    ".pdf",
    ".zip",
    ".rar",
    ".7z",
    ".mp4",
    ".mp3",
    ".wav",
    ".css",
    ".js",
    ".xml",
    ".txt",
    ".json",
    ".webmanifest",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
}


class AnchorParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self.links.append(href)


@dataclass(frozen=True)
class BrokenLink:
    page: str
    href: str


def host_is_ignored(host: str) -> bool:
    normalized = host.lower()
    return any(normalized == item or normalized.endswith(f".{item}") for item in IGNORE_HOSTS)


def resolve_link_target(root: Path, current_page: Path, href: str) -> Path | None:
    normalized_href = href.strip()
    if not normalized_href or any(normalized_href.startswith(prefix) for prefix in IGNORE_PREFIXES):
        return None

    parts = urlsplit(normalized_href)
    path = parts.path

    if parts.scheme in ("http", "https"):
        host = (parts.netloc or "").lower()
        if host_is_ignored(host):
            return None
        if host not in LOCAL_HOSTS:
            return None
        path = parts.path or "/"

    if not path:
        return None

    lower_path = path.lower()
    if any(lower_path.endswith(ext) for ext in IGNORED_EXTS):
        return None

    if path.startswith("/"):
        base = root / path.lstrip("/")
    else:
        base = current_page.parent / path

    # 目录 URL: /a/b/ -> /a/b/index.html
    if path.endswith("/"):
        return (base / "index.html").resolve()

    resolved = base.resolve()

    # 显式文件扩展名，按文件处理
    if resolved.suffix:
        return resolved

    # 无扩展名 URL，优先按目录页处理，再退回 *.html 文件
    index_candidate = (resolved / "index.html").resolve()
    if index_candidate.exists():
        return index_candidate

    html_candidate = Path(f"{resolved}.html").resolve()
    if html_candidate.exists():
        return html_candidate

    # 即使当前不存在，也按 CMS 目录 URL 习惯优先报告目录目标
    return index_candidate


def scan_html_broken_links(root: Path) -> list[BrokenLink]:
    html_files = {path.resolve() for path in root.rglob("*.html")}
    broken: list[BrokenLink] = []

    for page in sorted(root.rglob("*.html")):
        parser = AnchorParser()
        try:
            parser.feed(page.read_text("utf-8", errors="ignore"))
        except Exception:
            continue

        rel_page = str(page.relative_to(root))
        for href in parser.links:
            target = resolve_link_target(root, page, href)
            if target is None:
                continue
            if target not in html_files:
                broken.append(BrokenLink(page=rel_page, href=href.strip()))

    return broken


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "html").resolve()
    if not root.exists():
        print(f"HTML root not found: {root}", file=sys.stderr)
        return 1

    broken = scan_html_broken_links(root)
    counts = Counter(item.href for item in broken)
    examples: dict[str, list[str]] = defaultdict(list)
    for item in broken:
        if len(examples[item.href]) < 3:
            examples[item.href].append(item.page)

    print(f"TOTAL_BROKEN {len(broken)}")
    for href, count in counts.most_common():
        print(f"{count}\t{href}\t{' | '.join(examples[href])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
