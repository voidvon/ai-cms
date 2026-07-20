# 本地 GitHub Release 发布说明

本项目当前通过本地命令构建 `dist/`、自动递增版本号，并使用 GitHub CLI 将压缩包上传到 GitHub Release。原工作流已改名为 `.github/workflows/release.yml.disabled`，GitHub 不会加载它；以后恢复 `.yml` 扩展名即可重新启用。

## 首次准备

安装并登录 GitHub CLI：

```bash
gh auth login
gh auth status
```

本机还需要 Node.js 24、npm、Git、`tar` 和 `zip`。发布者必须拥有当前 GitHub 仓库的 Release 写入权限。

## 正式发布

先确保需要发布的代码已经提交并推送到 `origin/main`，然后在项目根目录执行：

```bash
npm run release
```

脚本会依次执行：

1. 确认当前分支是 `main` 且工作区干净。
2. 拉取 `origin/main` 和远端标签。
3. 确认本地 `main` 与 `origin/main` 完全一致。
4. 检查 GitHub CLI 登录状态。
5. 计算下一版本，并确认上个 Release 后存在新提交。
6. 运行 `npm test`。
7. 运行 `npm run build:dist` 并写入版本元数据。
8. 检查发布包中不存在数据库、备份和环境文件。
9. 生成 ZIP、TAR.GZ 和 SHA256 校验文件。
10. 创建 Git 标签和 GitHub Release，并上传附件。

任一检查、测试或构建失败都会停止发布。

## 只在本地准备发布包

如果只想测试发布链路、查看压缩包，而不创建标签或 GitHub Release：

```bash
npm run release:prepare
```

该命令允许工作区存在未提交修改，产物写入被 Git 忽略的 `release-assets/`：

```text
release-assets/
├── spiraxsarcocn-v0.1.1.tar.gz
├── spiraxsarcocn-v0.1.1.zip
└── spiraxsarcocn-v0.1.1-SHA256SUMS.txt
```

## 版本规则

版本格式固定为 `X.Y.Z`，每一位取值范围都是 `0` 到 `99`。

- `0.1.0` 的下一版本是 `0.1.1`
- `0.1.99` 的下一版本是 `0.2.0`
- `0.99.99` 的下一版本是 `1.0.0`
- `99.99.99` 已达到上限，发布会停止并报错

仓库没有版本标签时，以根目录 `.release-version` 的 `0.1.0` 为基准，因此首次自动发布为 `v0.1.1`。首次发布后，符合 `vX.Y.Z` 格式的最高 Git 标签是版本真源；不要为普通发布手工修改 `.release-version`。

## GitHub 发布附件与部署边界

压缩包中包含 `RELEASE.json`，可用于确认版本、源提交和构建时间。发布包沿用现有 `npm run build:dist` 规则：

- 不包含 `data/site.sqlite`
- 不包含 `.env` 和数据库备份
- `html/` 只包含运行目录占位内容，不包含本地生成的正式站点

部署时应保留服务器已有数据库；需要生成正式前台内容时，在目标环境执行：

```bash
npm install
npm run build:site
```
