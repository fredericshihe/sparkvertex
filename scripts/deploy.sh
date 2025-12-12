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
# 注意：如果服务器内存较小，确保 Swap 已经启用
npm run build

# 4. 重启 PM2
echo "wm 正在重启 PM2 服务..."
pm2 restart nextjs

echo "✅ 部署成功！网站已更新。"
