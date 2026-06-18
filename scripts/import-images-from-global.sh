#!/bin/bash

# 从原 spirax-global 项目导入图片资源
# 使用方法: bash scripts/import-images-from-global.sh

set -e

SOURCE_BASE="/Users/yytest/Documents/projects/spirax-global/dist/zh-cn/images/global"
TARGET_BASE="html/uploads/images/global"

# 检查源目录是否存在
if [ ! -d "$SOURCE_BASE" ]; then
  echo "❌ 错误: 源目录不存在: $SOURCE_BASE"
  exit 1
fi

echo "🚀 开始从 spirax-global 项目导入图片..."
echo ""

# 复制全局图片。产品内容图片已统一迁移到 html/uploads/images/YYYYMM/。
GLOBAL_DIRS=(
  "contact-us"
  "industries"
  "news"
  "about-us"
  "case-studies"
  "dotcom-home"
  "generic-header-images"
)

echo "📦 复制全局图片..."
for dir in "${GLOBAL_DIRS[@]}"; do
  if [ -d "$SOURCE_BASE/$dir" ]; then
    mkdir -p "$TARGET_BASE/$dir"
    rsync -a "$SOURCE_BASE/$dir/" "$TARGET_BASE/$dir/"
    count=$(find "$TARGET_BASE/$dir" -type f \( -name "*.jpg" -o -name "*.png" -o -name "*.gif" -o -name "*.svg" \) 2>/dev/null | wc -l)
    echo "   ✅ $dir: $count 个文件"
  fi
done
echo ""

# 统计总数
TOTAL_COUNT=$(find "$TARGET_BASE" -type f \( -name "*.jpg" -o -name "*.png" -o -name "*.gif" -o -name "*.svg" \) | wc -l)

echo "✅ 导入完成！"
echo ""
echo "📊 统计信息："
echo "   - 目标目录: $TARGET_BASE"
echo "   - 总图片数: $TOTAL_COUNT 个文件"
echo ""
echo "💡 提示："
echo "   - 其他图片访问路径: /images/global/{category}/..."
echo "   - 产品内容图片路径: /uploads/images/YYYYMM/文件名"
echo "   - 运行 'npm run build:static' 重新生成静态站点"
