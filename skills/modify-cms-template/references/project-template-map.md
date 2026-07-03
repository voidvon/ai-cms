# 项目模板修改参考

## 关键模板

- `templates.id=1`：`Spirax 公共壳层`，全局壳层、footer、全局 CTA 覆盖样式。
- `templates.id=2`：`Spirax 首页模板`，首页 hero 与首页区块。
- `templates.id=14`：`按钮组件`，`.sg-ui-button`、`.sg-ui-button--sm/md/lg` 等共享按钮样式。
- `templates.id=30`：`Spirax 站点导航组件`，导航、菜单、导航按钮相关结构。

查询：

```bash
sqlite3 data/site.sqlite "select id,name,type,engine,length(css_source),length(published_css_source) from templates where id in (1,2,14,30);"
sqlite3 data/site.sqlite "select id,template_id,version_no,note,created_at from template_versions where template_id in (1,2,14,30) order by id desc limit 12;"
```

## 首页 hero 联系按钮案例

需求：不同语言首页 hero 统一显示“联系我们 / Contact us / 本地化文案”的联系按钮。

实现要点：

- 修改数据库首页模板 `templates.id=2`，不是改源码文件或 `html/index.html`。
- 让 hero 总是渲染一个联系按钮。
- 文案优先级：
  `site.template_data.ui.nav.contactLabel` -> `ui.text.contactUs` -> `联系我们`。
- 链接优先级：
  `site.template_data.ui.nav.contactHref` -> `/contact-us/`。
- 改完新增 `template_versions`，例如：
  `统一首页 hero 联系按钮并使用本地化文案`。

验证可抽查：

```bash
npm --prefix system/server run build:static -- --language en --json
rg -n "Contact us|/contact-us/" html/index.html
```

## 通用按钮高度案例

需求：通用按钮高度改为 `40px`。

实现要点：

- 先改 `templates.id=14` 按钮组件：
  `.sg-ui-button--sm`、`.sg-ui-button--md`、`.sg-ui-button--lg` 统一设置：

```css
height: 40px;
min-height: 40px;
```

- 再检查 `templates.id=1` 公共壳层是否存在覆盖规则，例如：
  `.sg-primary-cta__button.sg-ui-button`。
- 如果覆盖原来是 `min-height: 42px`，同步改为：

```css
height: 40px;
min-height: 40px;
```

- 同步更新 `css_source` 与 `published_css_source`，并给两个模板新增版本记录。

验证：

```bash
sqlite3 data/site.sqlite "select id,name,instr(css_source,'min-height: 38px'),instr(css_source,'min-height: 46px'),instr(css_source,'min-height: 54px'),instr(css_source,'min-height: 42px'),instr(css_source,'height: 40px'),instr(published_css_source,'height: 40px') from templates where id in (1,14);"
npm --prefix system/server run build:static -- --language en --json
rg -n "height:40px|min-height:40px|height: 40px|min-height: 40px" html/index.html html/assets/cms-templates
```

## 静态生成排除非公开模型案例

问题：静态生成因 `price_record` 栏目缺少 `dir_name` 卡住。

正确处理：

- 不要为了通过静态生成给 `price_record` 补公开路径。
- `price_record` 是后台/内部数据模型，不应纳入静态 HTML。
- 应在公开栏目和静态目标收集链路排除，例如服务层 `public-sections.mjs` 提供过滤，`static-builder.mjs` 使用过滤后的栏目集合。

验证：

```bash
npm --prefix system/server run build:static -- --language en --json
rg -n "price-lists|price_record" html sitemap.xml html/llms.txt
```

预期：静态生成成功，且没有 `price_record` 对应静态目标。

## 风险检查

- 不要读取或写入旧字段 `content`、`published_content`。
- 不要恢复 `html`、`svelte` 或其它模板引擎。
- 不要直接补丁式修改 `html/`。
- 不要绕开栏目路径服务处理 URL。
- 不要把内部模型伪装成公开栏目来解决生成错误。
- 修改模板后，至少抽查首页和一个受影响组件样式。
