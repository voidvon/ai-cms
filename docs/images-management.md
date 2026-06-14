# 图片资源管理

## 目录结构

```
public/
├── images/
│   └── global/              # 从 spirax-global 项目导入的全局图片
│       ├── products/        # 产品图片（390+ 张）
│       ├── industries/      # 行业图片
│       ├── news/            # 新闻图片
│       ├── contact-us/      # 联系页面图片
│       ├── about-us/        # 关于我们图片
│       └── ...
│
html/
└── uploads/
    └── images/              # 用户上传的图片（通过后台管理上传）
        ├── products/        # 产品图片上传
        ├── news/            # 新闻图片上传
        └── richtext/        # 富文本编辑器图片上传
```

## 图片来源

### 1. 静态资源图片 (`public/images/`)

这些图片来自原 `spirax-global` 项目，用于：
- 产品详情页主图
- 分类页面卡片图
- 首页、关于我们等页面的背景图和配图

**访问路径：** `/images/global/products/...`

**导入方法：**
```bash
bash scripts/import-images-from-global.sh
```

**特点：**
- ✅ 提交到 Git（已在版本控制中）
- ✅ 高质量的产品官方图片
- ✅ 548+ 张图片，包含产品、行业、新闻等

### 2. 用户上传图片 (`html/uploads/images/`)

这些图片通过后台管理系统上传，用于：
- 新增产品的图片
- 新闻文章的配图
- 富文本编辑器中的图片

**访问路径：** `/uploads/images/{products|news|richtext}/...`

**上传方式：**
- 通过 `/admin/` 后台管理界面上传
- API 接口: `POST /api/uploads?utype=prod|news`

**特点：**
- ❌ 不提交到 Git（在 `html/.gitignore` 中）
- ✅ 静态生成时自动保留（不会被删除）
- ✅ 支持 jpg, jpeg, png, gif 格式
- ✅ 最大文件大小: 400KB（可通过 `UPLOAD_MAX_SIZE_KB` 环境变量调整）

## 图片URL规则

### 产品图片

数据库中的 `products.images` 字段存储JSON数组：

```json
["/images/global/products/boilerhouse/lp30-cover-4x3.jpg"]
```

HTML中渲染为：

```html
<img src="/images/global/products/boilerhouse/lp30-cover-4x3.jpg" alt="产品名称">
```

### 静态文件服务优先级

服务器按以下顺序查找文件：

1. `public/` - 源静态资源
2. `html/` - 生成的静态HTML和上传的文件

这确保：
- 开发和生产环境共享 `public/` 资源
- 上传的文件在两种环境都能访问
- 生成的HTML可以覆盖特定路由

## 常见操作

### 重新导入图片

如果 `spirax-global` 项目有新图片：

```bash
bash scripts/import-images-from-global.sh
npm run build:static
```

### 清理上传的图片

```bash
# 查看上传的图片
ls -lh html/uploads/images/products/

# 删除特定图片
rm html/uploads/images/products/20260614_abc123.jpg
```

### 更新产品图片路径

如果需要更改产品的图片：

```sql
-- 通过后台管理界面或直接更新数据库
UPDATE products 
SET images = '["/images/global/products/new-path/image.jpg"]'
WHERE id = 1;
```

然后重新生成静态页面：

```bash
npm run build:static
```

## 图片优化建议

1. **格式选择**
   - 照片类：使用 `.jpg`（更小的文件大小）
   - 图标、透明图：使用 `.png`
   - 动画：使用 `.gif`

2. **尺寸规范**
   - 产品列表卡片：4:3 比例（如 800x600px）
   - 产品详情主图：16:9 比例（如 1440x810px）
   - 缩略图：最大 400KB

3. **命名规范**
   - 使用小写字母和连字符
   - 描述性名称：`td52-thermodynamic-steam-trap.jpg`
   - 避免中文和特殊字符

## 注意事项

⚠️ **静态生成保护**

`html/uploads/` 目录在静态生成时会被保留，不会被删除。清理逻辑：

- ✅ 只删除 `.html`, `.htm`, `.md` 文件
- ✅ `uploads/` 不在 `MANAGED_STATIC_DIRS` 列表中
- ✅ 图片文件（`.jpg`, `.png`, `.gif`）永远不会被自动删除

⚠️ **备份建议**

虽然 `html/uploads/` 不会被静态生成删除，但建议定期备份：

```bash
tar -czf uploads-backup-$(date +%Y%m%d).tar.gz html/uploads/
```

⚠️ **磁盘空间**

上传的图片会持续累积，定期检查磁盘使用：

```bash
du -sh html/uploads/
du -sh public/images/
```
