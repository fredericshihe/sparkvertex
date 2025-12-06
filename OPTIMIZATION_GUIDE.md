# 🚀 性能优化实施指南

## ✅ 已完成的优化（2025-12-06）

### 1. 首页（Home Page）优化 ⚡
**文件**: `app/page.tsx`, `components/Hero.tsx`

**改进**:
- ✅ 添加 Edge Runtime（在离用户最近的边缘节点执行）
- ✅ 启用 ISR 缓存（120秒，2分钟）
- ✅ 服务端数据获取（避免客户端请求）
- ✅ 移除 Hero 组件的重复数据库查询

**预期效果**: 
- TTFB: 800-1200ms → 200-300ms ⬇️ **75%**
- FCP: 1.2s → 0.4s ⬇️ **67%**

### 2. 广场页（Explore Page）优化 ⚡
**文件**: `app/explore/page.tsx`

**改进**:
- ✅ Edge Runtime 已启用
- ✅ ISR 缓存 60秒
- ✅ 服务端分类统计和项目列表获取
- ✅ 使用 RPC `get_tag_counts` 优化分类查询

**预期效果**:
- TTFB: 600-1000ms → 200-400ms ⬇️ **60%**

### 3. 个人中心（Profile Page）优化 ⚡
**文件**: `app/profile/page.tsx`

**改进**:
- ✅ 使用存储过程 `get_user_counts` 一次性获取所有计数
- ✅ 并行化数据获取（Profile + Counts + Items）
- ✅ 降级兼容（RPC失败时回退到原逻辑）

**预期效果**:
- 数据库查询: 4次 → 1次 ⬇️ **75%**
- TTFB: 1000-1500ms → 400-600ms ⬇️ **60%**

### 4. 数据库优化 🗄️
**文件**: `supabase/migrations/20251206_*.sql`

**改进**:
- ✅ 添加外键索引（10+ 个）
- ✅ 优化 RLS 策略（auth.uid() 包装）
- ✅ 复合索引（is_public + daily_rank）
- ✅ GIN 索引（tags 数组查询）
- ✅ 存储过程 `get_user_counts`

**状态**: ⏳ **待应用**（需要执行 `npx supabase db push`）

### 5. 部署配置优化 🌏
**文件**: `vercel.json`

**改进**:
- ✅ 配置亚太地区（香港、新加坡、首尔）
- ✅ 减少跨境延迟

## 📋 待执行任务

### 🔥 高优先级

#### 1. 应用数据库迁移
```bash
cd /Users/shihe/Documents/spark-vertex-next
npx supabase db push
```

**验证**:
```sql
-- 检查索引是否创建成功
SELECT 
  schemaname, 
  tablename, 
  indexname 
FROM pg_indexes 
WHERE tablename IN ('items', 'orders', 'likes', 'profiles');

-- 检查存储过程是否存在
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'get_user_counts';
```

#### 2. 部署到 Vercel
```bash
git add .
git commit -m "perf: optimize homepage, explore, and profile pages with Edge Runtime and ISR"
git push
```

**验证**: 访问生产环境，检查响应头
```bash
curl -I https://your-domain.com
# 应该看到: x-vercel-cache: HIT（缓存命中）
```

#### 3. 测试性能
```bash
# 使用 Lighthouse
npx lighthouse https://your-domain.com --view

# 或使用 WebPageTest
# https://www.webpagetest.org/
```

### 🎨 中优先级

#### 4. 图片优化（可选，进一步提升）
**文件**: 全局组件

**步骤**:
1. 安装依赖（已有 next/image）
2. 替换 `<img>` 标签
```tsx
import Image from 'next/image';

// Before
<img src={avatar} className="w-8 h-8 rounded-full" />

// After
<Image 
  src={avatar} 
  width={32} 
  height={32} 
  className="rounded-full"
  alt="avatar"
/>
```

3. 配置图片域名（`next.config.js`）
```javascript
images: {
  domains: [
    'waesizzoqodntrlvrwhw.supabase.co',
    'api.dicebear.com'
  ]
}
```

#### 5. 预加载关键资源
**文件**: `app/layout.tsx`

```tsx
<link rel="preconnect" href="https://waesizzoqodntrlvrwhw.supabase.co" />
<link rel="dns-prefetch" href="https://api.dicebear.com" />
<link rel="preload" href="/logo.png" as="image" />
```

#### 6. 代码分割
**文件**: 大型组件（Modal, DetailModal 等）

```tsx
import dynamic from 'next/dynamic';

const DetailModal = dynamic(() => import('@/components/DetailModal'), {
  loading: () => <Skeleton />,
  ssr: false
});
```

### 📊 低优先级

#### 7. 添加性能监控
**文件**: `app/layout.tsx`

```tsx
export function reportWebVitals(metric: any) {
  if (metric.label === 'web-vital') {
    // 记录到日志或分析服务
    console.log(metric);
  }
}
```

#### 8. Service Worker 优化
**文件**: `public/sw.js`

增加 API 响应缓存策略（已有基础配置）

## 🧪 测试清单

### 功能测试
- [ ] 首页加载正常，卡片轮播正常
- [ ] 扫码功能正常
- [ ] 广场页分类筛选正常
- [ ] 搜索功能正常
- [ ] 个人中心数据显示正常
- [ ] 作品、购买、收藏切换正常
- [ ] 登录/登出正常

### 性能测试
- [ ] 首页 TTFB < 500ms
- [ ] 广场页 TTFB < 500ms
- [ ] 个人中心 TTFB < 800ms
- [ ] LCP < 2s
- [ ] FCP < 1s
- [ ] TTI < 3s

### 兼容性测试
- [ ] Chrome（最新版）
- [ ] Safari（iOS + macOS）
- [ ] 微信内置浏览器
- [ ] 移动端响应式

## 📈 性能监控指标

### 关键指标
```bash
# 使用浏览器开发者工具 Network 面板
1. 首页首次加载
   - Document TTFB
   - DOMContentLoaded
   - Load

2. 缓存命中率
   - 刷新页面查看 304 或 disk cache

3. 数据库查询时间
   - 查看 Supabase Dashboard > Logs
```

### Vercel Analytics
访问 Vercel Dashboard > Analytics 查看:
- Real Experience Score
- Core Web Vitals
- 地域分布

## 🐛 故障排查

### 问题：Edge Runtime 报错
**症状**: `Error: ... is not supported in Edge Runtime`

**解决**:
1. 检查是否使用了 Node.js 专有 API
2. 改用 Web API 或移到 API Route

### 问题：ISR 缓存不生效
**症状**: 每次访问都是新请求

**排查**:
1. 检查 `revalidate` 是否正确导出
2. 查看响应头 `x-vercel-cache`
3. 确认没有使用 `no-cache` header

### 问题：数据库查询慢
**症状**: Profile 页面仍然很慢

**排查**:
1. 确认迁移已应用（检查索引）
2. 查看 Supabase Logs
3. 使用 `EXPLAIN ANALYZE` 分析查询

```sql
EXPLAIN ANALYZE 
SELECT * FROM items WHERE author_id = 'xxx';
```

## 📚 相关资源

- [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)
- [Vercel Edge Runtime](https://vercel.com/docs/functions/edge-functions)
- [Supabase Performance](https://supabase.com/docs/guides/platform/performance)
- [Web Vitals](https://web.dev/vitals/)

---

**更新时间**: 2025-12-06
**作者**: GitHub Copilot
**状态**: ✅ 代码已优化 | ⏳ 数据库迁移待应用 | 🚀 待部署测试
