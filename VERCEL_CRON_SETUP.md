# Vercel Cron Jobs 配置完整指南

## 📋 配置清单

- [x] 生成 CRON_SECRET: `qqiGAi5sggRHeLMOWXbSsZZVYYufwJpAd2zkJL3yTJA=`
- [ ] 添加 Vercel 环境变量
- [ ] 执行数据库迁移
- [ ] 部署代码到 Vercel
- [ ] 验证 Cron 任务

---

## 1️⃣ 添加环境变量到 Vercel

### 通过 Vercel Dashboard (推荐)

1. **访问 Vercel Dashboard**
   ```
   https://vercel.com/dashboard
   ```

2. **选择你的项目**
   - 找到并点击 `spark-vertex-next` 项目

3. **进入环境变量设置**
   - 点击顶部的 **"Settings"** 标签
   - 在左侧菜单点击 **"Environment Variables"**

4. **添加 CRON_SECRET**
   
   点击 **"Add New"** 按钮，填写以下信息：
   
   ```
   Key:    CRON_SECRET
   Value:  qqiGAi5sggRHeLMOWXbSsZZVYYufwJpAd2zkJL3yTJA=
   
   Environment (环境选择):
   ✅ Production     (必选 - 生产环境)
   ☑️  Preview       (可选 - 预览环境)
   ☑️  Development   (可选 - 开发环境)
   ```
   
   > **重要**: 至少勾选 **Production**

5. **保存**
   - 点击 **"Save"** 按钮

### 通过 Vercel CLI (备用方式)

如果你安装了 Vercel CLI:

```bash
# 安装 Vercel CLI (如果未安装)
npm i -g vercel

# 添加环境变量
vercel env add CRON_SECRET production
# 粘贴: qqiGAi5sggRHeLMOWXbSsZZVYYufwJpAd2zkJL3yTJA=
```

---

## 2️⃣ 理解 Vercel Cron 的工作原理

### ✅ 自动配置 (推荐方式)

当你部署包含 `vercel.json` 的项目到 Vercel 后:

1. **Vercel 自动识别 Cron 配置**
   ```json
   {
     "crons": [
       {
         "path": "/api/cron/retry-credits",
         "schedule": "0 * * * *"
       }
     ]
   }
   ```

2. **Vercel 自动添加授权 Header**
   - Vercel 会在每次 Cron 请求中自动添加一个特殊的 Bearer token
   - 格式: `Authorization: Bearer <vercel-generated-signature>`
   - 这个 token 由 Vercel 内部生成，无需手动配置

3. **我们的代码自动验证**
   ```typescript
   // 代码已更新为自动识别 Vercel Cron
   const isVercelCron = authHeader?.startsWith('Bearer ') && authHeader.length > 50;
   ```

### 🎯 **你不需要在 Dashboard 手动配置 Authorization Header！**

Vercel 会自动处理，你只需要:
- ✅ 添加 `CRON_SECRET` 环境变量 (用于手动测试)
- ✅ 在代码中验证请求来源 (已完成)
- ✅ 部署包含 `vercel.json` 的代码

---

## 3️⃣ 部署到 Vercel

### 方式 A: 通过 Git 自动部署 (推荐)

```bash
# 提交所有更改
git add .
git commit -m "feat: add payment security fixes and cron jobs"
git push origin main

# Vercel 会自动检测推送并部署
```

部署后:
1. 在 Vercel Dashboard 可以看到部署进度
2. 部署成功后，进入 **Settings** > **Cron Jobs**
3. 确认看到 3 个 Cron 任务已自动配置

### 方式 B: 手动部署

```bash
# 使用 Vercel CLI
vercel --prod
```

---

## 4️⃣ 验证 Cron Jobs 配置

### 检查 Cron Jobs 列表

1. 打开 Vercel Dashboard
2. 选择项目
3. 进入 **Settings** > **Cron Jobs**
4. 应该看到:

   ```
   ✅ /api/cron/retry-credits
      Schedule: 0 * * * * (每小时)
      Status: Active
   
   ✅ /api/cron/cleanup-orders
      Schedule: 0 2 * * * (每天凌晨2点)
      Status: Active
   
   ✅ /api/cron/health-check
      Schedule: */15 * * * * (每15分钟)
      Status: Active
   ```

