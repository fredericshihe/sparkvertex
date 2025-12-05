# 爱发电商品配置指南

## 第一步: 创建商品

1. 登录爱发电后台: https://afdian.net/dashboard/shop
2. 点击"创建商品"
3. 创建以下4个商品:

### 商品1: 基础版 - 120积分
- 商品名称: Spark Vertex 基础版 (120积分)
- 价格: ¥19.9
- 库存: 9999 (设置大一点防止售罄)
- 描述: 购买后自动充值120积分到您的账户

### 商品2: 标准版 - 350积分
- 商品名称: Spark Vertex 标准版 (350积分)
- 价格: ¥49.9
- 库存: 9999
- 描述: 购买后自动充值350积分到您的账户 (赠送15%)

### 商品3: 高级版 - 800积分
- 商品名称: Spark Vertex 高级版 (800积分)
- 价格: ¥99.9
- 库存: 9999
- 描述: 购买后自动充值800积分到您的账户 (赠送25%)

### 商品4: 旗舰版 - 2000积分
- 商品名称: Spark Vertex 旗舰版 (2000积分)
- 价格: ¥198
- 库存: 9999
- 描述: 购买后自动充值2000积分到您的账户 (赠送40%)

## 第二步: 获取商品ID

创建完每个商品后:
1. 点击商品右侧的"查看"或"分享"按钮
2. 复制商品链接,格式为: `https://afdian.com/item/{商品ID}`
3. 提取其中的商品ID部分

例如:
- 基础版商品链接: `https://afdian.com/item/abc123`
- 商品ID就是: `abc123`

## 第三步: 填入代码

编辑 `components/CreditPurchaseModal.tsx` 文件,找到 `PACKAGES` 数组,将商品ID填入对应的 `afdian_item_id` 字段:

```typescript
const PACKAGES = [
  { 
    id: 'basic',
    credits: 120,
    price: 19.9,
    afdian_item_id: 'abc123', // 👈 填入您的基础版商品ID
    afdian_plan_id: ''
  },
  { 
    id: 'standard',
    credits: 350,
    price: 49.9,
    afdian_item_id: 'def456', // 👈 填入您的标准版商品ID
    afdian_plan_id: ''
  },
  { 
    id: 'premium',
    credits: 800,
    price: 99.9,
    afdian_item_id: 'ghi789', // 👈 填入您的高级版商品ID
    afdian_plan_id: ''
  },
  { 
    id: 'ultimate',
    credits: 2000,
    price: 198.0,
    afdian_item_id: 'jkl012', // 👈 填入您的旗舰版商品ID
    afdian_plan_id: ''
  }
];
```

## 第四步: 配置环境变量

编辑 `.env.local` 文件,添加:

```bash
# 爱发电配置
AFDIAN_USER_ID=你的爱发电用户ID
# 从你的爱发电个人主页链接获取,例如: https://afdian.com/@your_username
# 用户ID可能是 @后面的用户名,或者数字ID

# Supabase配置 (用于Webhook接收)
SUPABASE_SERVICE_ROLE_KEY=你的Supabase Service Role Key
NEXT_PUBLIC_APP_URL=https://你的域名.com
```

### 如何获取 AFDIAN_USER_ID:
1. 登录爱发电
2. 访问你的个人主页: https://afdian.net/dashboard
3. 点击"我的主页"查看公开主页
4. 链接格式通常是: `https://afdian.com/@username` 或 `https://afdian.com/a/username`
5. 提取其中的 `username` 部分作为 USER_ID

## 第五步: 配置Webhook回调

1. 访问爱发电开发者设置: https://afdian.net/dashboard/dev
2. 找到"Webhook设置"
3. 填入Webhook URL: `https://你的域名.com/api/payment/afdian/notify`
4. 保存设置

## 第六步: 测试

1. 重启开发服务器: `npm run dev`
2. 打开网站,点击购买积分
3. 选择任意套餐,会跳转到爱发电商品页面
4. 使用测试账号完成支付
5. 检查是否收到Webhook回调并成功充值积分

## 注意事项

1. **透传参数**: 商品链接会自动附带 `remark` 参数 (订单号),用于回调时识别订单
2. **重复订单**: Webhook中已处理幂等性,同一订单多次回调只会充值一次
3. **签名验证**: 系统会验证爱发电的RSA签名,确保回调安全性
4. **日志查看**: 部署后可在服务器日志中查看Webhook接收情况

## 测试清单

- [ ] 4个商品已在爱发电后台创建
- [ ] 商品ID已正确填入代码
- [ ] 环境变量已配置
- [ ] Webhook URL已在爱发电后台设置
- [ ] 代码已部署到生产环境
- [ ] 测试支付流程正常
- [ ] Webhook回调能正确充值积分
