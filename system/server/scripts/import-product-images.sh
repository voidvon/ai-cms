#!/bin/bash

# 从原项目复制产品图片到当前项目
# 使用方法: bash scripts/import-product-images.sh

SOURCE_DIR="/Users/yytest/Documents/projects/spirax-global/dist/zh-cn/images/global/products"
TARGET_DIR="public/images/global/products"

# 检查源目录是否存在
if [ ! -d "$SOURCE_DIR" ]; then
  echo "错误: 源目录不存在: $SOURCE_DIR"
  exit 1
fi

# 创建目标目录
echo "创建目标目录: $TARGET_DIR"
mkdir -p "$TARGET_DIR"

# 复制所有产品图片
echo "开始复制产品图片..."
rsync -av --progress "$SOURCE_DIR/" "$TARGET_DIR/"

# 统计复制的文件数
COPIED_COUNT=$(find "$TARGET_DIR" -type f \( -name "*.jpg" -o -name "*.png" -o -name "*.gif" \) | wc -l)

echo ""
echo "✅ 完成！"
echo "已复制 $COPIED_COUNT 个图片文件到 $TARGET_DIR"
echo ""
echo "图片访问路径: /images/global/products/..."
