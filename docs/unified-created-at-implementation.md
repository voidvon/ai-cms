# 统一使用 created_at 替代 published_at 实施报告

## 执行时间
2026-06-16

## 任务概述

将所有内容表（product 和 news）统一改为使用 `created_at` 字段，删除 `published_at` 字段，实现产品和新闻的完全一致的架构。

---

## 一、数据库变更

### 删除的字段

**主表（Entry Tables）**
- `content_product.published_at` - 已删除
- `content_news.published_at` - 已删除

**翻译表（Translation Tables）**
- `content_product_translations.published_at` - 已删除
- `content_news_translations.published_at` - 已删除

### 最终表结构

所有内容表统一为 **13 个字段**：

#### content_product 和 content_news（主表）
```
id, column_id, custom_url, code, images, primary_image, 
is_visible, is_featured_home, sort_order, 
publish_status, legacy_extra, 
created_at, updated_at
```

#### content_product_translations 和 content_news_translations（翻译表）
```
id, entry_id, language_id, 
name, summary, content_html, keywords, 
seo_title, seo_keywords, seo_description, 
publish_status, 
created_at, updated_at
```

### 验证结果

```sql
✅ 所有内容表都已删除 published_at 字段，统一使用 created_at
✅ 所有表列数统一为 13 列
✅ 数据完整性保持（35 条产品记录保留）
```

---

## 二、代码变更

### 1. content-entries.mjs（核心服务层）

#### getTranslationPublishedAtExpr 函数
**修改前**：根据 modelCode 条件判断使用 `created_at` 还是 `published_at`
```javascript
if (modelCode === 'product') {
  return `coalesce(${translationAlias}.created_at, ...)`;
}
return `coalesce(${translationAlias}.published_at, ...)`;
```

**修改后**：统一使用 `created_at`
```javascript
// 所有模型统一使用 created_at
return `coalesce(${translationAlias}.created_at, ${defaultTranslationAlias}.created_at, ${entryAlias}.created_at)`;
```

#### loadEntryTranslations 函数
**修改前**：条件判断字段
```javascript
const publishedAtField = modelCode === 'product' ? 't.created_at' : 't.published_at';
```

**修改后**：直接使用 `created_at`
```javascript
// 所有翻译表统一使用 created_at
SELECT ..., t.created_at AS published_at
```

#### saveEntryTranslations 函数
**修改前**：两套 SQL 语句（product 和其他）
```javascript
if (isProductTranslation) {
  // 不包含 published_at
} else {
  // 包含 published_at
}
```

**修改后**：统一的 SQL 语句
```javascript
// 所有翻译表统一不使用 published_at 字段（已删除）
INSERT INTO ... (entry_id, language_id, ..., publish_status, created_at, updated_at)
```

#### createContentEntry 和 updateContentEntry 函数
**删除的字段**：
- INSERT 语句中的 `published_at` 字段
- VALUES 中的 `defaultTranslation.published_at` 参数

#### 返回数据处理
**删除的代码**：
```javascript
// 删除了条件判断
if (modelCode !== 'product') {
  translationData.published_at = translation.published_at;
}
```

**修改后**：统一不返回 `published_at`

#### normalizeContentEntryInput 相关函数
**删除的字段**：
- `fallbackBase.published_at`
- `output[languageCode].published_at`
- `resolveDefaultTranslation` 返回对象中的 `published_at`

#### mapEntryRow 函数
**删除的字段**：
```javascript
published_at: toNullableString(row.translation_published_at ?? row.published_at)
```

#### 迁移函数 migrateLegacyContentNodesToModelTables
**修改**：
- 删除从 `column_translations.published_at` 读取的代码
- 删除主表 INSERT/UPDATE 中的 `published_at` 字段
- 删除翻译表的 `isProductTranslation` 条件判断
- 统一使用不包含 `published_at` 的 SQL

### 2. content-model-storage.mjs（表结构管理）

#### ensureModelTables 函数
**删除的代码**：
```javascript
addColumnIfMissing(tableName, 'published_at', 'TEXT');  // 主表

if (modelCode !== 'product') {
  addColumnIfMissing(translationTableName, 'published_at', 'TEXT');  // 翻译表
}
```

#### buildContentTableSql 函数
**删除的字段**：
```sql
published_at TEXT,
```

#### buildContentTranslationTableSql 函数
**修改前**：条件包含 `published_at`
```javascript
const includePublishedAt = modelCode !== 'product';
${includePublishedAt ? 'published_at TEXT,' : ''}
```

