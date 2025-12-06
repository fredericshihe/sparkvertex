#!/bin/bash
# 安全修复快速部署脚本
# 执行前请确保已备份数据库

set -e  # 遇到错误立即退出

echo "🔐 开始部署支付系统安全修复..."
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 步骤 1: 检查必需的环境变量
echo "📋 步骤 1/5: 检查环境变量..."
REQUIRED_VARS=(
  "NEXT_PUBLIC_SUPABASE_URL"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  "SUPABASE_SERVICE_ROLE_KEY"
  "AFDIAN_USER_ID"
  "AFDIAN_PUBLIC_KEY"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING_VARS+=("$var")
  fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo -e "${RED}❌ 缺少必需的环境变量:${NC}"
  printf '%s\n' "${MISSING_VARS[@]}"
  exit 1
fi

echo -e "${GREEN}✅ 所有必需环境变量已配置${NC}"
echo ""

# 步骤 2: 生成 CRON_SECRET（如果不存在）
echo "🔑 步骤 2/5: 配置 CRON_SECRET..."
if [ -z "$CRON_SECRET" ]; then
  echo -e "${YELLOW}⚠️  CRON_SECRET 未设置，正在生成...${NC}"
  CRON_SECRET=$(openssl rand -base64 32)
  echo "CRON_SECRET=$CRON_SECRET"
  echo ""
  echo -e "${YELLOW}请将上述密钥添加到 Vercel 环境变量中:${NC}"
  echo "vercel env add CRON_SECRET production"
  echo ""
  read -p "按回车键继续..."
else
  echo -e "${GREEN}✅ CRON_SECRET 已配置${NC}"
fi
echo ""

# 步骤 3: 安装依赖
echo "📦 步骤 3/5: 检查依赖..."
if [ -f "package.json" ]; then
  # 检查是否需要更新依赖
  if ! grep -q "crypto" package.json 2>/dev/null; then
    echo "crypto 是 Node.js 内置模块，无需安装"
  fi
  echo -e "${GREEN}✅ 依赖检查完成${NC}"
else
  echo -e "${RED}❌ 找不到 package.json${NC}"
  exit 1
fi
echo ""

# 步骤 4: 数据库迁移提示
echo "🗄️  步骤 4/5: 数据库迁移..."
echo ""
echo -e "${YELLOW}请手动执行以下步骤:${NC}"
echo "1. 登录 Supabase Dashboard"
echo "2. 进入 SQL Editor"
echo "3. 执行文件: supabase/migrations/20251206_security_fixes.sql"
echo "4. 验证函数创建成功:"
echo ""
echo "   SELECT proname FROM pg_proc WHERE proname LIKE 'process_credit%';"
echo "   SELECT proname FROM pg_proc WHERE proname LIKE 'retry_pending%';"
echo "   SELECT proname FROM pg_proc WHERE proname LIKE 'cleanup_expired%';"
echo ""
read -p "迁移完成后按回车键继续..."
echo ""

# 步骤 5: 部署到 Vercel
echo "🚀 步骤 5/5: 准备部署..."
echo ""
echo "部署前检查清单:"
echo "  [x] 环境变量配置完成"
echo "  [x] 数据库迁移完成"
echo "  [ ] Git 提交代码"
echo "  [ ] Vercel 部署"
echo ""

# 检查是否有未提交的更改
if [ -d ".git" ]; then
  if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo -e "${YELLOW}⚠️  检测到未提交的更改${NC}"
    echo ""
    echo "修改的文件:"
    git status --short
    echo ""
    read -p "是否提交并推送? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      echo "正在提交更改..."
      git add app/api/payment/ components/CreditPurchaseModal.tsx lib/rate-limit.ts
      git add app/api/cron/ supabase/migrations/20251206_security_fixes.sql
      git add vercel.json .env.cron.example SECURITY_FIXES.md
      git commit -m "feat: implement P0-P2 security fixes for payment system

- P0: Add strict amount validation with price mapping
- P0: Implement atomic transactions with row-level locking
- P0: Add retry mechanism for pending_credits orders
- P1: Add rate limiting to prevent API abuse
- P1: Use cryptographically secure random for order IDs
- P1: Add order expiration mechanism (24h)
- P2: Improve timeout handling with manual refresh
- P2: Optimize logging to remove sensitive info
- P2: Add health monitoring with alerting

Security fixes include:
- Prevent amount tampering attacks
- Eliminate concurrent duplicate credit additions
- Automatic retry for failed credit updates
- Rate limit: 5 req/min for create, 30 req/min for check-status
- Secure random order IDs (crypto.randomBytes)
- Auto-cleanup expired orders daily
- Manual payment status check button
- Payment health monitoring every 15min"
      
      git push
      echo -e "${GREEN}✅ 代码已推送到远程仓库${NC}"
    fi
  else
    echo -e "${GREEN}✅ 没有未提交的更改${NC}"
  fi
fi
echo ""

# 部署提示
echo "📤 最后步骤: Vercel 部署"
echo ""
echo "1. 自动部署（推荐）:"
echo "   - Vercel 会自动检测 Git 推送并部署"
echo "   - 等待几分钟后检查部署状态"
echo ""
echo "2. 手动部署:"
echo "   vercel --prod"
echo ""
echo "3. 部署后验证:"
echo "   a. 检查 Cron 任务状态: Vercel Dashboard > Cron"
echo "   b. 测试健康检查:"
echo "      curl -H \"Authorization: Bearer \$CRON_SECRET\" \\"
echo "        https://your-domain.com/api/cron/health-check"
echo ""
echo "   c. 测试支付流程（建议使用测试账号）"
echo ""

# 测试脚本
echo "🧪 测试命令:"
echo ""
echo "# 测试 Cron 端点（需要先设置 DOMAIN 和 CRON_SECRET）"
cat << 'EOF'
DOMAIN="your-domain.com"
CRON_SECRET="your-cron-secret"

# 健康检查
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://$DOMAIN/api/cron/health-check | jq

# 重试失败订单
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://$DOMAIN/api/cron/retry-credits | jq

# 清理过期订单
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://$DOMAIN/api/cron/cleanup-orders | jq
EOF
echo ""

echo -e "${GREEN}✅ 部署准备完成！${NC}"
echo ""
echo "📚 更多信息请查看: SECURITY_FIXES.md"
echo ""
