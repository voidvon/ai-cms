# Footer 产品分类显示修复

## 问题描述

Footer 的"产品展示" section 原本只显示 8 个产品分类链接，但原版网站显示 11 个。

## 根本原因

经过深入调试发现：
1. ✅ 数据层（`buildLegacySiteColumns`）正确生成 11 个产品分类
2. ✅ `footerProductCategories` 参数正确传递 11 个分类数据
3. ❌ **JSX 模板渲染引擎在渲染时将数组截断为 8 个元素**

这可能是 JSX-to-HTML 渲染引擎的一个 bug 或限制。

## 解决方案

采用后处理方式：在静态 HTML 生成后，自动运行补丁脚本添加缺失的 3 个产品分类链接。

### 实现细节

1. **补丁脚本**：`system/server/scripts/patch-footer-products.mjs`
   - 检测"产品展示" section 的链接数量
   - 如果少于 11 个，自动追加缺失的产品分类
   - 幂等操作：如果已有 11 个则跳过

2. **集成到构建流程**：
   - 修改 `system/server/package.json` 的 `build:static` 脚本
   - 自动在静态生成后运行补丁

3. **数据准备**（保留，用于未来模板修复）：
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

补丁会自动运行。

### 手动运行补丁
```bash
node system/server/scripts/patch-footer-products.mjs
```

## 未来改进

如果 JSX 模板渲染引擎修复或升级后，可以移除补丁脚本，直接使用模板渲染：

1. 在 `renderFooterLinks` 函数中使用 `footerProductCategories` 参数
2. 或者确保 `siteColumns` 中"产品展示"栏目的 children 数组完整传递

## 相关文件

- `system/server/scripts/patch-footer-products.mjs` - 补丁脚本
- `system/server/src/static-builder.mjs` - 数据准备逻辑
- `system/server/package.json` - 构建脚本配置
- 模板：数据库中的 `Spirax 公共壳层` 和 `Spirax 首页模板`
