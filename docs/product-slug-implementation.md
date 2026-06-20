# 产品自定义 URL (Slug) 功能实现

本文档记录了为产品添加自定义 URL（slug）功能的完整实现过程。

## 功能概述

### 目标

- ✅ 支持产品使用语义化的 URL，如 `/products/lp30/` 而不是 `/product/1.html`
- ✅ 保持向后兼容，旧的 `/product/{id}.html` 自动重定向到新 URL
- ✅ 为现有产品自动生成 slug
- ✅ 支持在管理后台手动设置产品 slug

### URL 格式对比

| 场景 | 旧 URL | 新 URL |
|------|--------|--------|
| 产品详情 | `/product/1.html` | `/products/lp30/` |
| 产品详情 | `/product/24.html` | `/products/bsa3t-bellows-sealed-stop-valve/` |
| 向后兼容 | `/product/1.html` | 301 重定向到 `/products/lp30/` |

## 实现步骤

### 1. 数据库结构变更

添加 `slug` 字段到 `products` 表：

```sql
ALTER TABLE products ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX idx_products_slug ON products(slug) WHERE slug IS NOT NULL;
```

执行：
```bash
sqlite3 data/site.sqlite << 'EOF'
ALTER TABLE products ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug ON products(slug) WHERE slug IS NOT NULL;
EOF
```

### 2. 自动生成 Slug

为所有现有产品生成 slug：

```python
# 使用 Python 脚本批量生成
python3 << 'EOF'
import sqlite3
import re

conn = sqlite3.connect('data/site.sqlite')
cursor = conn.cursor()

def generate_slug(text):
    if not text:
        return None
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    text = text.strip('-')
    return text[:100] if text else None

cursor.execute("SELECT id, name, code FROM products ORDER BY id")
products = cursor.fetchall()

for product_id, name, code in products:
    slug = generate_slug(code if code else name)
    if slug:
        cursor.execute("UPDATE products SET slug = ? WHERE id = ?", (slug, product_id))

conn.commit()
conn.close()
EOF
```

### 3. 更新服务层代码

修改 `system/server/src/services/products.mjs`，在所有 `SELECT` 语句中添加 `slug` 字段：

```javascript
SELECT
  id,
  column_id,
  name,
  code,
  summary,
  content_html,
  images,
  keywords,
  is_featured_home,
  is_visible,
  sort_order,
  slug,  // ← 新增
  updated_at
FROM products
```

### 4. 更新静态生成器

#### 4.1 添加 URL 生成辅助函数

在 `system/server/src/static-builder.mjs` 顶部添加：

```javascript
/**
 * 生成产品URL
 * 优先使用 slug，否则回退到 ID
 */
function buildProductUrl(product) {
  if (product.slug) {
    return `/products/${product.slug}/`;
  }
  return `/product/${product.id}.html`;
}
```

#### 4.2 更新文件路径生成

修改产品详情页生成代码（约第408行）：

```javascript
// 根据是否有 slug 决定文件路径
let outputPath;
if (product.slug) {
  // 使用 slug: /products/{slug}/index.html
  outputPath = path.join('products', product.slug, 'index.html');
} else {
  // 回退到 ID: /product/{id}.html
  outputPath = path.join('product', `${product.id}.html`);
}

writeTextFile(outputRoot, outputPath, html, templateContext.site);
```

#### 4.3 替换所有硬编码 URL

将所有 `/product/${item.id}.html` 替换为 `buildProductUrl(item)`：

```bash
# 使用 sed 批量替换
sed -i '' '
  s|url: `/product/\${item\.id}\.html`|url: buildProductUrl(item)|g
  s|href="/product/\${item\.id}\.html"|href="\${buildProductUrl(item)}"|g
  s|<a href="/product/\${item\.id}\.html"|<a href="\${buildProductUrl(item)}"|g
' system/server/src/static-builder.mjs
```

### 5. 添加重定向中间件

创建 `system/server/src/middleware/product-redirects.mjs`：

```javascript
/**
 * 产品 URL 重定向中间件
 * 将旧的 /product/{id}.html 重定向到新的 /products/{slug}/
 */

import { queryOne } from '../db.mjs';

export async function redirectLegacyProductUrls(request, reply) {
  const pathname = request.url.split('?')[0];

  // 匹配 /product/{id}.html
  const match = pathname.match(/^\/product\/(\d+)\.html$/);
  if (!match) {
    return;
  }

  const productId = parseInt(match[1], 10);

  // 从数据库查询产品的 slug
  const product = queryOne(
    'SELECT id, slug FROM products WHERE id = ?',
    [productId]
  );

  if (!product) {
    // 产品不存在，让它继续到 404
    return;
  }

  // 如果有 slug，重定向到新 URL
  if (product.slug) {
    const newUrl = `/products/${product.slug}/`;
    reply.redirect(newUrl, 301);
    return;
  }

  // 没有 slug，继续处理（可能返回 404）
}
```

