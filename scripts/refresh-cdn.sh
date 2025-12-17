#!/bin/bash
# 手动刷新阿里云 CDN 缓存

echo "🔄 正在刷新阿里云 CDN 缓存..."

# 方法1：使用 aliyun CLI（需要先配置）
if command -v aliyun &> /dev/null; then
  aliyun cdn RefreshObjectCaches --ObjectPath "https://sparkvertex.cn/" --ObjectType Directory
  echo "✅ CDN 刷新请求已提交"
else
  echo "❌ 未安装 aliyun CLI"
  echo ""
  echo "请手动刷新："
  echo "1. 登录阿里云控制台"
  echo "2. 进入 CDN → 刷新预热"
  echo "3. 选择「刷新缓存」→ 「目录」"
  echo "4. 输入：https://sparkvertex.cn/"
  echo "5. 点击提交"
fi
