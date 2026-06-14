#!/bin/bash
# 批量下载首页所需的图片文件

set -e

BASE_URL="https://www.spiraxsteam.cn"
HTML_DIR="html"

echo "开始下载首页所需图片..."
echo "=========================================="

# 创建必要的目录
mkdir -p "$HTML_DIR/images/global/generic-header-images"
mkdir -p "$HTML_DIR/images/global/products/control-valves"
mkdir -p "$HTML_DIR/images/global/products/steam-traps"
mkdir -p "$HTML_DIR/images/global/dotcom-home/hero/q2-2023"

# 固定图片列表
declare -a FIXED_IMAGES=(
  "/logo.svg"
  "/images/global/generic-header-images/header_engineers_07-60993fae75.jpg"
  "/images/global/products/steam_traps_02-97182c4207.jpg"
  "/images/global/products/control-valves/pressure_reducing_surplussing_valve_dp27e_01-a5e41169f1.jpg"
  "/images/global/products/easiheat_gen4-unit4_dhw_dual-4820852_main_no_refl_v3_1440x810-7101139780.jpg"
  "/images/global/products/flowmetering_02-7e67646194.jpg"
  "/images/global/products/boilerhouse_01-0d6d9e8d4f.jpg"
  "/images/global/dotcom-home/hero/q2-2023/gettyimages-1481065126-31b88d3a67.jpg"
)

# 产品图片列表
declare -a PRODUCT_IMAGES=(
  "/images/global/products/steam-traps/td52-cover-4x3.jpg"
  "/images/global/products/steam-traps/td32f-cover-01-4x3.jpg"
  "/images/global/products/steam-traps/ft43-ball-float-steam-trap-cover-4x3.jpg"
  "/images/global/products/steam-traps/ft14-10-cover-4x3.jpg"
)

SUCCESS_COUNT=0
FAIL_COUNT=0

echo ""
echo "【固定图片】下载中..."
echo "------------------------------------------"

for img_path in "${FIXED_IMAGES[@]}"; do
  output_file="$HTML_DIR$img_path"
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
echo "【产品图片】下载中..."
echo "------------------------------------------"

for img_path in "${PRODUCT_IMAGES[@]}"; do
  output_file="$HTML_DIR$img_path"
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
