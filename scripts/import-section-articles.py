#!/usr/bin/env python3
"""
从 spirax-global 导入栏目文章内容
"""
import sqlite3
import re
from pathlib import Path
from datetime import datetime

# 配置
GLOBAL_DIST_DIR = Path("/Users/yytest/Documents/projects/spirax-global/dist/zh-cn/knowledge-exchange")
DB_PATH = Path("data/site.sqlite")
ROOT_COLUMN_ID = 69  # 当前导入目标栏目 ID
LANGUAGE_ID = 1  # zh-CN

def extract_article_data(html_file):
    """从 HTML 文件提取文章数据"""
    content = html_file.read_text(encoding='utf-8')

    # 提取 title
    title_match = re.search(r'<title>([^<]+)</title>', content)
    title = title_match.group(1) if title_match else ""
    title = title.replace(' | Spirax Sarco', '').strip()

    # 提取 meta description
    desc_match = re.search(r'<meta content="([^"]+)" name="description"', content)
    description = desc_match.group(1) if desc_match else ""

    # 提取主标题 h1
    h1_match = re.search(r'<h1[^>]*>([^<]+)</h1>', content)
    h1 = h1_match.group(1) if h1_match else title

    # 提取文章内容（article 标签）
    article_match = re.search(r'<article[^>]*>(.*?)</article>', content, re.DOTALL)
    article_html = article_match.group(1).strip() if article_match else ""

    # 如果没有 article 标签，尝试提取 main 标签
    if not article_html:
        main_match = re.search(r'<main[^>]*>(.*?)</main>', content, re.DOTALL)
        article_html = main_match.group(1).strip() if main_match else ""

    # 提取发布日期（如果有）
    date_match = re.search(r'<time[^>]*datetime="([^"]+)"', content)
    published_date = date_match.group(1) if date_match else None

    return {
        'seo_title': title,
        'name': h1,
        'summary': description,
        'content_html': article_html,
        'seo_description': description,
        'published_date': published_date
    }

def import_articles(conn):
    """导入文章"""
    cursor = conn.cursor()

    imported = 0
    skipped = 0
    failed = 0

    print(f"\n处理目录: {GLOBAL_DIST_DIR}")

    for article_dir in sorted(GLOBAL_DIST_DIR.iterdir()):
        if not article_dir.is_dir():
            continue

        html_file = article_dir / "index.html"
        if not html_file.exists():
            continue

        article_slug = article_dir.name
        custom_url = f'/knowledge-exchange/{article_slug}/index.html'

        # 检查是否已存在
        cursor.execute("""
            SELECT id FROM content_news WHERE custom_url = ?
        """, [custom_url])

        if cursor.fetchone():
            skipped += 1
            print(f"  ⊘ 已存在: {article_slug}")
            continue

        try:
            # 提取文章数据
            data = extract_article_data(html_file)

            # 插入主表（content_news）
            cursor.execute("""
                INSERT INTO content_news (
                    column_id, custom_url, code, is_featured_home,
                    created_at, updated_at
                ) VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))
            """, [ROOT_COLUMN_ID, custom_url, article_slug])

            entry_id = cursor.lastrowid

            # 插入翻译表（content_news_translations）
            cursor.execute("""
                INSERT INTO content_news_translations (
                    entry_id, language_id, name, summary, content_html,
                    seo_title, seo_description, publish_status,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'published', datetime('now'), datetime('now'))
            """, [
                entry_id,
                LANGUAGE_ID,
                data['name'],
                data['summary'],
                data['content_html'],
                data['seo_title'],
                data['seo_description']
            ])

            imported += 1
            print(f"  ✅ {data['name'][:50]}")

        except Exception as e:
            failed += 1
            print(f"  ❌ {article_slug}: {e}")

    conn.commit()
    return imported, skipped, failed

def main():
    print("=" * 80)
    print("知识交流（knowledge-exchange）栏目文章导入工具")
    print("=" * 80)

    # 连接数据库
    conn = sqlite3.connect(DB_PATH)

    try:
        # 导入文章
        print("\n[开始导入]")
        imported, skipped, failed = import_articles(conn)

        # 统计结果
        print("\n" + "=" * 80)
        print("导入完成")
        print("=" * 80)
        print(f"  成功导入: {imported} 篇")
        print(f"  跳过已存在: {skipped} 篇")
        print(f"  导入失败: {failed} 篇")
        print(f"  总计: {imported + skipped + failed} 篇")

    finally:
        conn.close()

if __name__ == "__main__":
    main()
