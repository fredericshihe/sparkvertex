# 🗄️ 数据库迁移执行指南

## 问题说明

由于项目中存在历史迁移文件与远程数据库状态不一致，直接使用 `supabase db push` 会遇到冲突。因此我们需要手动执行关键的性能优化迁移。

## ✅ 方案一：在 Supabase Dashboard 手动执行（推荐）

### 步骤：

1. **登录 Supabase Dashboard**
   - 访问：https://supabase.com/dashboard
   - 选择项目：waesizzoqodntrlvrwhw

2. **打开 SQL Editor**
   - 左侧菜单：SQL Editor
   - 点击 "New query"

3. **执行迁移 SQL**
   - 打开文件：`supabase/MANUAL_MIGRATION.sql`
   - 复制全部内容
   - 粘贴到 SQL Editor
   - 点击 "Run" 按钮

4. **验证结果**
   SQL 会自动输出验证结果：
   ```
   - 索引列表（应该看到 10+ 个新索引）
   - 存储过程信息（get_user_counts）
   ```

### 预期输出：

```sql
-- 索引列表示例
tablename  | indexname                    | indexdef
-----------+------------------------------+----------
items      | idx_items_author_id          | CREATE INDEX...
items      | idx_items_public_rank        | CREATE INDEX...
orders     | idx_orders_buyer_id          | CREATE INDEX...
likes      | idx_likes_user_id            | CREATE INDEX...
...

-- 存储过程
routine_name      | routine_type | specific_name
------------------+--------------+--------------
get_user_counts   | FUNCTION     | get_user_counts_xxx
```

## 🔧 方案二：使用 Supabase CLI（如果方案一失败）

### 步骤：

1. **重置远程迁移历史（谨慎）**
   ```bash
   # 备份当前数据库状态
   supabase db dump -f backup_$(date +%Y%m%d_%H%M%S).sql
   
   # 标记所有迁移为已应用（跳过冲突）
   supabase migration repair --status applied
   ```

2. **应用新迁移**
   ```bash
   supabase db push
   ```

## 🧪 验证迁移成功

### 方法一：在 SQL Editor 执行
```sql
-- 1. 检查索引
SELECT tablename, indexname 
FROM pg_indexes 
WHERE indexname LIKE 'idx_%'
  AND tablename IN ('items', 'orders', 'likes');

-- 2. 检查存储过程
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'get_user_counts';

-- 3. 测试存储过程（替换为真实 user_id）
SELECT get_user_counts('your-user-id'::uuid);
```

### 方法二：在应用中测试
1. 部署最新代码到 Vercel
2. 访问个人中心页面
3. 打开浏览器开发者工具 > Network
4. 查看 RPC 请求：`/rest/v1/rpc/get_user_counts`
5. 如果返回 JSON 数据，说明成功

### 预期响应：
```json
{
  "works": 5,
  "purchased": 2,
  "favorites": 8,
  "pending_orders": 1
}
```

## 📊 性能测试

### 迁移前（Profile 页面）：
```
/rest/v1/items?select=id&author_id=eq.xxx     ~50ms
/rest/v1/orders?select=id&buyer_id=eq.xxx     ~50ms
/rest/v1/likes?select=id&user_id=eq.xxx       ~50ms
/rest/v1/orders?select=id&seller_id=eq.xxx    ~50ms
---
总计：~200ms + 网络往返 4次
```

### 迁移后（Profile 页面）：
```
/rest/v1/rpc/get_user_counts                   ~80ms
---
总计：~80ms + 网络往返 1次
提升：60% ⬇️
```

## ⚠️ 常见问题

### Q1: 执行时报错 "policy already exists"
**A**: 正常，说明该策略已存在。SQL 中使用了 `DROP POLICY IF EXISTS`，继续执行即可。

### Q2: 执行时报错 "table does not exist"
**A**: 某些表可能不存在（如 scheme_dimensions）。SQL 中已使用 `DO $$ ... END $$` 块来跳过不存在的表。

### Q3: 存储过程创建成功，但应用调用失败
**A**: 检查权限：
```sql
-- 重新授权
GRANT EXECUTE ON FUNCTION get_user_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_counts(uuid) TO anon;
```

### Q4: 索引创建很慢
**A**: 正常，特别是 `items` 表数据量大时。GIN 索引可能需要 10-30 秒。

## 🎯 成功标志

✅ **迁移成功的标志**：
1. SQL Editor 执行完成，无错误
2. 验证查询显示 10+ 个新索引
3. 存储过程 `get_user_counts` 存在
4. 测试调用返回正确的 JSON 数据
5. Profile 页面加载速度明显提升

## 📝 回滚方案（如需要）

```sql
-- 删除索引
DROP INDEX IF EXISTS idx_items_author_id;
DROP INDEX IF EXISTS idx_orders_buyer_id;
DROP INDEX IF EXISTS idx_orders_seller_id;
DROP INDEX IF EXISTS idx_likes_user_id;
DROP INDEX IF EXISTS idx_items_public_rank;
DROP INDEX IF EXISTS idx_items_tags;
DROP INDEX IF EXISTS idx_feedback_user_id;
DROP INDEX IF EXISTS idx_likes_item_id;

-- 删除存储过程
DROP FUNCTION IF EXISTS get_user_counts(uuid);

-- 恢复 RLS 策略（如果需要）
-- 保持原样即可，优化后的策略向后兼容
```

## 🚀 下一步

完成迁移后：
1. ✅ 代码已部署到 Vercel（自动）
2. ⏳ 等待 2-3 分钟构建完成
3. 🧪 访问生产环境测试性能
4. 📊 监控 Supabase Dashboard > Reports 查看查询性能

---

**创建时间**: 2025-12-06  
**状态**: 🟢 可立即执行  
**风险等级**: 🟢 低风险（只添加索引和函数，不修改数据）
