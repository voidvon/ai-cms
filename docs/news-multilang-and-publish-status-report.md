# News 多语言改造与 publish_status 增强完成报告

## 执行时间
2026-06-16

## 任务概述

1. ✅ News 表多语言架构确认
2. ✅ 清理旧的表和 FTS 索引
3. ✅ publish_status 字段增强为三种状态
4. ✅ TypeScript 类型定义更新

---

## 一、News 多语言架构

### 表结构确认

News 表已经完成了多语言改造，结构与 Product 表一致：

#### content_news（主表）- 14 个字段
```
id, column_id, custom_url, code, images, primary_image, 
is_visible, is_featured_home, sort_order, 
publish_status, published_at, legacy_extra, 
created_at, updated_at
```

#### content_news_translations（翻译表）- 14 个字段
```
id, entry_id, language_id, 
name, summary, content_html, keywords, 
seo_title, seo_keywords, seo_description, 
publish_status, published_at, 
created_at, updated_at
```

### 与 Product 的关键差异

| 特性 | Product | News |
|-----|---------|------|
| 翻译表字段名 | `name` | `name` (对应 title) |
| 翻译表 `published_at` | ❌ 无 | ✅ 有 |
| 主表 `published_at` | ❌ 无 | ✅ 有 |
| 原因 | 产品上线时间不重要 | 新闻发布时间很重要 |

---

## 二、旧表清理

### 已删除的表

```sql
DROP TABLE IF EXISTS news;          -- 旧的单语言 news 表
DROP TABLE IF EXISTS news_fts;      -- 旧的全文搜索表
DROP TABLE IF EXISTS products_fts;  -- 旧的全文搜索表
DROP TABLE IF EXISTS products;      -- 旧的单语言 products 表
```

### 自动删除的 FTS 辅助表
- `news_fts_config`
- `news_fts_data`
- `news_fts_docsize`
- `news_fts_idx`
- `products_fts_config`
- `products_fts_data`
- `products_fts_docsize`
- `products_fts_idx`

### 自动删除的触发器
- `news_ad`
- `news_ai`
- `news_au`

### 保留的表和索引

```
content_news
content_news_translations
idx_content_news_column_sort
idx_content_news_translations_entry_language
idx_content_news_visible
sqlite_autoindex_content_news_translations_1
```

---

## 三、publish_status 字段增强

### 新的状态枚举

```typescript
export type PublishStatus = 'draft' | 'pending_review' | 'published';
```

| 状态值 | 中文含义 | 说明 |
|--------|---------|------|
| `draft` | 草稿/未发布 | 内容正在编辑中，不对外显示 |
| `pending_review` | 审核中 | 内容已提交，等待审核 |
| `published` | 已发布 | 内容已审核通过并发布 |

### 数据存储格式

- **类型**: 字符串（TEXT）
- **原因**: 可读性强、自解释、易于调试、扩展性好、类型安全
- **默认值**: `'published'`

### 为什么选择字符串而非整数

✅ **优点**:
1. 数据库中直接可读 - `SELECT * WHERE publish_status = 'draft'`
2. 不需要维护映射表 - 无需 `{0: 'draft', 1: 'published'}`
3. 日志清晰 - 显示 `publish_status=draft` 而非 `publish_status=0`
4. 扩展容易 - 添加状态不担心数字冲突
5. TypeScript 类型安全 - 编译时检查枚举值

❌ **整数方案的问题**:
- 节省空间微不足道（35条 × 4字节 = 140字节）
- 性能差异可忽略（SQLite 对短字符串比较很快）
- 可维护性差

---

## 四、TypeScript 类型更新

### 文件: system/admin/src/types/index.ts

#### 新增统一类型
```typescript
// 发布状态枚举类型
export type PublishStatus = 'draft' | 'pending_review' | 'published';
```

#### 更新的接口

