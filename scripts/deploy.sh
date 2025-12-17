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
echo "🔄 正在重启 PM2 服务..."

# 定义进程名
PM2_NAME="sparkvertex"

# 检查进程是否存在，不存在则创建
if pm2 describe $PM2_NAME > /dev/null 2>&1; then
  pm2 restart $PM2_NAME --update-env
else
  echo "📌 PM2 进程不存在，正在创建..."
  pm2 start npm --name $PM2_NAME -- start
  pm2 save
fi

echo "✅ 部署成功！网站已更新。"
echo "📊 查看日志: pm2 logs $PM2_NAME"

# 5. 刷新阿里云 CDN 缓存（可选，需要配置 aliyun CLI）
if command -v aliyun &> /dev/null; then
  echo "🔄 正在刷新 CDN 缓存..."
  aliyun cdn RefreshObjectCaches --ObjectPath "https://sparkvertex.cn/" --ObjectType Directory 2>/dev/null || echo "⚠️ CDN 刷新失败，请手动刷新"
else
  echo "💡 提示：安装 aliyun CLI 可自动刷新 CDN 缓存"
  echo "   或手动刷新：阿里云控制台 → CDN → 刷新预热 → 输入 https://sparkvertex.cn/"
fi
