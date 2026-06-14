# 图片系统更新总结（2026-06-14）

## ✅ 完成的工作

### 1. 图片上传路径重构

**之前：** 上传到 `public/upload/{products|news|richtext}/`

**现在：** 上传到 `html/uploads/images/{products|news|richtext}/`

**原因：**
- 将用户上传的文件与静态资源分离
- `html/` 是生成目录，更适合存放动态内容
- 与 `.gitignore` 策略一致（`html/` 不提交）

### 2. 从 spirax-global 导入产品图片

**操作：** 
```bash
bash scripts/import-images-from-global.sh
```

**结果：**
- ✅ 导入 548 张图片到 `public/images/global/`
- ✅ 包含 390+ 张产品图片
- ✅ 包含行业、新闻、联系等页面图片

**目录结构：**
```
public/images/global/
├── products/              # 390+ 产品图片
│   ├── boilerhouse/
│   ├── boiler-controls-and-systems/
│   ├── clean-steam/
│   ├── compressed-air/
│   └── ...
├── industries/            # 行业图片
├── news/                  # 新闻图片
├── contact-us/            # 联系页面图片
└── ...
```

### 3. 静态生成保护机制

**验证通过：** ✅ `html/uploads/` 目录在静态生成时被完整保留

**保护机制：**
1. `uploads` 不在 `MANAGED_STATIC_DIRS` 列表中
2. `cleanupHtmlFilesRecursive` 只删除 `.html`, `.htm`, `.md` 文件
3. 图片文件（`.jpg`, `.png`, `.gif`）永远不会被删除

### 4. 文档更新

**新增文档：**
- `docs/images-management.md` - 完整的图片管理指南
- `scripts/import-images-from-global.sh` - 图片导入脚本

**更新文档：**
- `CLAUDE.md` - 更新了图片管理、上传路径、目录结构说明
- `html/.gitignore` - 确保上传的文件不提交到 Git

## 📁 目录结构总览

```
项目根目录/
├── public/
│   ├── images/
│   │   └── global/           # ✅ 从 spirax-global 导入（548 张）
│   │       ├── products/     # 产品官方图片
│   │       ├── industries/   # 行业图片
│   │       └── ...
│   ├── css/
│   ├── js/
│   └── skin/
│
├── html/                     # 生成目录（不提交到 Git）
│   ├── index.html            # ✅ 生成的 HTML（会被清理）
│   ├── products/             # ✅ 生成的产品页面（会被清理）
│   └── uploads/              # ⚠️ 用户上传（永不清理）
│       └── images/
│           ├── products/     # 通过后台上传的产品图片
│           ├── news/         # 通过后台上传的新闻图片
│           └── richtext/     # 富文本编辑器上传的图片
│
├── scripts/
│   └── import-images-from-global.sh  # ✅ 新增脚本
│
└── docs/
    └── images-management.md          # ✅ 新增文档
```

## 🔗 图片访问路径

### 1. 静态产品图片（官方）
- **来源：** spirax-global 项目
- **位置：** `public/images/global/products/`
- **URL：** `/images/global/products/boilerhouse/lp30-cover-4x3.jpg`
- **特点：** 提交到 Git，高质量官方图片

### 2. 用户上传图片（后台管理）
- **来源：** 通过 `/admin/` 后台上传
- **位置：** `html/uploads/images/products/`
- **URL：** `/uploads/images/products/20260614105230_abc123.jpg`
- **特点：** 不提交到 Git，静态生成时保留

## 🛡️ 安全保护

### 静态生成时的行为

**会被删除：**
- ✅ `html/index.html`, `html/contact.html` 等根目录 HTML
- ✅ `html/products/*.html` 等生成的产品页面
- ✅ `html/news/*.html` 等生成的新闻页面
- ✅ `html/sitemap.xml`, `html/robots.txt` 等元数据

**永不删除：**
- ✅ `html/uploads/` 整个目录及其内容
- ✅ 所有图片文件（`.jpg`, `.png`, `.gif`）
- ✅ 用户上传的任何文件

### 验证测试

```bash
# 测试通过 ✅
echo "test" > html/uploads/images/products/test.jpg
npm run build:static
ls html/uploads/images/products/test.jpg  # 文件仍然存在
```

## 📊 统计信息

- **导入的静态图片：** 548 个文件
- **产品图片：** 390+ 个文件
- **产品详情页：** 34 个页面（已验证图片显示正常）
- **测试通过：** ✅ 所有示例产品的图片都存在并可访问

## 🚀 使用方法

### 导入新图片（如果 spirax-global 更新）

```bash
bash scripts/import-images-from-global.sh
npm run build:static
```

### 通过后台上传图片

1. 访问 `/admin/login` 登录后台
2. 进入产品/新闻编辑页面
3. 上传图片（最大 400KB）
4. 图片自动保存到 `html/uploads/images/`

### 验证图片是否正确

```bash
# 检查产品图片路径
sqlite3 data/site.sqlite "SELECT name, images FROM products LIMIT 5;"

# 验证文件存在
ls -lh public/images/global/products/boilerhouse/lp30-*.jpg
```

## ⚠️ 注意事项

1. **不要手动删除 `html/uploads/` 目录**
   - 这是用户上传文件的唯一存储位置
   - 删除后无法恢复

2. **定期备份上传文件**
   ```bash
   tar -czf uploads-backup-$(date +%Y%m%d).tar.gz html/uploads/
   ```

3. **磁盘空间监控**
   ```bash
   du -sh html/uploads/
   du -sh public/images/
   ```

4. **图片优化建议**
   - 产品图片：4:3 比例，800x600px
   - 上传限制：400KB（可通过 `UPLOAD_MAX_SIZE_KB` 调整）
   - 格式：优先使用 `.jpg`（照片），`.png`（透明背景）

## 📚 相关文档

- `docs/images-management.md` - 完整图片管理指南
- `CLAUDE.md` - 项目开发指南
- `scripts/import-images-from-global.sh` - 图片导入脚本

## ✅ 验证清单

- [x] 图片上传路径改为 `html/uploads/images/`
- [x] 从 spirax-global 导入 548 张图片
- [x] 验证静态生成不删除 `html/uploads/`
- [x] 验证产品详情页图片显示正常
- [x] 创建图片导入脚本
- [x] 更新项目文档（CLAUDE.md）
- [x] 创建图片管理指南文档
- [x] 更新 `.gitignore` 配置
