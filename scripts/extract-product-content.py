#!/usr/bin/env python3
"""
从 spirax-global HTML 中提取产品详细内容并更新数据库
"""
import sqlite3
import re
from pathlib import Path
from html.parser import HTMLParser

# HTML内容提取器
class ProductContentExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_body = False
        self.in_overview = False
        self.content_parts = []
        self.overview_text = ""

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)

        # 检测 product-detail__body 区域
        if 'class' in attrs_dict and 'product-detail__body' in attrs_dict['class']:
            self.in_body = True

        # 检测 product-overview 区域
        if 'id' in attrs_dict and attrs_dict['id'] == 'product-overview':
            self.in_overview = True

        # 在body区域内记录标签
        if self.in_body:
            attrs_str = ' '.join([f'{k}="{v}"' for k, v in attrs])
            if attrs_str:
                self.content_parts.append(f'<{tag} {attrs_str}>')
            else:
                self.content_parts.append(f'<{tag}>')

    def handle_endtag(self, tag):
        if self.in_body:
            self.content_parts.append(f'</{tag}>')

        # 检查是否结束了body区域
        if tag == 'div' and self.in_body:
            # 简单判断：假设遇到第一个大的div结束就是body结束
            pass

    def handle_data(self, data):
        if self.in_body:
            self.content_parts.append(data.strip())
        if self.in_overview:
            self.overview_text += data.strip() + " "

# 产品映射：数据库ID -> HTML文件路径
PRODUCT_MAPPING = {
    1: "products/isolation-valves/hv3-stop-valves/index.html",
    2: "products/boiler-controls-and-systems/level-controls/lp30-boiler-level-controller/index.html",
    3: "products/boiler-controls-and-systems/tds-blowdown-controls/bc3150-boiler-blowdown-controller/index.html",
    4: "products/boiler-controls-and-systems/tds-blowdown-controls/bc3250-boiler-blowdown-controller/index.html",
    5: "products/boiler-controls-and-systems/tds-blowdown-controls/cp30-conductivity-probe/index.html",
    6: "products/clean-steam/bt6b-balanced-pressure-steam-trap/index.html",
    7: "products/clean-steam/btm7-stainless-steel-thermostatic-clean-steam-trap/index.html",
    8: "products/clean-steam/cs10-stainless-steel-clean-steam-separator/index.html",
    9: "products/clean-steam/csf16-steam-filter/index.html",
    10: "products/clean-steam/fts14-ball-float-steam-trap/index.html",
    11: "products/clean-steam/srv66-sanitary-pressure-reducing-valve/index.html",
    12: "products/condensate-and-heat-recovery-systems/mechanical-pumps/apt14-automatic-pump-trap/index.html",
    13: "products/condensate-and-heat-recovery-systems/mechanical-pumps/mfp14-condensate-pump/index.html",
    14: "products/control-systems/positioners-controllers-and-sensors/ep5-electro-pneumatic-positioner/index.html",
    15: "products/control-systems/positioners-controllers-and-sensors/ep500-electro-pneumatic-positioner/index.html",
    16: "products/control-systems/positioners-controllers-and-sensors/sp400-smart-positioner/index.html",
    17: "products/control-systems/positioners-controllers-and-sensors/sp500-smart-positioner/index.html",
    18: "products/control-systems/positioners-controllers-and-sensors/sp7-smart-positioner/index.html",
    19: "products/control-systems/positioners-controllers-and-sensors/sx80-process-controller/index.html",
    20: "products/control-systems/pressure-reducing-and-surplussing-valves/25p-pressure-reducing-valve/index.html",
    21: "products/control-systems/pressure-reducing-and-surplussing-valves/brv2s-pressure-reducing-valve/index.html",
    22: "products/control-systems/pressure-reducing-and-surplussing-valves/dp27-pressure-reducing-valve/index.html",
    23: "products/control-systems/safety-valves/sv607ds-safety-valve/index.html",
    24: "products/isolation-valves/bellows-sealed-stop-valves/bsa2t-bellows-sealed-stop-valve/index.html",
    25: "products/isolation-valves/bellows-sealed-stop-valves/bsa3t-bellows-sealed-stop-valve/index.html",
    26: "products/pipeline-ancillaries/air-vents-and-air-eliminators/av13-steam-system-air-vent/index.html",
    27: "products/pipeline-ancillaries/air-vents-and-air-eliminators/avc32-carbon-steel-air-vent/index.html",
    28: "products/pipeline-ancillaries/check-valves/dcv3-disc-check-valve/index.html",
    29: "products/steam-traps/balanced-pressure-steam-traps/bpc32ycv-carbon-steel-balanced-pressure-steam-trap/index.html",
    30: "products/steam-traps/balanced-pressure-steam-traps/mst21-balanced-pressure-steam-trap/index.html",
    31: "products/steam-traps/ball-float-steam-traps/ft14-ball-float-steam-trap/index.html",
    32: "products/steam-traps/ball-float-steam-traps/ft43-ball-float-steam-trap/index.html",
    33: "products/steam-traps/ball-float-steam-traps/ftgs14-ball-float-steam-trap/index.html",
    34: "products/steam-traps/thermodynamic-steam-traps/td32f-flanged-thermodynamic-steam-trap/index.html",
    35: "products/steam-traps/thermodynamic-steam-traps/td52-thermodynamic-steam-trap/index.html",
}

