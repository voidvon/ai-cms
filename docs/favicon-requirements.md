# Favicon 图标文件需求清单

## 概述
以下图标文件需要放置在 `html/` 目录下，以完成完整的 favicon 支持。

## 必需的图标文件

### 1. **favicon.ico** (必需)
- 格式: ICO
- 尺寸: 16x16, 32x32, 48x48 (多尺寸ICO)
- 用途: 传统浏览器标签页图标
- 位置: `/html/favicon.ico`

### 2. **favicon-16x16.png** (必需)
- 格式: PNG
- 尺寸: 16x16
- 用途: 现代浏览器小尺寸图标
- 位置: `/html/favicon-16x16.png`

### 3. **favicon-32x32.png** (必需)
- 格式: PNG
- 尺寸: 32x32
- 用途: 现代浏览器标准尺寸图标
- 位置: `/html/favicon-32x32.png`

### 4. **apple-touch-icon.png** (必需)
- 格式: PNG
- 尺寸: 180x180
- 用途: iOS/iPad/Mac 添加到主屏幕
- 位置: `/html/apple-touch-icon.png`

### 5. **safari-pinned-tab.svg** (推荐)
- 格式: SVG (单色)
- 尺寸: 矢量图
- 颜色: 单色黑色路径
- 用途: Safari 固定标签页图标
- 位置: `/html/safari-pinned-tab.svg`

### 6. **android-chrome-192x192.png** (推荐)
- 格式: PNG
- 尺寸: 192x192
- 用途: Android Chrome 添加到主屏幕
- 位置: `/html/android-chrome-192x192.png`

### 7. **android-chrome-512x512.png** (推荐)
- 格式: PNG
- 尺寸: 512x512
- 用途: Android Chrome 高分辨率图标
- 位置: `/html/android-chrome-512x512.png`

### 8. **mstile-150x150.png** (可选)
- 格式: PNG
- 尺寸: 150x150
- 用途: Windows 磁贴图标
- 位置: `/html/mstile-150x150.png`

## 已创建的配置文件

✅ **site.webmanifest** - 已创建
✅ **browserconfig.xml** - 已创建

## 图标制作建议

### 源图标要求
- 使用 Spirax Sarco 官方 Logo
- 建议起始尺寸: 512x512 或更大
- 格式: PNG (透明背景) 或 SVG
- 颜色: Spirax Sarco 品牌蓝色 `#002d72`

### 制作工具选项

#### 选项1: 在线工具（推荐快速生成）
1. **RealFaviconGenerator** - https://realfavicongenerator.net/
   - 上传单个高分辨率 Logo
   - 自动生成所有需要的尺寸和格式
   - 包含配置文件

2. **Favicon.io** - https://favicon.io/
   - 支持从图片、文本、Emoji 生成
   - 自动生成多种尺寸

#### 选项2: 使用 ImageMagick（命令行批量生成）
```bash
# 从源图标生成不同尺寸
convert logo-512.png -resize 16x16 favicon-16x16.png
convert logo-512.png -resize 32x32 favicon-32x32.png
convert logo-512.png -resize 180x180 apple-touch-icon.png
convert logo-512.png -resize 192x192 android-chrome-192x192.png
convert logo-512.png -resize 512x512 android-chrome-512x512.png
convert logo-512.png -resize 150x150 mstile-150x150.png

# 生成 ICO 文件（包含多尺寸）
convert logo-512.png -resize 16x16 -background transparent -gravity center -extent 16x16 favicon-16.png
convert logo-512.png -resize 32x32 -background transparent -gravity center -extent 32x32 favicon-32.png
convert logo-512.png -resize 48x48 -background transparent -gravity center -extent 48x48 favicon-48.png
convert favicon-16.png favicon-32.png favicon-48.png favicon.ico
```

#### 选项3: 从线上站点下载
如果 https://www.spiraxsteam.cn 已有完整的 favicon，可以直接下载：

```bash
# 下载现有图标
cd html/
wget https://www.spiraxsteam.cn/favicon.ico
wget https://www.spiraxsteam.cn/favicon-16x16.png
wget https://www.spiraxsteam.cn/favicon-32x32.png
wget https://www.spiraxsteam.cn/apple-touch-icon.png
wget https://www.spiraxsteam.cn/safari-pinned-tab.svg
wget https://www.spiraxsteam.cn/android-chrome-192x192.png
wget https://www.spiraxsteam.cn/android-chrome-512x512.png
```

## 临时占位方案

如果暂时没有图标文件，可以创建简单的占位符：

```bash
cd html/

# 创建简单的纯色占位图标（深蓝色方块）
convert -size 180x180 xc:"#002d72" apple-touch-icon.png
convert -size 32x32 xc:"#002d72" favicon-32x32.png
convert -size 16x16 xc:"#002d72" favicon-16x16.png
convert -size 192x192 xc:"#002d72" android-chrome-192x192.png
convert -size 512x512 xc:"#002d72" android-chrome-512x512.png
convert -size 150x150 xc:"#002d72" mstile-150x150.png
convert favicon-16x16.png favicon-32x32.png favicon.ico
```

## 验证

生成后验证文件：

```bash
# 检查文件是否存在
ls -lh html/favicon* html/apple-touch-icon.png html/android-chrome-* html/mstile-* html/*.webmanifest html/*.xml

# 检查图片尺寸
file html/favicon-*.png
identify html/apple-touch-icon.png
```

## 部署

图标文件准备好后：

1. 确保所有图标在 `html/` 目录
2. 重新生成静态站点: `npm run build:site`
3. 验证生成的 HTML 包含 favicon 链接
4. 测试各个浏览器的显示效果

## 当前状态

- ✅ `site.webmanifest` - 已创建
- ✅ `browserconfig.xml` - 已创建
- ⏳ 图标文件 - **需要准备**

**下一步：** 根据上述方法之一，准备实际的图标文件。
