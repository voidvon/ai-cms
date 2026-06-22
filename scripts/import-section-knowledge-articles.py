#!/usr/bin/env python3
"""
从 spirax-global 导入知识中心栏目文章到栏目内容表
"""
import sqlite3
import re
from pathlib import Path
from datetime import datetime

# 配置
GLOBAL_DIST_DIR = Path("/Users/yytest/Documents/projects/spirax-global/dist/zh-cn/learn-about-steam")
DB_PATH = Path("data/site.sqlite")
PARENT_COLUMN_ID = 311  # 知识中心栏目ID
CONTENT_MODEL_ID = 2  # 当前目标内容模型 ID
LANGUAGE_ID = 1  # zh-CN

# 分类映射（英文slug -> 中文名称）
CATEGORY_NAMES = {
    'introduction': '入门介绍',
    'steam-engineering-principles-and-heat-transfer': '蒸汽工程原理与传热',
    'the-boiler-house': '锅炉房',
    'flowmetering': '流量计量',
    'basic-control-theory': '基础控制理论',
    'control-hardware-electric-pneumatic-actuation': '控制硬件：电动/气动执行',
    'control-hardware---self-acting-actuation': '控制硬件：自力式执行',
    'control-applications': '控制应用',
    'safety-valves': '安全阀',
    'steam-distribution': '蒸汽分配',
    'steam-traps-and-steam-trapping': '蒸汽疏水阀',
    'pipeline-ancillaries': '管道附件',
    'condensate-removal': '凝结水排除',
    'condensate-recovery': '凝结水回收',
    'desuperheating': '减温'
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

def create_category_columns(conn):
    """创建分类栏目"""
    cursor = conn.cursor()
    category_column_ids = {}

    sort_order = 10
    source_id = 1000  # 起始 source_id，避免与其他栏目冲突

    for slug, name in CATEGORY_NAMES.items():
        # 检查是否已存在
        cursor.execute("""
            SELECT id FROM columns
            WHERE parent_id = ? AND dir_name = ?
        """, [PARENT_COLUMN_ID, slug])

        existing = cursor.fetchone()
        if existing:
            category_column_ids[slug] = existing[0]
            print(f"  分类已存在: {name} (id={existing[0]})")
            source_id += 1
            continue

        # 创建栏目（使用递增的 source_id）
        cursor.execute("""
            INSERT INTO columns (
                parent_id, source_type, source_id, content_model_id,
                dir_name, route_path, detail_rule, is_visible, sort_order,
                created_at, updated_at
            ) VALUES (?, 'news_category', ?, ?, ?, ?, '{slug}/index.html', 1, ?, datetime('now'), datetime('now'))
        """, [
            PARENT_COLUMN_ID,
            source_id,
            CONTENT_MODEL_ID,
            slug,
            f'/knowledge-exchange/{slug}',
            sort_order
        ])

        source_id += 1

        column_id = cursor.lastrowid
        category_column_ids[slug] = column_id

        # 插入翻译
        cursor.execute("""
            INSERT INTO column_translations (column_id, language_id, name, created_at, updated_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now'))
        """, [column_id, LANGUAGE_ID, name])

        print(f"  ✅ 创建分类: {name} (id={column_id})")
        sort_order += 10

    conn.commit()
    return category_column_ids

def import_articles(conn, category_column_ids):
    """导入文章"""
    cursor = conn.cursor()

    imported = 0
    skipped = 0
    failed = 0

    for category_slug, column_id in category_column_ids.items():
        category_dir = GLOBAL_DIST_DIR / category_slug
        if not category_dir.is_dir():
            continue

        print(f"\n处理分类: {CATEGORY_NAMES[category_slug]}")

        for article_dir in category_dir.iterdir():
            if not article_dir.is_dir():
                continue

            html_file = article_dir / "index.html"
            if not html_file.exists():
                continue

            article_slug = article_dir.name
            custom_url = f'/knowledge-exchange/{category_slug}/{article_slug}/index.html'

            # 检查是否已存在
            cursor.execute("""
                SELECT id FROM content_news WHERE custom_url = ?
            """, [custom_url])

            if cursor.fetchone():
                skipped += 1
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
                """, [column_id, custom_url, article_slug])

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
                print(f"  ✅ {data['name']}")

            except Exception as e:
                failed += 1
                print(f"  ❌ {article_slug}: {e}")

    conn.commit()
    return imported, skipped, failed

def main():
    print("=" * 80)
    print("知识中心文章导入工具")
    print("=" * 80)

    # 连接数据库
    conn = sqlite3.connect(DB_PATH)

    try:
        # 1. 创建分类栏目
        print("\n[步骤 1] 创建分类栏目...")
        category_column_ids = create_category_columns(conn)
        print(f"  完成: {len(category_column_ids)} 个分类")

        # 2. 导入文章
        print("\n[步骤 2] 导入文章...")
        imported, skipped, failed = import_articles(conn, category_column_ids)

        # 3. 统计结果
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
