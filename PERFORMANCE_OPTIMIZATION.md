# 性能优化指南

## 已实施的优化

### 1. 数据库层优化

#### 索引优化 (20251206_fix_rls_and_indexes.sql)
- 为 `items(author_id)` 添加索引 - 加速个人中心"我的作品"查询
- 为 `orders(buyer_id, seller_id)` 添加索引 - 加速订单查询
- 为 `likes(user_id)` 添加索引 - 加速"我的喜欢"查询
- 为 `items(is_public, daily_rank)` 添加复合索引 - 加速广场首页排序
- 为 `items(tags)` 添加 GIN 索引 - 加速标签筛选

#### 存储过程优化 (20251206_add_performance_optimizations.sql)
- `get_user_counts(uuid)` - 一次性返回个人中心所有计数，减少 4 次往返为 1 次

### 2. 应用层优化

#### Edge Runtime + ISR
```typescript
// app/explore/page.tsx
export const runtime = 'edge';  // 使用边缘运行时
export const revalidate = 60;   // 缓存 60 秒
```
- 页面在全球边缘节点生成和缓存
- 用户访问时直接从最近节点返回
- 减少跨境延迟 70-90%

#### 并行查询
```typescript
// app/profile/page.tsx
const [profile, items, counts] = await Promise.all([...]);
```
- 多个独立查询并行执行
- 减少总等待时间

### 3. 基础设施优化

#### Vercel 区域配置
```json
{
  "regions": ["hkg1", "sin1", "icn1"]
}
```
- 优先使用亚太节点：香港、新加坡、首尔
- 降低中国用户访问延迟

## 下一步优化建议

### 短期（1-3天）

1. **Supabase PostgREST 缓存**
   - 在 Supabase Dashboard 启用
   - Settings → API → Enable PostgREST Caching
   - 对 SELECT 查询自动缓存

2. **添加 Redis 缓存层 (Upstash)**
   ```bash
   npm install @upstash/redis
   ```
   - 缓存热门作品列表
   - 缓存分类统计数据
   - 减少数据库压力

### 中期（1-2周）

3. **图片 CDN 优化**
   - 使用 Cloudflare Images 或七牛云
   - 自动压缩和格式转换
   - 全球边缘分发

4. **静态资源优化**
   ```javascript
   // next.config.js
   images: {
     formats: ['image/avif', 'image/webp'],
     minimumCacheTTL: 3600,
   }
   ```

### 长期（持续）

5. **监控和分析**
   - 集成 Vercel Analytics
   - 监控 Core Web Vitals
   - 分析慢查询日志

6. **考虑国内部署**
   - Zeabur (香港/新加坡)
   - 或使用 Cloudflare Workers

## 预期性能提升

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 首屏加载 (TTFB) | 800-2000ms | 200-500ms | 60-75% |
| 数据库查询 | 5-8次 | 1-2次 | 70-80% |
| 页面可交互时间 | 1.5-3s | 0.5-1s | 50-70% |

## 执行步骤

1. **立即执行数据库迁移**
   ```bash
   supabase db push
   ```

2. **部署应用**
   ```bash
   git push
   ```
   Vercel 会自动检测 `vercel.json` 和 Edge Runtime 配置

3. **验证效果**
   - 打开开发者工具 Network 面板
   - 访问 /explore 和 /profile
   - 查看请求时间和数量

## 故障排查

### 如果 Edge Runtime 报错
移除 `export const runtime = 'edge'`，保留 `revalidate`

### 如果存储过程不存在
手动在 Supabase SQL Editor 执行迁移文件

### 如果区域配置不生效
检查 Vercel 项目设置 → Functions → Region
