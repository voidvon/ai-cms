# Footer 受管栏目显示修复

## 问题描述

Footer 的"产品展示" section 原本只显示 8 个产品分类链接，但原版网站显示 11 个。

## 根本原因

经过深入调试发现：
1. ✅ 数据层（`buildLegacySiteColumns`）正确生成 11 个产品分类
2. ✅ `footerProductCategories` 参数正确传递 11 个分类数据
3. ❌ **JSX 模板渲染引擎在渲染时将数组截断为 8 个元素**

这可能是 JSX-to-HTML 渲染引擎的一个 bug 或限制。

## 解决方案

这是一份历史排查记录。当前不再采用“直接补丁 `html/index.html`”的方式修复，因为这违背当前静态生成链路约束。

### 实现细节

1. **当前做法**：
   - 通过模板和静态构建链路修复数据准备问题
   - 不再保留直接修改生成产物的补丁脚本

2. **数据准备**（保留，用于模板修复）：
   - `buildLegacySiteColumns` 中对 `product_root` 类型栏目特殊处理
   - 用真实的产品分类数据替换其 children
   - 排除 `id=0` 的根分类，确保只取真实的产品分类

## 添加的 3 个产品分类

9. [关断阀](/products/isolation-valves/)
10. [蒸汽系统管道附件 | 止回阀、过滤器、汽水分离器](/products/pipeline-ancillaries/)
11. [蒸汽疏水阀](/products/steam-traps/)

## 使用方法

### 自动构建（推荐）
```bash
npm --prefix system/server run build:static
```

## 未来改进

如果模板或静态构建逻辑仍有异常，继续沿当前模板渲染链路修复：

1. 在 `renderFooterLinks` 函数中使用 `footerProductCategories` 参数
2. 或者确保 `siteColumns` 中"产品展示"栏目的 children 数组完整传递

## 相关文件

- `system/server/src/static-builder.mjs` - 数据准备逻辑
- 模板：数据库中的 `Spirax 公共壳层` 和 `Spirax 首页模板`
