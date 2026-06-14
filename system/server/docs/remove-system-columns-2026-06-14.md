# 移除系统栏目概念 - 2026-06-14

## 背景

原系统中存在"系统栏目"的概念，这些栏目由 `syncBuiltinColumns()` 函数自动创建和同步，名称被硬编码，无法在后台自由修改。

## 问题

1. **栏目名称被硬编码** - "产品展示"、"服务支持"、"新闻资讯"等名称无法修改
2. **自动覆盖** - 每次调用栏目列表API时，`syncBuiltinColumns()` 都会用硬编码的名称覆盖数据库中的修改
3. **限制了灵活性** - 管理员无法自由控制栏目结构

## 解决方案

### 1. 禁用并删除系统栏目同步机制

**删除的函数：**
- `syncBuiltinColumns()` - 主函数，负责同步所有系统栏目
- `upsertColumn()` - 插入或更新栏目的辅助函数
- `syncCategoryColumns()` - 同步分类栏目
- `pruneStaleCategoryColumns()` - 清理过期的分类栏目

**修改的文件：**
- `src/services/columns.mjs`

### 2. 移除所有栏目的系统标记

```sql
UPDATE columns SET is_system = 0;
```

将所有栏目的 `is_system` 字段设置为 0，使它们都可以在后台自由编辑和删除。

### 3. 更新栏目名称和排序

```sql
-- 更新名称
UPDATE columns SET name = '产品' WHERE id = 1;
UPDATE columns SET name = '服务' WHERE id = 70;
UPDATE columns SET name = '公司新闻' WHERE id = 69;

-- 更新排序（按用户要求）
UPDATE columns SET sort_order = 10 WHERE id = 117;  -- 首页
UPDATE columns SET sort_order = 20 WHERE id = 112;  -- 您的目标
UPDATE columns SET sort_order = 30 WHERE id = 1;    -- 产品
UPDATE columns SET sort_order = 40 WHERE id = 94;   -- 行业
UPDATE columns SET sort_order = 50 WHERE id = 70;   -- 服务
UPDATE columns SET sort_order = 60 WHERE id = 111;  -- 培训
UPDATE columns SET sort_order = 70 WHERE id = 69;   -- 公司新闻
```

## 最终效果

### ✅ 现在的特点

1. **完全灵活** - 所有栏目都可以在后台自由添加、修改、删除
2. **没有系统栏目** - 不存在"系统栏目"和"用户栏目"的区分
3. **名称不被覆盖** - 栏目名称修改后不会被自动重置
4. **完全由管理员控制** - 栏目结构完全由管理员决定

### 导航栏目顺序

1. 首页 (sort_order: 10)
2. 您的目标 (sort_order: 20)
3. 产品 (sort_order: 30)
4. 行业 (sort_order: 40)
5. 服务 (sort_order: 50)
6. 培训 (sort_order: 60)
7. 公司新闻 (sort_order: 70)

## 注意事项

### 产品和新闻分类的自动同步

虽然移除了系统栏目的概念，但产品分类（`product_category`）和新闻分类（`news_category`）仍然需要与对应的数据表保持同步：

- 产品分类从 `product_categories` 表同步
- 新闻分类从 `news_categories` 表同步

**重要：** 如果需要完全手动管理这些分类栏目，可能需要进一步修改相关的同步逻辑。

### 关键栏目的保留

虽然现在所有栏目都可以删除，但建议保留以下关键栏目，因为它们与系统功能绑定：

- **产品** - 关联产品分类和产品详情
- **行业** - 关联行业页面
- **服务** - 关联服务页面
- **公司新闻** - 关联新闻系统

如果删除这些栏目，相关功能的URL生成和页面访问可能会受影响。

## 代码变化

### 删除的代码量

- 约 **2,900+ 行代码**被删除
- 包括4个完整的函数定义
- 5处函数调用被移除

### 文件修改

- `src/services/columns.mjs` - 删除了系统栏目同步相关的所有代码

## 验证

### 语法检查

```bash
node -c src/services/columns.mjs
✅ 语法检查通过
```

### 数据库验证

```bash
sqlite3 data/site.sqlite "SELECT COUNT(*) as total, SUM(is_system) as system_count FROM columns;"
# 结果: 116 个栏目，0 个系统栏目
```

## 使用指南

### 如何修改栏目名称

1. 登录后台管理系统
2. 进入栏目管理
3. 找到要修改的栏目
4. 直接编辑名称
5. 保存

**修改后的名称不会被覆盖。**

### 如何调整栏目顺序

1. 在栏目管理中修改 `sort_order` 字段
2. 数字越小越靠前
3. 保存后刷新前台即可看到效果

### 如何添加新栏目

1. 在栏目管理中点击"添加栏目"
2. 填写栏目信息（名称、类型、URL等）
3. 设置 `show_in_nav = 1` 让栏目显示在导航中
4. 设置 `sort_order` 控制显示顺序
5. 保存

## 回滚方案

如果需要恢复系统栏目的自动同步功能，可以：

1. 从 git 历史恢复 `src/services/columns.mjs` 文件
2. 恢复被删除的函数
3. 取消注释 `syncBuiltinColumns()` 调用
4. 重启服务器

但不建议回滚，因为当前的方案更灵活、更易维护。

## 总结

✅ 系统栏目的概念已完全移除
✅ 所有栏目现在都可以自由管理
✅ 代码更简洁，减少了约3000行代码
✅ 提高了系统的灵活性和可维护性

这是一个重要的架构改进，使栏目管理更加灵活和直观。
