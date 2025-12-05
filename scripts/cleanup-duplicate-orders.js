#!/usr/bin/env node
/**
 * 清理重复的 pending 订单
 * Usage: node scripts/cleanup-duplicate-orders.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 从 .env.local 读取配置
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function cleanupDuplicateOrders() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  清理重复的待支付订单');
  console.log('═══════════════════════════════════════════════════\n');

  // 1. 查找所有重复的 pending 订单
  console.log('📊 步骤 1: 检查重复订单...\n');
  
  const { data: allPendingOrders, error: fetchError } = await supabase
    .from('credit_orders')
    .select('id, out_trade_no, user_id, amount, created_at')
    .eq('status', 'pending')
    .eq('provider', 'afdian')
    .order('created_at', { ascending: false });

  if (fetchError) {
    console.error('❌ 查询失败:', fetchError);
    process.exit(1);
  }

  // 按 user_id + amount 分组找重复
  const groups = {};
  allPendingOrders.forEach(order => {
    const key = `${order.user_id}_${order.amount}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(order);
  });

  const duplicateGroups = Object.entries(groups).filter(([_, orders]) => orders.length > 1);

  if (duplicateGroups.length === 0) {
    console.log('✅ 没有发现重复的订单，可以直接创建唯一性约束！\n');
    console.log('请在 Supabase SQL Editor 执行：');
    console.log('https://supabase.com/dashboard/project/waesizzoqodntrlvrwhw/sql\n');
    console.log('-- 添加元数据字段');
    console.log('ALTER TABLE credit_orders ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT \'{}\'::jsonb;\n');
    console.log('-- 创建唯一性约束');
    console.log('CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_orders_user_amount_pending');
    console.log('ON credit_orders(user_id, amount, provider) WHERE status = \'pending\';\n');
    return;
  }

  console.log(`🚨 发现 ${duplicateGroups.length} 组重复订单：\n`);

  duplicateGroups.forEach(([key, orders], index) => {
    console.log(`组 ${index + 1}:`);
    console.log(`  用户: ${orders[0].user_id}`);
    console.log(`  金额: ¥${orders[0].amount}`);
    console.log(`  订单数: ${orders.length}`);
    console.log('  订单详情:');
    orders.forEach((order, i) => {
      console.log(`    ${i + 1}. ${order.out_trade_no} (创建于: ${order.created_at})`);
    });
    console.log('');
  });

  console.log('📋 清理策略: 保留最新的订单，将其他标记为 expired\n');

  // 2. 执行清理
  console.log('🔧 步骤 2: 执行清理...\n');

  let expiredCount = 0;
  for (const [_, orders] of duplicateGroups) {
    // 按创建时间排序，保留第一个（最新），标记其他为 expired
    const toExpire = orders.slice(1);
    
    for (const order of toExpire) {
      console.log(`  标记为 expired: ${order.out_trade_no}`);
      
      const { error: updateError } = await supabase
        .from('credit_orders')
        .update({ 
          status: 'expired',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (updateError) {
        console.error(`  ❌ 更新失败:`, updateError);
      } else {
        expiredCount++;
      }
    }
  }

  console.log(`\n✅ 清理完成！已标记 ${expiredCount} 个订单为 expired\n`);

  // 3. 验证清理结果
  console.log('📊 步骤 3: 验证清理结果...\n');

  const { data: remainingOrders } = await supabase
    .from('credit_orders')
    .select('id, out_trade_no, user_id, amount')
    .eq('status', 'pending')
    .eq('provider', 'afdian');

  const remainingGroups = {};
  remainingOrders.forEach(order => {
    const key = `${order.user_id}_${order.amount}`;
    if (!remainingGroups[key]) {
      remainingGroups[key] = [];
    }
    remainingGroups[key].push(order);
  });

  const stillDuplicated = Object.entries(remainingGroups).filter(([_, orders]) => orders.length > 1);

  if (stillDuplicated.length === 0) {
    console.log('✅ 验证通过！所有重复订单已清理\n');
    console.log('═══════════════════════════════════════════════════');
    console.log('  下一步：创建唯一性约束');
    console.log('═══════════════════════════════════════════════════\n');
    console.log('在 Supabase SQL Editor 执行以下 SQL：');
    console.log('https://supabase.com/dashboard/project/waesizzoqodntrlvrwhw/sql\n');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20251205_fix_order_matching.sql'),
      'utf8'
    );
    console.log(migrationSQL);
  } else {
    console.log('⚠️  仍有重复订单，需要手动检查：');
    stillDuplicated.forEach(([key, orders]) => {
      console.log(`  ${key}: ${orders.length} 个订单`);
    });
  }
}

cleanupDuplicateOrders().catch(console.error);
