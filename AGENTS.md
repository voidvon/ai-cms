# Repository Guidelines

## 项目结构与模块组织
该仓库是一个以静态 HTML 为主、辅以 Classic ASP 的企业站。根目录下的 `index.html`、`contact.html`、`msg.html` 等为前台入口；`product/`、`products/`、`news/`、`service/`、`valve/` 存放已生成的内容页。`templets/blue/` 与 `templets/blue11/` 是页面模板源，`conn/conn.asp` 负责数据库连接，`inc/` 放通用 ASP 组件，`manage/makehtml/` 用于后台批量生成静态页，`wap/` 是移动端页面，`images/`、`css/`、`js/` 为静态资源。

## 构建、测试与开发命令
仓库内未发现 `npm`、`make` 或自动化测试配置，日常开发以 IIS 本地预览和后台生成静态页为主。

- 本地排查文件：`rg --files templets inc conn manage`
- 跟踪模板或数据依赖：`rg -n "data_path|conn.open|#BM_|#hope_" templets inc conn`
- 内容更新后，在 IIS 中访问 `manage/makehtml/index.asp` 执行静态页重建

提交前至少手工检查 `index.html`、`search.asp`、`wap/index.htm` 以及受影响的详情页。

## 编码风格与命名约定
保持现有 Classic ASP/HTML 风格，不混用新的框架约定。ASP 逻辑优先复用 `<!--#include file="..."-->`；模板占位符继续使用 `#BM_*#`、`#hope_*#` 形式。目录与文件名以小写为主，详情页沿用现有数字或 `分类/ID.html` 规则。编辑遗留页面时尽量保持 `gb2312` 编码、原有缩进和换行，避免顺手全量格式化。

## 测试指南
当前无单元测试框架，采用人工回归。重点验证搜索、表单提交、分页、移动端样式、静态资源路径和后台生成后的链接是否正常。若修改 `conn/`、`inc/` 或 `manage/makehtml/`，需额外检查数据库连接、上传功能和静态页生成结果。

## 提交与合并请求
当前工作区未包含可读 Git 历史，因此无法从仓库内总结既有提交规范。建议后续统一使用简短祈使句，例如：`fix search pagination`、`update blue template banner`。PR 应说明影响目录、手工验证页面、是否需要后台重新生成 HTML；涉及界面变更时附前后截图，涉及配置变更时注明 IIS 或数据库调整点。

## 安全与配置提示
不要提交真实数据库、账号或生产环境路径。`conn/conn.asp` 和 `.user.ini` 包含环境相关配置，改动前先确认部署目录。避免直接修改已生成的大批量 HTML，优先改模板或生成脚本，再统一重建。
