#!/usr/bin/env python3
"""
从 spirax-global 导入客户案例、行业应用、服务文章
"""
import sqlite3
import re
from pathlib import Path

# 配置
GLOBAL_BASE_DIR = Path("/Users/yytest/Documents/projects/spirax-global/dist/zh-cn")
DB_PATH = Path("data/site.sqlite")
LANGUAGE_ID = 1  # zh-CN

# 内容类型配置：目录名 -> (中文名称, 栏目ID, URL前缀)
CONTENT_TYPES = {
    'customer-stories': ('客户案例', None, '/customer-stories'),  # 需要创建栏目
    'industries': ('行业应用', 94, '/industries'),  # 使用现有栏目
    'services': ('服务', 70, '/services')  # 使用现有栏目
}

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

    return {
        'seo_title': title,
        'name': h1,
        'summary': description,
        'content_html': article_html,
        'seo_description': description
    }

def ensure_column(conn, dir_name, cn_name, url_prefix):
    """确保栏目存在，返回栏目ID"""
    cursor = conn.cursor()

    # 检查配置中是否指定了栏目ID
    column_id = CONTENT_TYPES[dir_name][1]
    if column_id:
        return column_id

    # 检查是否已存在该栏目
    cursor.execute("""
        SELECT c.id FROM columns c
        LEFT JOIN column_translations ct ON ct.column_id = c.id
        WHERE ct.name = ? AND ct.language_id = ?
    """, [cn_name, LANGUAGE_ID])

    existing = cursor.fetchone()
    if existing:
        return existing[0]

    # 创建新栏目
    cursor.execute("""
        INSERT INTO columns (
            source_type, source_id, content_model_id, route_path,
            is_visible, sort_order, created_at, updated_at
        ) VALUES ('news_category', ?, 2, ?, 1, 100, datetime('now'), datetime('now'))
    """, [1100 + hash(dir_name) % 1000, url_prefix])

    column_id = cursor.lastrowid

    # 插入栏目翻译
    cursor.execute("""
        INSERT INTO column_translations (column_id, language_id, name, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
    """, [column_id, LANGUAGE_ID, cn_name])

    conn.commit()
    print(f"  ✅ 创建栏目: {cn_name} (id={column_id})")
    return column_id

def import_content_type(conn, dir_name, cn_name, url_prefix):
    """导入某一类型的内容"""
    cursor = conn.cursor()

    # 确保栏目存在
    column_id = ensure_column(conn, dir_name, cn_name, url_prefix)

    content_dir = GLOBAL_BASE_DIR / dir_name
    if not content_dir.exists():
        print(f"  ⚠️ 目录不存在: {content_dir}")
        return 0, 0, 0

    imported = 0
    skipped = 0
    failed = 0

    print(f"\n处理: {cn_name} (栏目ID={column_id})")

    for article_dir in sorted(content_dir.iterdir()):
        if not article_dir.is_dir():
            continue

        html_file = article_dir / "index.html"
        if not html_file.exists():
            continue

        article_slug = article_dir.name
        custom_url = f'{url_prefix}/{article_slug}/index.html'

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

            # 插入主表
            cursor.execute("""
                INSERT INTO content_news (
                    column_id, custom_url, code, is_featured_home,
                    created_at, updated_at
                ) VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))
            """, [column_id, custom_url, article_slug])

            entry_id = cursor.lastrowid

            # 插入翻译表
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
    print("批量导入文章：客户案例、行业应用、服务")
    print("=" * 80)

    conn = sqlite3.connect(DB_PATH)

    try:
        total_imported = 0
        total_skipped = 0
        total_failed = 0

        # 按顺序导入三种类型
        for dir_name, (cn_name, _, url_prefix) in CONTENT_TYPES.items():
            imported, skipped, failed = import_content_type(conn, dir_name, cn_name, url_prefix)
            total_imported += imported
            total_skipped += skipped
            total_failed += failed

        # 统计结果
        print("\n" + "=" * 80)
        print("导入完成")
        print("=" * 80)
        print(f"  成功导入: {total_imported} 篇")
        print(f"  跳过已存在: {total_skipped} 篇")
        print(f"  导入失败: {total_failed} 篇")
        print(f"  总计: {total_imported + total_skipped + total_failed} 篇")

    finally:
        conn.close()

if __name__ == "__main__":
    main()
