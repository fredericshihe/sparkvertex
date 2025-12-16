# 支付宝支付配置指南

## 概述

本项目已集成支付宝电脑网站支付（PC Web Payment），用于积分充值功能。

## 配置步骤

### 1. 支付宝开放平台配置

#### 1.1 创建应用
1. 登录 [支付宝开放平台](https://open.alipay.com/)
2. 进入 **控制台** → **网页&移动应用**
3. 创建应用并填写基本信息

#### 1.2 签约电脑网站支付
1. 在应用详情页，找到 **产品列表**
2. 搜索 **电脑网站支付**，点击 **立即签约**
3. 填写网站信息：
   - 网站地址：`https://sparkvertex.cn`
   - ICP备案号：需与支付宝账号主体一致
   - 网站类型：选择对应类型
4. 等待审核通过（通常1-3个工作日）

#### 1.3 配置密钥
1. 进入应用详情 → **开发设置**
2. **接口加签方式** 选择 **公钥**
3. 生成RSA密钥对（推荐使用 RSA2 2048位）
   - 可使用支付宝提供的 [密钥生成工具](https://opendocs.alipay.com/common/02khjo)
   - 或使用 OpenSSL 命令生成
4. 上传应用公钥，获取支付宝公钥

#### 1.4 配置回调地址
1. 在 **开发设置** 中配置：
   - **异步通知地址**：`https://sparkvertex.cn/api/payment/alipay/notify`
   - **同步返回地址**：`https://sparkvertex.cn/profile?payment=success`

### 2. 环境变量配置

在 `.env.local`（本地）和生产环境中配置以下变量：

\`\`\`bash
# 支付宝配置
ALIPAY_APP_ID=你的应用ID
ALIPAY_PRIVATE_KEY=应用私钥（去除头尾和换行）
ALIPAY_PUBLIC_KEY=支付宝公钥（去除头尾和换行）
NEXT_PUBLIC_APP_URL=https://sparkvertex.cn
\`\`\`

**注意事项：**
- 私钥和公钥需要去除 `-----BEGIN/END-----` 头尾
- 去除所有换行符，保持为单行字符串
- 生产环境务必使用正式环境的密钥

### 3. 数据库配置

运行数据库迁移脚本：

\`\`\`sql
-- 在 Supabase SQL Editor 中执行
CREATE OR REPLACE FUNCTION process_payment(
  p_order_id UUID,
  p_user_id UUID,
  p_credits INT,
  p_trade_no TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE orders
  SET 
    status = 'completed',
    trade_no = p_trade_no,
    updated_at = NOW()
  WHERE id = p_order_id
    AND status = 'pending';

  UPDATE profiles
  SET 
    credits = credits + p_credits,
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;
\`\`\`

### 4. 支付流程

#### 4.1 用户支付流程
1. 用户点击购买积分套餐
2. 前端调用 `/api/payment/alipay/create` 创建订单
3. 后端返回支付宝支付页面URL
4. 跳转到支付宝完成支付
5. 支付完成后，支付宝异步通知我们的服务器
6. 服务器验证签名后，更新订单状态并充值积分

#### 4.2 异步通知处理
- 接口：`/api/payment/alipay/notify`
- 验证签名（防止伪造请求）
- 验证订单金额
- 更新订单状态
- 充值用户积分
- 返回 `success` 给支付宝

### 5. 测试

#### 5.1 沙箱测试
1. 使用支付宝沙箱环境测试
2. 修改 `lib/alipay.ts` 中的 `gateway` 为沙箱地址
3. 使用沙箱账号和密钥

\`\`\`typescript
gateway: 'https://openapi.alipaydev.com/gateway.do', // 沙箱环境
\`\`\`

#### 5.2 生产测试
1. 使用小额订单测试（如20元套餐）
2. 检查日志确认流程正常
3. 验证积分是否正确到账

### 6. 费率

- **单笔费率**：0.6%
- **结算周期**：实时到账（新商户可能需次日结算）
- **退款政策**：12个月内可退款，手续费不退

### 7. 常见问题

#### Q1: 签名验证失败
- 检查私钥和公钥是否正确配置
- 确认密钥格式（去除头尾和换行）
- 检查是否使用了正确的加签方式（RSA2）

#### Q2: 异步通知未收到
- 检查异步通知URL是否可公网访问
- 查看支付宝商家后台的通知日志
- 确认服务器防火墙未屏蔽支付宝IP

#### Q3: 订单金额不匹配
- 确认前端传递的金额正确
- 检查货币单位（元，保留2位小数）

## 技术架构

### 代码文件

1. **配置文件**
   - `lib/alipay.ts` - 支付宝SDK初始化
   - `lib/alipay-config.ts` - 积分套餐配置

2. **API接口**
   - `app/api/payment/alipay/create/route.ts` - 创建支付订单
   - `app/api/payment/alipay/notify/route.ts` - 异步通知处理

3. **前端组件**
   - `components/CreditPurchaseModal.tsx` - 充值弹窗

4. **数据库**
   - `supabase/migrations/20250116_process_payment_function.sql` - 支付处理函数

### 数据流

\`\`\`
用户选择套餐 
  → 前端调用创建订单API 
  → 生成订单记录（status: pending）
  → 返回支付宝支付URL
  → 用户跳转到支付宝页面
  → 用户完成支付
  → 支付宝异步通知我们的服务器
  → 验证签名和金额
  → 调用 process_payment 函数
  → 更新订单状态为 completed
  → 充值用户积分
  → 返回 success 给支付宝
\`\`\`

## 安全建议

1. **私钥安全**：绝不在前端暴露私钥
2. **签名验证**：必须验证支付宝的异步通知签名
3. **金额校验**：严格校验订单金额
4. **幂等性**：防止重复通知导致重复充值
5. **日志记录**：记录所有支付相关操作，便于排查问题

## 监控与日志

建议监控以下指标：
- 支付成功率
- 异步通知到达率
- 订单处理时长
- 失败订单数量

查看日志：
\`\`\`bash
# 生产环境
pm2 logs sparkvertex | grep "Alipay"
\`\`\`

## 参考文档

- [电脑网站支付产品介绍](https://opendocs.alipay.com/open/270/105898)
- [电脑网站支付API](https://opendocs.alipay.com/open/270/alipay.trade.page.pay)
- [异步通知说明](https://opendocs.alipay.com/open/270/105902)
- [签名验证](https://opendocs.alipay.com/common/02mse3)
