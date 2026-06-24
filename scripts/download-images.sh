#!/bin/bash
# 批量下载首页所需的图片文件

set -e

BASE_URL="https://www.spiraxsteam.cn"
UPLOADS_DIR="html/uploads"

echo "开始下载首页所需图片..."
echo "=========================================="

# 创建必要的目录
mkdir -p "$UPLOADS_DIR/images/global/generic-header-images"
mkdir -p "$UPLOADS_DIR/images/global/dotcom-home/hero/q2-2023"

# 固定图片列表
declare -a FIXED_IMAGES=(
  "/logo.svg"
  "/uploads/images/global/generic-header-images/header_engineers_07-60993fae75.jpg"
  "/uploads/images/global/dotcom-home/hero/q2-2023/gettyimages-1481065126-31b88d3a67.jpg"
)

SUCCESS_COUNT=0
FAIL_COUNT=0

echo ""
echo "【固定图片】下载中..."
echo "------------------------------------------"

for img_path in "${FIXED_IMAGES[@]}"; do
  if [ "$img_path" = "/logo.svg" ]; then
    output_file="public/logo.svg"
  else
    output_file="html${img_path}"
  fi
  url="$BASE_URL$img_path"

  if [ -f "$output_file" ]; then
    echo "⊙ 已存在: $(basename $output_file)"
    ((SUCCESS_COUNT++))
  else
    echo -n "下载: $(basename $output_file) ... "
    if curl -s -f -o "$output_file" "$url"; then
      echo "✓"
      ((SUCCESS_COUNT++))
    else
      echo "✗ 失败"
      ((FAIL_COUNT++))
    fi
  fi
done

echo ""
echo "=========================================="
echo "下载完成！"
echo "  成功: $SUCCESS_COUNT 个"
echo "  失败: $FAIL_COUNT 个"
echo ""

if [ $FAIL_COUNT -gt 0 ]; then
  echo "⚠️  部分图片下载失败，请检查网络连接或手动下载"
  exit 1
else
  echo "✅ 所有图片下载成功！"
  exit 0
fi
