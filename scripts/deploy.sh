#!/bin/bash

# 遇到错误立即停止
set -e

echo "🚀 开始部署流程..."

# 1. 拉取最新代码
echo "📥 正在拉取 Git 代码..."
git pull

# 2. 安装依赖
echo "📦 正在安装/更新依赖..."
npm install

# 3. 构建项目
echo "mb 正在构建 Next.js 项目..."

# 尝试加载环境变量 (支持 .env, .env.production, .env.local)
if [ -f .env ]; then
  echo "Loading .env..."
  export $(grep -v '^#' .env | xargs)
fi
if [ -f .env.production ]; then
  echo "Loading .env.production..."
  export $(grep -v '^#' .env.production | xargs)
fi
if [ -f .env.local ]; then
  echo "Loading .env.local..."
  export $(grep -v '^#' .env.local | xargs)
fi

# 检查关键环境变量是否存在
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
  echo "❌ 错误: 未找到 NEXT_PUBLIC_SUPABASE_URL 环境变量！"
  echo "请确保服务器上存在 .env 或 .env.local 文件，并且包含 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY。"
  exit 1
fi

# 注意：如果服务器内存较小，确保 Swap 已经启用
npm run build

# 4. 重启 PM2
echo "wm 正在重启 PM2 服务..."
pm2 restart nextjs

echo "✅ 部署成功！网站已更新。"