```typescript
export interface ProductTranslation {
  name: string;
  summary?: string;
  content_html?: string;
  keywords?: string;
  seo_title?: string;
  seo_keywords?: string;
  seo_description?: string;
  publish_status: PublishStatus;  // ← 更新
  // 注意: 产品翻译表没有 published_at 字段，使用 created_at
}

export interface ProductTranslationStatus {
  language_code: string;
  publish_status: PublishStatus;  // ← 更新
  has_content: boolean;
}

export interface NewsTranslation {
  title: string;
  summary?: string;
  content_html?: string;
  keywords?: string;
  seo_title?: string;
  seo_keywords?: string;
  seo_description?: string;
  publish_status: PublishStatus;  // ← 更新
  published_at?: string | null;
}

export interface NewsTranslationStatus {
  language_code: string;
  publish_status: PublishStatus;  // ← 更新
  published_at?: string | null;
  has_content: boolean;
}
```

### 编译验证

```bash
✓ TypeScript 编译成功
✓ Vite 构建成功
✓ 输出: dist/assets/index-OpwTfqg7.js (1.42 MB)
```

---

## 五、数据库状态验证

### content_product_translations
- ✅ 字段数: 13（无 `published_at`）
- ✅ 数据量: 35 条
- ✅ `publish_status` 默认值: `'published'`

### content_news_translations
- ✅ 字段数: 14（有 `published_at`）
- ✅ 数据量: 0 条
- ✅ `publish_status` 默认值: `'published'`

---

## 六、后续建议

### 立即可做
1. **管理界面** - 添加状态选择器（下拉框）
2. **API 过滤** - 前端只查询 `publish_status = 'published'` 的内容
3. **静态生成** - 修改 `static-builder.mjs` 过滤非发布状态

### 未来增强
1. **权限控制**
   - 普通编辑：创建草稿、提交审核
   - 审核员：审核内容、批准发布
   - 管理员：直接发布、修改任何状态

2. **工作流通知**
   - 提交审核时通知审核员
   - 审核完成时通知作者

3. **批量操作**
   - 批量修改状态
   - 状态变更日志记录

4. **全文搜索重建**
   - 基于新的多语言表结构重新设计 FTS
   - 支持多语言内容搜索

---

## 七、文件变更清单

### 修改的文件
- ✅ `system/admin/src/types/index.ts` - TypeScript 类型定义

### 新增的文档
- ✅ `docs/publish-status-enhancement.md` - 发布状态功能文档
- ✅ `docs/news-multilang-migration.md` - 本报告

### 数据库变更
- ✅ 删除旧表: `news`, `products`, `news_fts`, `products_fts`
- ✅ 删除 FTS 辅助表和触发器
- ✅ 保留新表: `content_news`, `content_news_translations`

---

## 八、兼容性说明

### 已有数据
- ✅ 所有现有数据的 `publish_status` 都是 `'published'`
- ✅ 无需数据迁移
- ✅ 默认值保证新记录为 `'published'`

### 向后兼容
- ✅ 旧代码不查询 `publish_status` 仍能正常工作
- ⚠️ 建议在前端查询时增加 `WHERE publish_status = 'published'` 过滤

---

## 九、测试建议

### TypeScript 编译
```bash
npm run build:admin  # ✅ 已通过
```

### 数据库查询测试
```sql
-- 插入测试数据
INSERT INTO content_news_translations (entry_id, language_id, name, publish_status)
VALUES (1, 1, 'Test News', 'pending_review');

-- 验证查询
SELECT id, name, publish_status FROM content_news_translations 
WHERE publish_status = 'pending_review';
```

### API 测试
```bash
# 启动服务器
npm start

# 测试产品 API
curl http://localhost:3000/api/products

# 测试新闻 API
curl http://localhost:3000/api/news
```

---

## 总结

✅ **News 多语言架构** - 已完成，与 Product 架构一致  
✅ **旧表清理** - 已删除所有旧表和 FTS 索引  
✅ **publish_status 增强** - 支持三种状态（draft, pending_review, published）  
✅ **TypeScript 类型** - 已更新并编译通过  
✅ **数据兼容性** - 已有数据保持 `'published'` 状态，无需迁移  

**当前状态**: 数据库架构和类型定义已就绪，可以开始实现管理界面的状态选择功能。