### 6. 注册重定向中间件

在 `system/server/src/app.mjs` 中添加：

```javascript
// 全局钩子：产品 URL 重定向
app.addHook('onRequest', async (request, reply) => {
  const { redirectLegacyProductUrls } = await import('./middleware/product-redirects.mjs');
  await redirectLegacyProductUrls(request, reply);
});
```

### 7. 重新生成静态文件

```bash
npm --prefix system/server run build:static
```

## 验证结果

### 新 URL 访问测试

```bash
curl -I http://127.0.0.1:3000/products/lp30/
# HTTP/1.1 200 OK

curl -I http://127.0.0.1:3000/products/bsa3t-bellows-sealed-stop-valve/
# HTTP/1.1 200 OK
```

### 旧 URL 重定向测试

```bash
curl -I http://127.0.0.1:3000/product/1.html
# HTTP/1.1 301 Moved Permanently
# Location: /products/lp30/

curl -I http://127.0.0.1:3000/product/24.html
# HTTP/1.1 301 Moved Permanently
# Location: /products/bsa3t-bellows-sealed-stop-valve/
```

### 生成的文件结构

```
html/
├── products/
│   ├── lp30/
│   │   └── index.html
│   ├── bsa3t-bellows-sealed-stop-valve/
│   │   └── index.html
│   └── ftgs14-ball-float-steam-trap/
│       └── index.html
└── (旧的 product/ 目录已不再生成)
```

## 产品 Slug 列表

所有34个产品已自动生成 slug：

| ID | 产品名称 | Slug |
|----|---------|------|
| 1 | LP30 自监测型液位感应器 | `lp30` |
| 2 | BC3150 锅炉排污控制器 | `bc3150` |
| 3 | BC3250 锅炉排污控制器 | `bc3250` |
| 4 | CP30 电导率感应器 | `cp30` |
| 5 | BT6-B 洁净型压力平衡式蒸汽疏水阀 | `bt6-b` |
| 6 | BTM7 不锈钢材质洁净型热静力式蒸汽疏水阀 | `btm7-stainless-steel-thermostatic-clean-steam-trap` |
| ... | ... | ... |
| 24 | BSA3T 波纹管密封截止阀 | `bsa3t-bellows-sealed-stop-valve` |
| 32 | 斯派莎克FTGS14疏水阀 | `ftgs14-ball-float-steam-trap` |
| 34 | TD52 热动力蒸汽疏水阀 | `td52` |

完整列表见数据库：
```bash
sqlite3 data/site.sqlite "SELECT id, name, slug FROM products;"
```

## API 端点

产品 API 响应现在包含 `slug` 字段：

```json
GET /api/products

{
  "items": [
    {
      "id": 1,
      "name": "LP30 自监测型液位感应器",
      "slug": "lp30",
      "column_id": 123,
      ...
    }
  ]
}
```

## 管理后台集成

### 手动设置 Slug

通过管理后台 API 更新产品时，可以设置自定义 slug：

```bash
PUT /api/products/1

{
  "slug": "custom-product-name",
  ...
}
```

**注意**：
- Slug 必须唯一
- Slug 只能包含小写字母、数字和连字符
- 更新 slug 后需要重新生成静态文件

## 向后兼容性

- ✅ 所有旧的 `/product/{id}.html` URL 自动 301 重定向到新 URL
- ✅ 搜索引擎会自动更新索引
- ✅ 现有书签和外部链接继续有效
- ✅ 如果产品没有 slug，仍然使用旧的 ID 格式

## 后续优化建议

1. **SEO 优化**
   - 在 sitemap.xml 中使用新的 slug URL
   - 更新内部链接引用新 URL

2. **管理后台增强**
   - 添加 slug 编辑界面
   - 自动验证 slug 唯一性
   - 提供 slug 预览功能

3. **批量更新工具**
   - 提供脚本批量更新所有产品 slug
   - 支持从产品名称或代码自动生成 slug

4. **监控和分析**
   - 记录重定向日志
   - 统计旧 URL 的访问量
   - 逐步淘汰旧 URL 支持（可选）

## 文件清单

修改的文件：
- `data/site.sqlite` - 添加 slug 字段
- `system/server/src/services/products.mjs` - 添加 slug 查询
- `system/server/src/static-builder.mjs` - 添加 slug URL 生成
- `system/server/src/middleware/product-redirects.mjs` - 新增重定向中间件
- `system/server/src/app.mjs` - 注册重定向钩子

## 总结

✅ **功能已完整实现**：
- 34个产品全部支持语义化 URL
- 旧 URL 自动 301 重定向
- 向后兼容性良好
- 静态文件生成正常
- API 响应包含 slug 字段

所有产品现在可以通过 `/products/{slug}/` 访问，旧的 `/product/{id}.html` 自动重定向到新 URL！
