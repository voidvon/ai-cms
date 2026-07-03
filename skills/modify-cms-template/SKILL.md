---
name: modify-cms-template
description: Modify this project's database-backed CMS theme templates and related static-build behavior. Use when Codex needs to change homepage hero templates, shared theme components, button styles, localized template text, template_versions records, TSX/CSS template source in data/site.sqlite, or verify static output without hand-editing html/.
---

# 修改 CMS 模板

## 核心原则

本项目模板真源在数据库，不在源码模板目录，也不在生成后的 `html/`。修改主题、首页 hero、按钮、导航、组件样式时，优先操作 `data/site.sqlite` 内的 `templates`、`template_versions`，并保持 `tsx_source/css_source` 与 `published_tsx_source/published_css_source` 的语义一致。

禁止为模板修改新增第二套渲染、路径或静态发布逻辑。数据库 TSX 模板必须继续复用现有运行时：`system/server/src/cms-template-runtime.mjs`、`system/server/src/tsx-template-renderer.mjs`、`system/server/src/static-builder.mjs`。

## 执行流程

1. 先判断改动链路：`模板`、`静态生成`、`栏目路径`、`内容模型`、`后台管理`。模板文案和样式默认属于 `模板`；生成卡住、栏目纳入错误默认属于 `静态生成` 或 `栏目路径`。

2. 先查数据库真源：

```bash
sqlite3 data/site.sqlite ".schema templates"
sqlite3 data/site.sqlite ".schema template_versions"
sqlite3 data/site.sqlite "select id,name,type,engine,length(tsx_source),length(css_source),length(published_tsx_source),length(published_css_source) from templates order by id;"
```

3. 定位目标模板后，同时检查草稿和已发布槽位。只读写这些字段：
`tsx_source`、`css_source`、`published_tsx_source`、`published_css_source`。

4. 修改模板时同步更新 `templates.updated_at`，并新增一条 `template_versions`。版本号使用当前模板最大 `version_no + 1`，`engine` 必须保持 `tsx`。

5. 涉及多语言文案时，不要写死单一语言。优先使用站点配置或模板数据里的本地化字段；没有配置时才给出合理 fallback。首页 hero 联系按钮的经验规则是：优先取 `site.template_data.ui.nav.contactLabel`，再取 `ui.text.contactUs`，最后 fallback 到 `联系我们`。

6. 涉及按钮样式时，优先改共享按钮组件模板；若公共壳层或具体组件有覆盖规则，也要同步检查，避免局部覆盖抵消共享样式。

7. 涉及静态生成目标时，内部模型、后台模型、非公开数据模型不能纳入静态 HTML 目标。类似 `price_record` 这类模型应在公开栏目/静态目标收集层排除，而不是补路径字段让它生成。

8. 完成后运行静态生成验证，并抽查生成结果；不要直接手改 `html/`：

```bash
npm --prefix system/server run build:static -- --language en --json
rg -n "Contact us|联系我们|height: 40px|min-height: 40px" html/index.html html/assets/cms-templates
```

## 常用数据库写法

使用事务包裹模板更新和版本记录：

```sql
BEGIN;
UPDATE templates
SET css_source = replace(css_source, 'old', 'new'),
    published_css_source = replace(published_css_source, 'old', 'new'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 14;

INSERT INTO template_versions (template_id, version_no, engine, tsx_source, css_source, note, created_at)
SELECT id,
       coalesce((select max(version_no) from template_versions where template_id = templates.id), 0) + 1,
       engine,
       tsx_source,
       css_source,
       '说明本次模板修改',
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM templates
WHERE id = 14;
COMMIT;
```

## 项目参考

需要本项目具体模板 ID、按钮/hero 案例、静态生成排除规则时，读取 `references/project-template-map.md`。
