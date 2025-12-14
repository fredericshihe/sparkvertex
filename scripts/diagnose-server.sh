#!/bin/bash

echo "=========================================="
echo "🔍 服务器性能诊断脚本"
echo "=========================================="
echo ""

# 1. 系统信息
echo "📊 系统信息:"
echo "----------------------------------------"
echo "CPU核心数: $(nproc)"
echo "内存: $(free -h | grep Mem | awk '{print $2}')"
echo "磁盘: $(df -h / | tail -1 | awk '{print $4}') 可用"
echo ""

# 2. 网络延迟测试
echo "🌐 网络延迟测试:"
echo "----------------------------------------"
echo "Supabase 延迟:"
ping -c 3 waesizzoqodntrlvrwhw.supabase.co 2>/dev/null | tail -1 || echo "无法 ping"
echo ""
echo "DeepSeek API 延迟:"
ping -c 3 api.deepseek.com 2>/dev/null | tail -1 || echo "无法 ping"
echo ""

# 3. HTTP 请求延迟
echo "⏱️ HTTP 请求延迟 (Supabase):"
echo "----------------------------------------"
curl -w "DNS解析: %{time_namelookup}s\nTCP连接: %{time_connect}s\nTTFB: %{time_starttransfer}s\n总耗时: %{time_total}s\n" \
     -o /dev/null -s "https://waesizzoqodntrlvrwhw.supabase.co/rest/v1/" || echo "请求失败"
echo ""

# 4. Node.js 进程状态
echo "📦 Node.js 进程:"
echo "----------------------------------------"
ps aux | grep -E "node|next" | grep -v grep | head -5 || echo "未找到 Node.js 进程"
echo ""

# 5. Nginx 状态
echo "🔧 Nginx 状态:"
echo "----------------------------------------"
nginx -v 2>&1
systemctl is-active nginx 2>/dev/null || service nginx status 2>/dev/null | head -3
echo ""

# 6. 带宽测试 (简单)
echo "📶 带宽估算 (下载 1MB 文件):"
echo "----------------------------------------"
START=$(date +%s.%N)
curl -o /dev/null -s "https://speed.hetzner.de/1MB.bin"
END=$(date +%s.%N)
TIME=$(echo "$END - $START" | bc)
SPEED=$(echo "scale=2; 1 / $TIME" | bc)
echo "下载速度: 约 ${SPEED} MB/s"
echo ""

# 7. 检查 Gzip
echo "🗜️ Gzip 配置检查:"
echo "----------------------------------------"
nginx -T 2>/dev/null | grep -E "gzip|gzip_types" | head -5 || echo "无法读取 Nginx 配置"
echo ""

echo "=========================================="
echo "✅ 诊断完成"
echo "=========================================="
echo ""
echo "📋 常见问题解决方案:"
echo "1. Supabase 延迟 > 300ms → 考虑使用国内数据库或 API 缓存"
echo "2. TTFB > 2s → 检查 Node.js 进程状态和服务器负载"
echo "3. 带宽 < 1MB/s → 升级服务器带宽或使用 CDN"
echo "4. Gzip 未开启 → 在宝塔 Nginx 配置中添加 gzip on;"