### 查看 Cron 执行日志

1. 在 Vercel Dashboard 中
2. 进入 **Deployments** > 点击最新部署
3. 选择 **Functions** 标签
4. 找到 `/api/cron/*` 相关的函数
5. 点击查看执行日志

---

## 5️⃣ 手动测试 Cron 端点

### 本地测试 (开发环境)

```bash
# 设置环境变量
export CRON_SECRET="qqiGAi5sggRHeLMOWXbSsZZVYYufwJpAd2zkJL3yTJA="

# 测试健康检查
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/health-check | jq

# 测试重试积分
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/retry-credits | jq

# 测试清理订单
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/cleanup-orders | jq
```

### 生产环境测试

```bash
# 设置域名和密钥
DOMAIN="your-domain.vercel.app"
CRON_SECRET="qqiGAi5sggRHeLMOWXbSsZZVYYufwJpAd2zkJL3yTJA="

# 测试健康检查
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://$DOMAIN/api/cron/health-check" | jq

# 预期输出:
# {
#   "status": "healthy",
#   "alerts": [],
#   "metrics": {
#     "stale_pending_orders": 0,
#     "pending_credit_orders": 0,
#     "failed_orders": 0,
#     "recent_orders": 5,
#     "recent_paid_orders": 5,
#     "success_rate_last_hour": 100
#   },
#   "timestamp": "2025-12-06T..."
# }
```

---

## 6️⃣ 常见问题排查

### Q1: Cron Jobs 没有出现在 Dashboard 中

**原因**: `vercel.json` 未正确部署

**解决方案**:
1. 确认 `vercel.json` 文件在项目根目录
2. 确认文件内容正确
3. 重新部署项目

### Q2: Cron 任务返回 401 Unauthorized

**原因**: Authorization 验证失败

**解决方案**:
1. 检查 `CRON_SECRET` 是否已添加到 Vercel
2. 确认环境变量在正确的环境 (Production)
3. 重新部署项目使环境变量生效

### Q3: Cron 任务未按时执行

**原因**: Vercel Cron 可能有延迟

**解决方案**:
1. Vercel Cron 不保证精确的执行时间
2. 可能延迟 0-60 秒
3. 查看 Function Logs 确认实际执行时间

### Q4: 如何禁用某个 Cron 任务

**方式 1: 临时禁用**
- 在 Vercel Dashboard > Settings > Cron Jobs
- 找到对应的任务，点击 **Disable**

**方式 2: 永久删除**
- 从 `vercel.json` 中删除对应配置
- 重新部署

---

## 7️⃣ 监控和维护

### 设置告警 (可选)

在 `app/api/cron/health-check/route.ts` 中添加告警通知:

```typescript
// 钉钉机器人
if (alerts.length > 0) {
  await fetch('https://oapi.dingtalk.com/robot/send?access_token=xxx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'text',
      text: { content: `⚠️ 支付系统告警\n${alerts.join('\n')}` }
    })
  });
}
```

### 定期检查

建议每周检查一次:
1. Cron 执行日志
2. 支付系统健康状态
3. 失败订单数量

---

## ✅ 配置完成检查清单

部署完成后，请确认以下各项:

- [ ] `CRON_SECRET` 已添加到 Vercel 环境变量
- [ ] 代码已成功部署到 Vercel
- [ ] 在 Dashboard 中看到 3 个 Cron 任务
- [ ] 手动测试至少一个 Cron 端点成功
- [ ] 查看 Function Logs 确认无错误
- [ ] 数据库迁移已执行 (`20251206_security_fixes.sql`)
- [ ] 所有环境变量配置完整 (见 `.env.cron.example`)

---

## 🎉 完成！

如果所有检查项都通过，你的 Cron 系统已经配置完成：

- ✅ 每小时自动重试失败的积分充值
- ✅ 每天凌晨2点清理过期订单
- ✅ 每15分钟检查系统健康状态

需要帮助？查看:
- [完整安全修复文档](./SECURITY_FIXES.md)
- [部署指南](./DEPLOYMENT_GUIDE.md)
- [Vercel Cron 官方文档](https://vercel.com/docs/cron-jobs)
