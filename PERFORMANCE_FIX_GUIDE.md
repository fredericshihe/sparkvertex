# 性能优化修复指南

根据您的 Lighthouse 报告，我们发现了两个主要问题：
1. **首屏响应极慢 (TTFB ~9秒)**：这是因为中间件在每次请求（包括首页）都去连接 Supabase 验证用户身份。
2. **静态资源缓存失效 (TTL 1分钟)**：导致用户每次访问都要重新下载字体和 CSS。

## 1. 已自动修复：中间件优化

我已经修改了 `middleware.ts`。
**修改前**：所有页面（包括首页）都会尝试连接 Supabase 验证 Session。由于 Supabase 服务器在海外，这会导致极高的延迟。
**修改后**：仅在访问 `/admin`, `/profile`, `/create` 等受保护页面时才进行服务端验证。首页 `/` 现在是**零阻塞**的，TTFB 应该会降至 200ms 以内。

**您需要做的**：
重新部署应用即可生效。

## 2. 需要手动配置：Nginx 缓存设置

Next.js 虽然配置了缓存头，但通常会被 Nginx 的默认配置覆盖。请在您的 Nginx 配置文件（通常在 `/www/server/nginx/conf/nginx.conf` 或 宝塔面板 -> 网站 -> 配置文件）中添加以下内容：

```nginx
# 在 server { ... } 块中添加

# 1. 针对 FontAwesome 字体和 CSS 的长期缓存
location ~* ^/fontawesome/.*\.(css|woff2|ttf)$ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    
    # 强制缓存 1 年
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
    
    # 移除可能冲突的默认头
    proxy_hide_header Cache-Control;
    proxy_ignore_headers Cache-Control;
}

# 2. 针对 Next.js 静态资源的缓存
location /_next/static/ {
    proxy_pass http://127.0.0.1:3000;
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

# 3. 针对图标等静态文件
location /icons/ {
    proxy_pass http://127.0.0.1:3000;
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

## 3. 验证修复

部署并更新 Nginx 配置后：
1. 打开 Chrome 开发者工具 -> Network 面板。
2. 刷新页面。
3. 点击 `sparkvertex.cn` (第一个请求)，查看 **Timing** 标签，Waiting for server response (TTFB) 应该小于 500ms。
4. 点击 `all.min.css` 或 `woff2` 文件，查看 **Headers** 标签，`Cache-Control` 应该显示 `max-age=31536000`。
