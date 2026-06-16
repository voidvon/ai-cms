# 发布状态（publish_status）功能增强

## 更新时间

2026-06-16

## 变更概述

将 `publish_status` 字段从两种状态扩展为三种状态，以支持内容审核流程。

## 状态定义

| 状态值 | 中文含义 | 说明 | 使用场景 |
|--------|---------|------|---------|
| `draft` | 草稿/未发布 | 内容正在编辑中 | 作者编辑、保存草稿 |
| `pending_review` | 审核中 | 内容已提交，等待审核 | 提交审核后、审核完成前 |
| `published` | 已发布 | 内容已审核通过并发布 | 审核通过后、对外显示 |

## 数据存储

### 字段类型：字符串（TEXT）

选择字符串而非整数的原因：
- ✅ **可读性强** - 数据库中直接看到状态含义
- ✅ **自解释性** - 不需要维护数字映射表
- ✅ **易于调试** - 日志直接显示状态名称
- ✅ **扩展性好** - 未来增加状态不需要重新分配数字
- ✅ **类型安全** - TypeScript 可以精确约束值

### 表结构

#### content_product（产品主表）
```sql
publish_status TEXT NOT NULL DEFAULT 'published'
```

#### content_product_translations（产品翻译表）
```sql
publish_status TEXT NOT NULL DEFAULT 'published'
-- 注意：产品翻译表没有 published_at 字段，使用 created_at
```

#### content_news（新闻主表）
```sql
publish_status TEXT NOT NULL DEFAULT 'published',
published_at TEXT
```

#### content_news_translations（新闻翻译表）
```sql
publish_status TEXT NOT NULL DEFAULT 'published',
published_at TEXT
-- 注意：新闻翻译表有 published_at 字段
```

## TypeScript 类型定义

### 统一类型（system/admin/src/types/index.ts）

```typescript
// 发布状态枚举类型
export type PublishStatus = 'draft' | 'pending_review' | 'published';

export interface ProductTranslation {
  name: string;
  summary?: string;
  content_html?: string;
  keywords?: string;
  seo_title?: string;
  seo_keywords?: string;
  seo_description?: string;
  publish_status: PublishStatus;
  // 注意: 产品翻译表没有 published_at 字段，使用 created_at
}

export interface ProductTranslationStatus {
  language_code: string;
  publish_status: PublishStatus;
  // 注意: 产品翻译表没有 published_at 字段
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
  publish_status: PublishStatus;
  published_at?: string | null;
}

export interface NewsTranslationStatus {
  language_code: string;
  publish_status: PublishStatus;
  published_at?: string | null;
  has_content: boolean;
}
```

## 关键差异：产品 vs 新闻

| 特性 | 产品（Product） | 新闻（News） |
|-----|----------------|-------------|
| 翻译表 `published_at` | ❌ 无（使用 `created_at`） | ✅ 有 |
| 主表 `published_at` | ❌ 无 | ✅ 有 |
| 原因 | 产品上线时间不重要 | 新闻发布时间很重要 |

## 状态流转

### 典型工作流

```
草稿 (draft)
    ↓ 作者提交审核
审核中 (pending_review)
    ↓ 审核通过
已发布 (published)
```

### 可能的回退

```
已发布 (published)
    ↓ 发现问题，撤回修改
草稿 (draft)
    ↓ 重新提交
审核中 (pending_review)
```

## 数据库查询示例

### 查询草稿内容
```sql
SELECT * FROM content_product_translations 
WHERE publish_status = 'draft';
```

### 查询待审核内容
```sql
SELECT * FROM content_news_translations 
WHERE publish_status = 'pending_review';
```

### 查询已发布内容（前端）
```sql
SELECT * FROM content_product_translations 
WHERE publish_status = 'published';
```

## API 行为建议

### 前端展示规则
- 只显示 `publish_status = 'published'` 的内容
- `draft` 和 `pending_review` 状态的内容不对外显示

### 管理后台规则
- 显示所有状态的内容
- 提供状态筛选器：全部、草稿、审核中、已发布
- 支持批量修改状态

### 权限控制（未来）
- 普通编辑：可创建草稿、提交审核
- 审核员：可审核内容、批准发布
- 管理员：可直接发布、修改任何状态

## 待实现功能

1. **管理界面**
   - [ ] 状态选择下拉框（三个选项）
   - [ ] 状态筛选器
   - [ ] 批量修改状态
   - [ ] 状态变更日志

2. **API 端点**
   - [ ] 支持 `?status=draft` 查询参数
   - [ ] 状态变更 API：`PUT /api/products/:id/status`
   - [ ] 批量修改状态：`PATCH /api/products/bulk-status`

3. **通知功能**
   - [ ] 提交审核时通知审核员
   - [ ] 审核通过/拒绝时通知作者

4. **静态生成**
   - [ ] 只生成 `publish_status = 'published'` 的内容
   - [ ] 修改 `static-builder.mjs` 增加状态过滤

## 兼容性

### 已有数据
- 默认值为 `'published'`
- 所有已导入的产品和新闻都是 `'published'` 状态
- 无需数据迁移

### 向后兼容
- 旧代码不查询 `publish_status` 仍能正常工作
- 建议在查询时增加状态过滤以符合预期行为

## 测试建议

1. **TypeScript 编译**
   ```bash
   npm run build:admin
   ```

2. **数据库查询**
   ```sql
   -- 插入测试数据
   INSERT INTO content_product_translations (entry_id, language_id, name, publish_status)
   VALUES (999, 1, 'Test Product', 'pending_review');
   
   -- 验证查询
   SELECT id, name, publish_status FROM content_product_translations WHERE id = last_insert_rowid();
   ```

3. **API 测试**
   ```bash
   # 创建草稿产品
   curl -X POST http://localhost:3000/api/products \
     -H "Content-Type: application/json" \
     -d '{"name": "Draft Product", "publish_status": "draft"}'
   
   # 修改为审核中
   curl -X PUT http://localhost:3000/api/products/123 \
     -H "Content-Type: application/json" \
     -d '{"publish_status": "pending_review"}'
   ```

## 参考文档

- 产品翻译表去除 `published_at` 字段: `docs/product-published-at-removal.md`（如果存在）
- 内容模型架构: `CLAUDE.md`
- TypeScript 类型定义: `system/admin/src/types/index.ts`
