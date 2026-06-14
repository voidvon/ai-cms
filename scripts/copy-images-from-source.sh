#!/bin/bash
# 从源仓库复制图片文件

set -e

SOURCE_REPO="/Volumes/DATA/Space/spirax-global"
SOURCE_IMG="$SOURCE_REPO/public/images"
DEST_IMG="html/images"

echo "从源仓库复制图片文件..."
echo "=========================================="
echo "源路径: $SOURCE_IMG"
echo "目标路径: $DEST_IMG"
echo ""

if [ ! -d "$SOURCE_IMG" ]; then
  echo "✗ 源仓库图片目录不存在: $SOURCE_IMG"
  exit 1
fi

# 创建目标目录结构
mkdir -p "$DEST_IMG/global"

echo "开始复制..."
echo "------------------------------------------"

# 复制整个global目录
echo "复制 global/ 目录..."
rsync -av --progress "$SOURCE_IMG/global/" "$DEST_IMG/global/" 2>&1 | grep -E "sending|total size|speedup" || true

# 复制site-wide目录（如果有logo等）
if [ -d "$SOURCE_IMG/site-wide" ]; then
  echo ""
  echo "复制 site-wide/ 目录..."
  rsync -av --progress "$SOURCE_IMG/site-wide/" "$DEST_IMG/site-wide/" 2>&1 | grep -E "sending|total size|speedup" || true
fi

echo ""
echo "=========================================="

# 统计文件数量
TOTAL_FILES=$(find "$DEST_IMG/global" -type f | wc -l | xargs)
TOTAL_SIZE=$(du -sh "$DEST_IMG/global" | cut -f1)

echo "✅ 复制完成！"
echo "  文件总数: $TOTAL_FILES"
echo "  总大小: $TOTAL_SIZE"
echo ""

# 验证关键图片
echo "验证关键图片文件:"
echo "------------------------------------------"

declare -a KEY_IMAGES=(
  "global/generic-header-images/header_engineers_07-60993fae75.jpg"
  "global/products/steam_traps_02-97182c4207.jpg"
  "global/products/steam-traps/td52-cover-4x3.jpg"
  "global/dotcom-home/hero/q2-2023/gettyimages-1481065126-31b88d3a67.jpg"
)

SUCCESS=0
for img in "${KEY_IMAGES[@]}"; do
  if [ -f "$DEST_IMG/$img" ]; then
    echo "  ✓ $(basename $img)"
    ((SUCCESS++))
  else
    echo "  ✗ $(basename $img)"
  fi
done

echo ""
if [ $SUCCESS -eq ${#KEY_IMAGES[@]} ]; then
  echo "✅ 所有关键图片验证通过！"
else
  echo "⚠️  部分图片缺失"
fi
