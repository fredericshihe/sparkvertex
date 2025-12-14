#!/bin/bash
# SparkVertex Nginx 缓存配置安装脚本
# 在香港服务器上运行: bash setup-nginx-cache.sh

set -e

echo "=== SparkVertex Nginx 缓存配置 ==="

# 1. 创建缓存目录
echo "1. 创建缓存目录..."
sudo mkdir -p /var/cache/nginx/sparkvertex
sudo chown -R nginx:nginx /var/cache/nginx/sparkvertex 2>/dev/null || sudo chown -R www-data:www-data /var/cache/nginx/sparkvertex

# 2. 备份原有配置
echo "2. 备份原有 Nginx 配置..."
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup.$(date +%Y%m%d)

# 3. 添加 proxy_cache_path 到 nginx.conf 的 http 块
echo "3. 检查 proxy_cache_path 配置..."
if ! grep -q "proxy_cache_path.*sparkvertex_cache" /etc/nginx/nginx.conf; then
    echo "添加 proxy_cache_path 配置..."
    sudo sed -i '/http {/a \    proxy_cache_path /var/cache/nginx/sparkvertex levels=1:2 keys_zone=sparkvertex_cache:100m max_size=2g inactive=24h use_temp_path=off;' /etc/nginx/nginx.conf
    echo "✓ proxy_cache_path 已添加"
else
    echo "✓ proxy_cache_path 已存在，跳过"
fi

# 4. 测试 Nginx 配置
echo "4. 测试 Nginx 配置..."
sudo nginx -t

# 5. 重载 Nginx
echo "5. 重载 Nginx..."
sudo systemctl reload nginx || sudo nginx -s reload

echo ""
echo "=== 配置完成 ==="
echo ""
echo "下一步操作:"
echo "1. 将 docs/nginx-cache-config.conf 的内容复制到你的站点配置"
echo "2. 根据实际情况修改 SSL 证书路径"
echo "3. 运行 sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "验证缓存是否生效:"
echo "  curl -I https://sparkvertex.cn/run/414"
echo "  查看响应头中的 X-Cache-Status (MISS/HIT)"
