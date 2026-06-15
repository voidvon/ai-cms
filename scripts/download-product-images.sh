#!/bin/bash
# 批量下载产品图片

set -e

BASE_URL="https://www.spiraxsteam.cn"
PUBLIC_DIR="public"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DB_PATH="$PROJECT_ROOT/data/site.sqlite"
UPLOADS_ROOT="$PROJECT_ROOT/html"

echo "开始下载产品图片..."
echo "=========================================="

# 从数据库提取产品图片路径
IMAGE_LIST=$(sqlite3 "$DB_PATH" "SELECT images FROM products WHERE images != '[]';" | grep -o '"/uploads/images/[^"]*"' | sed 's/"//g' | sort -u)

SUCCESS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

for img_path in $IMAGE_LIST; do
  output_file="$UPLOADS_ROOT$img_path"
  output_dir=$(dirname "$output_file")
  url="$BASE_URL$img_path"

  # 创建目录
  mkdir -p "$output_dir"

  if [ -f "$output_file" ]; then
    echo "⊙ 已存在: $(basename $output_file)"
    ((SKIP_COUNT++))
  else
    echo -n "下载: $(basename $output_file) ... "
    if curl -s -f -o "$output_file" "$url" 2>/dev/null; then
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
echo "  新下载: $SUCCESS_COUNT 个"
echo "  已存在: $SKIP_COUNT 个"
echo "  失败: $FAIL_COUNT 个"
echo ""

if [ $FAIL_COUNT -gt 0 ]; then
  echo "⚠️  部分图片下载失败，可能是线上不存在"
  exit 0
else
  echo "✅ 所有图片处理完成！"
  exit 0
fi
