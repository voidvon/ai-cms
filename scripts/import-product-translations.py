#!/usr/bin/env python3
"""
从 spirax-global HTML 中提取产品详细内容并插入到 content_product_translations
"""
import sqlite3
import re
from pathlib import Path

# 数据库路径
DB_PATH = Path(__file__).parent.parent / "data" / "site.sqlite"
GLOBAL_DIST_DIR = Path("/Users/yytest/Documents/projects/spirax-global/dist/zh-cn")

def extract_meta_from_html(html_content):
    """从HTML中提取meta标签信息"""
    title_match = re.search(r'<title>([^<]+)</title>', html_content)
    desc_match = re.search(r'<meta content="([^"]+)" name="description"', html_content)

    title = title_match.group(1) if title_match else ""
    description = desc_match.group(1) if desc_match else ""

    return title, description

def extract_product_body(html_content):
    """提取产品详细内容HTML"""
    # 提取 product-detail__body 区域
    body_match = re.search(
        r'<div class="intro__copy copy intro__copy--left product-detail__body">(.*?)</div>\s*</div>\s*<aside',
        html_content,
        re.DOTALL
    )
    if body_match:
        return body_match.group(1).strip()

    # 如果没有详细body，尝试提取overview
    overview_match = re.search(
        r'<section[^>]*product-overview[^>]*>.*?<p[^>]*data-overview-content[^>]*>(.*?)</p>',
        html_content,
        re.DOTALL
    )
    if overview_match:
        return f'<p>{overview_match.group(1).strip()}</p>'

    return ""

def get_html_path_from_custom_url(custom_url):
    """从 custom_url 推断 HTML 文件路径"""
    # custom_url 格式: "hv3-stop-valves/index.html"
    # 需要找到对应的完整路径
    # 从之前的报告看，路径格式是: products/{category}/{product}/index.html

    # 简单策略：在 products/ 目录下递归查找匹配的文件
    product_slug = custom_url.replace('/index.html', '')

    # 在 products 目录下查找
    for html_file in GLOBAL_DIST_DIR.glob(f"products/**/{product_slug}/index.html"):
        return html_file

    return None

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 获取所有产品
    cursor.execute("""
        SELECT id, custom_url, code
        FROM content_product
        ORDER BY id
    """)
    products = cursor.fetchall()

    print(f"找到 {len(products)} 个产品")

    # 中文语言ID
    LANGUAGE_ID = 1

    success_count = 0
    failed_products = []

    for entry_id, custom_url, code in products:
        if not custom_url:
            print(f"⚠️  产品 {entry_id} (code={code}): 没有 custom_url")
            failed_products.append((entry_id, code, "无 custom_url"))
            continue

        html_path = get_html_path_from_custom_url(custom_url)

        if not html_path or not html_path.exists():
            print(f"⚠️  产品 {entry_id} (code={code}): 找不到 HTML 文件 {custom_url}")
            failed_products.append((entry_id, code, f"找不到文件: {custom_url}"))
            continue

        # 读取HTML
        with open(html_path, 'r', encoding='utf-8') as f:
            html_content = f.read()

        # 提取内容
        seo_title, seo_description = extract_meta_from_html(html_content)
        content_html = extract_product_body(html_content)

        # 插入数据库
        try:
            cursor.execute("""
                INSERT INTO content_product_translations (
                    entry_id,
                    language_id,
                    name,
                    summary,
                    content_html,
                    seo_title,
                    seo_description,
                    publish_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'published')
            """, (
                entry_id,
                LANGUAGE_ID,
                seo_title.split(' | ')[0] if ' | ' in seo_title else seo_title,  # 提取产品名称
                seo_description,
                content_html,
                seo_title,
                seo_description
            ))

            success_count += 1
            print(f"✅ 产品 {entry_id} ({code}): 已插入")

        except Exception as e:
            print(f"❌ 产品 {entry_id} ({code}): 插入失败 - {e}")
            failed_products.append((entry_id, code, str(e)))

    # 提交事务
    conn.commit()
    conn.close()

    print(f"\n处理完成:")
    print(f"  成功: {success_count}")
    print(f"  失败: {len(failed_products)}")
    print(f"  总计: {len(products)}")

    if failed_products:
        print(f"\n失败的产品:")
        for entry_id, code, reason in failed_products:
            print(f"  - ID={entry_id}, code={code}: {reason}")

if __name__ == "__main__":
    main()
