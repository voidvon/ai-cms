# 图片资源管理

## 当前规则

产品图片、新闻图片和富文本上传图片统一存放在根目录发布目录：

```text
html/uploads/images/YYYYMM/文件名.jpg
```

对外访问 URL 统一为：

```text
/uploads/images/YYYYMM/文件名.jpg
```

例如：

```text
html/uploads/images/202606/td52-cover-4x3.jpg
/uploads/images/202606/td52-cover-4x3.jpg
```

`public/images/global/products/` 已废弃，不再作为产品图片存储目录。旧产品图片已迁移到 `html/uploads/images/YYYYMM/`，数据库中的产品图片字段也应指向 `/uploads/images/YYYYMM/...`。

## 目录结构

```text
html/
└── uploads/
    └── images/
        └── 202606/
            ├── td52-cover-4x3.jpg
            └── ...

public/
└── images/
    └── global/
        ├── generic-header-images/
        ├── dotcom-home/
        ├── industries/
        └── ...
```

`public/images/global/` 只保留站点通用静态素材；产品内容图片不要再放回 `public/images/global/products/`。

## 数据库存储

`products.images` 字段存储 JSON 数组：

```json
["/uploads/images/202606/td52-cover-4x3.jpg"]
```

页面中渲染为：

```html
<img src="/uploads/images/202606/td52-cover-4x3.jpg" alt="产品名称">
```

## 上传方式

- 后台上传接口会按当前月份写入 `html/uploads/images/YYYYMM/`。
- API 路径包括 `/media/upload` 和旧的 `/api/uploads`。
- 静态生成会同步并保留 `uploads/`，不会把上传文件清掉。

## 迁移与检查

迁移旧路径：

```bash
npm --prefix system/server run db:migrate-uploads -- --write
```

干跑检查：

```bash
npm --prefix system/server run db:migrate-uploads
```

检查是否仍有旧产品路径：

```bash
rg -n "/images/global/products|public/images/global/products" .
```

## 注意事项

- 不要手工维护 `public/images/global/products/`。
- 不要直接批量修改生成后的 `html/*.html` 页面；应修改数据库或服务层后重新生成。
- `html/uploads/` 是运行数据，发布或清理前需要备份。
- `.DS_Store` 已加入忽略规则，不应提交。