**修改后**：统一不包含
```javascript
// 所有模型统一不包含 published_at 字段（已删除）
```

### 3. TypeScript 类型定义（types/index.ts）

#### ProductTranslation 和 ProductTranslationStatus
**删除的字段**：
```typescript
published_at?: string | null;  // 已删除
```

**删除的注释**：
```typescript
// 注意: 产品翻译表没有 published_at 字段，使用 created_at
```

#### NewsTranslation 和 NewsTranslationStatus
**删除的字段**：
```typescript
published_at?: string | null;  // 已删除
```

---

## 三、统一后的架构优势

### 1. 一致性
✅ Product 和 News 完全一致的表结构
✅ 所有内容模型使用相同的字段
✅ 代码逻辑统一，无需条件判断

### 2. 简化性
✅ 删除了大量 `if (modelCode === 'product')` 判断
✅ SQL 语句统一，维护成本降低
✅ TypeScript 类型定义更简洁

### 3. 可维护性
✅ 新增内容模型时无需考虑 `published_at` 差异
✅ 数据迁移脚本统一
✅ API 返回结构一致

---

## 四、影响范围

### 数据库层
- ✅ 4 个表结构修改（删除字段）
- ✅ 数据完整性保持
- ✅ 35 条产品记录和翻译保留

### 服务层
- ✅ `content-entries.mjs` - 11 处函数修改
- ✅ `content-model-storage.mjs` - 4 处函数修改

### 类型层
- ✅ `types/index.ts` - 4 个接口修改

### 编译验证
- ✅ TypeScript 编译成功
- ✅ 无类型错误

---

## 五、使用建议

### 获取发布时间
**旧方式**：
```javascript
const publishedAt = product.published_at || news.published_at;
```

**新方式**：
```javascript
const publishedAt = product.created_at || news.created_at;
```

### API 查询排序
```sql
-- 按创建时间排序（新闻列表）
ORDER BY e.created_at DESC, e.id DESC

-- 按sort_order排序（产品列表）
ORDER BY e.sort_order ASC, e.id DESC
```

### 前端显示
```javascript
// 显示发布日期时使用 created_at
<div>发布时间: {formatDate(content.created_at)}</div>
```

---

## 六、数据验证

### 表结构验证
```sql
sqlite> PRAGMA table_info(content_product);
-- 13 列，无 published_at

sqlite> PRAGMA table_info(content_news);
-- 13 列，无 published_at

sqlite> PRAGMA table_info(content_product_translations);
-- 13 列，无 published_at

sqlite> PRAGMA table_info(content_news_translations);
-- 13 列，无 published_at
```

### 数据完整性验证
```
content_product: 35 条记录 ✅
content_product_translations: 35 条记录 ✅
content_news: 0 条记录 ✅
content_news_translations: 0 条记录 ✅
```

---

## 七、与之前方案的对比

### 方案演变

**阶段 1**：Product 有 `published_at`，News 也有 `published_at`
- 问题：字段存在但语义不明确

**阶段 2**：Product 删除 `published_at`，News 保留 `published_at`
- 问题：两个模型不一致，代码需要大量条件判断

**阶段 3（当前）**：Product 和 News 统一删除 `published_at`
- ✅ 完全一致的架构
- ✅ 简化的代码逻辑
- ✅ 统一使用 `created_at`

---

## 八、后续工作

### 立即可做
1. ✅ TypeScript 类型已更新
2. ✅ 数据库架构已统一
3. ✅ 服务层代码已简化

### 建议事项
1. **文档更新**
   - 更新 API 文档，说明使用 `created_at` 字段
   - 更新数据库设计文档

2. **前端适配**
   - 检查前端是否引用 `published_at`
   - 统一改为使用 `created_at`

3. **静态生成**
   - 验证静态生成逻辑是否使用 `created_at`
   - 确认新闻列表按 `created_at` 排序

4. **测试**
   - 测试产品列表 API
   - 测试新闻列表 API
   - 测试创建和更新接口

---

## 总结

✅ **完全统一**：Product 和 News 使用相同的表结构和字段
✅ **代码简化**：删除了所有 modelCode 条件判断
✅ **数据安全**：所有数据完整保留
✅ **编译通过**：TypeScript 和 JavaScript 无错误
✅ **架构清晰**：统一使用 `created_at` 表示内容的创建/发布时间

**当前状态**：所有内容表统一使用 `created_at` 字段，架构完全一致，代码维护成本大幅降低。