def extract_meta_from_html(html_content):
    """从HTML中提取meta标签信息"""
    title_match = re.search(r'<title>([^<]+)</title>', html_content)
    desc_match = re.search(r'<meta content="([^"]+)" name="description"', html_content)

    title = title_match.group(1) if title_match else ""
    description = desc_match.group(1) if desc_match else ""

    return title, description

def extract_product_overview(html_content):
    """提取产品概述内容"""
    # 提取 product-overview 区域的文本
    overview_match = re.search(
        r'<section[^>]*product-overview[^>]*>.*?<p[^>]*data-overview-content[^>]*>(.*?)</p>',
        html_content,
        re.DOTALL
    )
    if overview_match:
        return overview_match.group(1).strip()
    return ""

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
    overview = extract_product_overview(html_content)
    if overview:
        return f'<p>{overview}</p>'

    return ""

def process_product(product_id, html_path, base_dir):
    """处理单个产品"""
    full_path = Path(base_dir) / html_path

    if not full_path.exists():
        print(f"⚠️  产品 {product_id}: 文件不存在 {html_path}")
        return None

    with open(full_path, 'r', encoding='utf-8') as f:
        html_content = f.read()

    title, description = extract_meta_from_html(html_content)
    content_html = extract_product_body(html_content)

    return {
        'id': product_id,
        'seo_title': title,
        'seo_description': description,
        'summary': description,  # summary使用description
        'content_html': content_html
    }

def main():
    # 配置路径
    global_dist_dir = Path("/Users/yytest/Documents/projects/spirax-global/dist/zh-cn")
    db_path = Path("data/site.sqlite")

    # 连接数据库
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print(f"开始处理 {len(PRODUCT_MAPPING)} 个产品...")

    updated_count = 0
    failed_count = 0

    for product_id, html_path in PRODUCT_MAPPING.items():
        result = process_product(product_id, html_path, global_dist_dir)

        if result:
            # 更新数据库
            cursor.execute("""
                UPDATE content_product_translations
                SET
                    summary = ?,
                    content_html = ?,
                    seo_title = ?,
                    seo_description = ?
                WHERE id = ?
            """, (
                result['summary'],
                result['content_html'],
                result['seo_title'],
                result['seo_description'],
                result['id']
            ))

            updated_count += 1
            print(f"✅ 产品 {product_id}: 已更新")
        else:
            failed_count += 1
            print(f"❌ 产品 {product_id}: 更新失败")

    # 提交事务
    conn.commit()
    conn.close()

    print(f"\n处理完成:")
    print(f"  成功: {updated_count}")
    print(f"  失败: {failed_count}")
    print(f"  总计: {len(PRODUCT_MAPPING)}")

if __name__ == "__main__":
    main()
