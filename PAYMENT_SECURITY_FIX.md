# 支付安全修复说明

## 已修复的高危问题

### 1. ✅ 重复支付检查加强
**问题**: 只检查 `out_trade_no`，爱发电可能用不同 ID 多次推送  
**修复**:
- 同时检查 `out_trade_no`（我们的订单号）和 `trade_no`（爱发电交易号）
- 使用 `.or()` 查询确保两者都不会重复
- 数据库层面添加 `trade_no` 唯一约束
- 检测到重复订单时返回 200（幂等性保证）

```sql
-- 数据库约束
ALTER TABLE credit_orders ADD CONSTRAINT unique_trade_no UNIQUE (trade_no);
```

### 2. ✅ 积分更新失败处理
**问题**: 订单标记为 paid 后，如果积分更新失败会导致用户付钱但没积分  
**修复**:
- 先创建订单，再更新积分
- 如果积分更新失败，将订单状态改为 `pending_credits`
- 创建重试脚本 `scripts/retry-pending-credits.js` 定期处理失败的订单
- 检测到 23505 错误码（唯一约束冲突）时正确处理为重复订单

**使用重试脚本**:
```bash
node scripts/retry-pending-credits.js
```

### 3. ✅ 环境变量校验
**问题**: 使用 `!` 断言，配置错误会导致运行时崩溃  
**修复**:
- 在 `notify/route.ts` 和 `create/route.ts` 开头验证所有必需的环境变量
- 缺失时返回明确的错误信息和 500 状态码
- 添加详细日志便于排查配置问题

**必需的环境变量**:
```env
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
AFDIAN_USER_ID=xxx
AFDIAN_PUBLIC_KEY=xxx
```

### 4. ✅ 金额验证
**问题**: 没有验证爱发电返回的金额是否与套餐价格一致  
**修复**:
- 根据 credits 反推期望金额
- 验证实际支付金额与期望金额的差值不超过 ¥0.5
- 金额不匹配时拒绝请求（返回 400）

**价格映射表**:
```typescript
const priceMapping = {
  1: 19.9,      // Basic
  350: 49.9,    // Standard
  800: 99.9,    // Premium
  2000: 198.0   // Ultimate
};
```

## 额外的安全改进

### 5. 用户存在性验证
- 在创建订单前验证用户 profile 是否存在
- 避免为不存在的用户创建订单

### 6. 签名验证逻辑优化
- 只对明确的测试请求返回 200（`afdian_test_order` 或 `test_` 开头）
- 其他所有验签失败的请求都拒绝

### 7. 浮点数精度问题修复
- `creditMapping` 使用字符串 key 而非浮点数
- 使用 `toFixed(1)` 确保精确匹配

### 8. 日志安全性
- 生产环境不记录完整 payload，避免泄露敏感信息
- 开发环境保留详细日志便于调试

## 数据库变更

需要运行的迁移文件:
```bash
supabase/migrations/20251206_fix_payment_security.sql
```

迁移内容:
- ✅ 添加 `trade_no` 唯一约束
- ✅ 添加索引优化查询性能
- ✅ 确保 `payment_info` 列存在（存储审计数据）

## 部署检查清单

在 Vercel 部署后，请确认:

- [ ] 所有环境变量已正确配置
- [ ] 数据库迁移已成功执行
- [ ] Webhook URL 已在爱发电后台配置
- [ ] 使用测试订单验证签名验证
- [ ] 使用真实订单（小额）测试完整流程
- [ ] 检查 Vercel 日志确认没有错误

## 监控建议

建议添加以下监控:

1. **积分不一致监控**: 定期检查 `pending_credits` 状态的订单
2. **重复订单监控**: 监控 23505 错误的频率
3. **金额验证失败监控**: 监控 400 错误（amount mismatch）
4. **签名验证失败监控**: 监控异常的验签失败请求

## 已知限制

1. **事务支持**: Supabase JS SDK 不支持显式事务，目前使用"先创建订单，失败时回滚到 pending_credits"的策略
2. **并发控制**: 依赖数据库唯一约束，高并发下可能有短暂的竞争窗口
3. **重试机制**: 需要手动运行脚本或配置 cron job

## 下一步优化建议

1. **自动重试**: 配置 Vercel Cron 每小时运行一次 `retry-pending-credits.js`
2. **Webhook 重试**: 添加对爱发电 Webhook 重试的处理
3. **订单清理**: 定期清理超过 7 天的 `pending` 订单
4. **告警系统**: 集成 Sentry 或类似服务监控支付异常

---

**修复时间**: 2025-12-06  
**影响范围**: 支付流程的核心安全逻辑  
**测试状态**: 需要在生产环境使用小额测试订单验证
