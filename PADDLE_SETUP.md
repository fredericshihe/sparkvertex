# Paddle 支付集成配置指南

## 概述

本项目已集成 Paddle 支付系统，支持全球信用卡、PayPal 等多种支付方式。

## 环境变量配置

在 `.env.local` 中添加以下配置：

```bash
# Paddle 配置
# API Key (服务端使用，用于 API 调用和 Webhook 验签)
PADDLE_API_KEY=pdl_live_apikey_01kcgks6ms7m0dsxvnpacvdpkx_zBaaYyzZ1WG2zMt5RM3pfe_AcF

# Client-side Token (前端使用，用于初始化 Paddle.js)
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=live_774ff420902c0dfb48ca7da3756

# Webhook 签名密钥 (在 Paddle Dashboard 创建 Webhook 时获取)
PADDLE_WEBHOOK_SECRET=your_webhook_secret_here

# 环境设置 (production 或 sandbox)
NEXT_PUBLIC_PADDLE_ENVIRONMENT=production
```

## Price IDs 配置

已配置的价格套餐：

| 套餐 | 价格 | 积分 | Price ID |
|------|------|------|----------|
| 体验包 | ¥20 | 120 | `pri_01kcgzydjfrdf1eqfpym4t7hqm` |
| 创作者包 | ¥50 | 350 | `pri_01kch00w9w72wzh6tht09np39x` |
| 重度包 | ¥100 | 800 | `pri_01kch024613khh68yej04d7hpj` |
| 极客包 | ¥200 | 2000 | `pri_01kch02zrznhwxb2yb9as0cjtf` |

## Webhook 配置

1. 登录 [Paddle Dashboard](https://vendors.paddle.com/)
2. 进入 Developer Tools > Notifications
3. 点击 "Create Notification Destination"
4. 配置：
   - **URL**: `https://your-domain.com/api/webhook/paddle`
   - **Events**: 选择 `transaction.completed`
5. 复制生成的 Webhook Secret 到 `PADDLE_WEBHOOK_SECRET`

## 文件结构

```
lib/
  paddle.ts              # Paddle 配置和套餐定义

components/
  PaddleProvider.tsx     # Paddle.js 初始化组件
  CreditPurchaseModal.tsx # 购买积分弹窗 (已更新使用 Paddle)

app/
  (main)/
    layout.tsx           # 已添加 PaddleProvider
  api/
    webhook/
      paddle/
        route.ts         # Paddle Webhook 处理
```

## 工作流程

1. **用户选择套餐** → CreditPurchaseModal 显示套餐列表
2. **点击购买** → 调用 `Paddle.Checkout.open()` 打开支付弹窗
3. **支付成功** → Paddle 发送 Webhook 到 `/api/webhook/paddle`
4. **Webhook 处理** → 验证签名 → 创建订单记录 → 增加用户积分

## 测试

### 沙盒环境测试

1. 将 `NEXT_PUBLIC_PADDLE_ENVIRONMENT` 设置为 `sandbox`
2. 使用沙盒 API Key 和 Client Token
3. 使用 Paddle 提供的测试卡号

### 测试卡号

- 成功: `4242 4242 4242 4242`
- 失败: `4000 0000 0000 0002`

## 参考文档

- [Paddle.js 文档](https://developer.paddle.com/paddlejs/overview)
- [Client-side Tokens](https://developer.paddle.com/paddlejs/client-side-tokens)
- [API Keys](https://developer.paddle.com/api-reference/about/api-keys)
- [Webhook 验签](https://developer.paddle.com/webhooks/signature-verification)
