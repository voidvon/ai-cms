#!/bin/bash

# 从原项目复制产品图片到统一 uploads 目录
# 使用方法: bash scripts/import-product-images.sh

SOURCE_DIR="/Users/yytest/Documents/projects/spirax-global/dist/zh-cn/images/global/products"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
UPLOAD_MONTH="${UPLOAD_MONTH:-$(date +%Y%m)}"
TARGET_DIR="$PROJECT_ROOT/html/uploads/images/$UPLOAD_MONTH"

# 检查源目录是否存在
if [ ! -d "$SOURCE_DIR" ]; then
  echo "错误: 源目录不存在: $SOURCE_DIR"
  exit 1
fi

# 创建目标目录
echo "创建目标目录: $TARGET_DIR"
mkdir -p "$TARGET_DIR"

# 复制所有产品图片，统一扁平化到 YYYYMM 目录
echo "开始复制产品图片..."
COPIED_COUNT=0
SKIPPED_COUNT=0

while IFS= read -r -d '' file; do
  filename="$(basename "$file")"
  target="$TARGET_DIR/$filename"

  if [ -f "$target" ]; then
    if cmp -s "$file" "$target"; then
      ((SKIPPED_COUNT++))
      continue
    fi

    stem="${filename%.*}"
    ext="${filename##*.}"
    index=1
    while [ -f "$TARGET_DIR/${stem}-$index.$ext" ]; do
      ((index++))
    done
    target="$TARGET_DIR/${stem}-$index.$ext"
  fi

  cp "$file" "$target"
  ((COPIED_COUNT++))
done < <(find "$SOURCE_DIR" -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.gif" -o -name "*.webp" \) -print0)

# 统计复制的文件数
TOTAL_COUNT=$(find "$TARGET_DIR" -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.gif" -o -name "*.webp" \) | wc -l)

echo ""
echo "✅ 完成！"
echo "新复制 $COPIED_COUNT 个图片文件到 $TARGET_DIR"
echo "跳过 $SKIPPED_COUNT 个已存在相同文件"
echo "目标目录现有 $TOTAL_COUNT 个图片文件"
echo ""
echo "图片访问路径: /uploads/images/$UPLOAD_MONTH/文件名"
