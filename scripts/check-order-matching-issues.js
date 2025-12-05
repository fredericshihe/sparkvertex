#!/usr/bin/env node
/**
 * 检测和报告潜在的订单匹配问题
 * Usage: node scripts/check-order-matching-issues.js
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

async function checkMatchingIssues() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  订单匹配问题检测工具');
  console.log('═══════════════════════════════════════════════════\n');

  // 1. 检测多个相同金额的 pending 订单
  console.log('📊 检查 1: 相同金额的待支付订单...');
  const { data: duplicateAmountOrders, error: dupError } = await supabase
    .rpc('check_duplicate_amount_orders');

  if (dupError && dupError.code !== '42883') {
    console.log('⚠️  无法执行检查（函数不存在），跳过...\n');
  } else if (duplicateAmountOrders && duplicateAmountOrders.length > 0) {
    console.log('🚨 发现 ' + duplicateAmountOrders.length + ' 组相同金额的待支付订单:');
    duplicateAmountOrders.forEach(group => {
      console.log(`   金额: ¥${group.amount}, 订单数: ${group.count}`);
    });
    console.log('');
  } else {
    console.log('✅ 未发现相同金额的待支付订单\n');
  }

  // 2. 检测通过 fallback 策略匹配的订单
  console.log('📊 检查 2: 高风险匹配的订单...');
  const { data: fallbackOrders, error: fbError } = await supabase
    .from('credit_orders')
    .select('id, out_trade_no, trade_no, amount, status, created_at, updated_at, metadata')
    .eq('status', 'paid')
    .contains('metadata', { match_method: 'amount_time_fallback' })
    .order('updated_at', { ascending: false })
    .limit(10);

  if (fbError) {
    console.log('⚠️  查询失败:', fbError.message, '\n');
  } else if (fallbackOrders && fallbackOrders.length > 0) {
    console.log('⚠️  发现 ' + fallbackOrders.length + ' 个通过 fallback 匹配的订单:');
    fallbackOrders.forEach(order => {
      console.log(`   订单号: ${order.out_trade_no}`);
      console.log(`   金额: ¥${order.amount}`);
      console.log(`   支付时间: ${order.updated_at}`);
      console.log(`   风险: 可能匹配错误\n`);
    });
  } else {
    console.log('✅ 未发现高风险匹配的订单\n');
  }

  // 3. 检测未匹配的 webhook
  console.log('📊 检查 3: 未匹配的支付 webhook...');
  const { data: unmatchedWebhooks, error: umError } = await supabase
    .from('credit_orders')
    .select('id, out_trade_no, trade_no, amount, created_at, payment_info, metadata')
    .eq('status', 'failed')
    .like('out_trade_no', 'UNMATCHED_%')
    .order('created_at', { ascending: false })
    .limit(10);

  if (umError) {
    console.log('⚠️  查询失败:', umError.message, '\n');
  } else if (unmatchedWebhooks && unmatchedWebhooks.length > 0) {
    console.log('🚨 发现 ' + unmatchedWebhooks.length + ' 个未匹配的支付 webhook:');
    unmatchedWebhooks.forEach(webhook => {
      const afdianInfo = webhook.payment_info || {};
      console.log(`   爱发电订单号: ${webhook.trade_no}`);
      console.log(`   金额: ¥${webhook.amount}`);
      console.log(`   用户: ${afdianInfo.user_name || 'N/A'}`);
      console.log(`   时间: ${webhook.created_at}`);
      console.log(`   原因: ${webhook.metadata?.error || 'Unknown'}\n`);
    });
    
    console.log('💡 建议: 这些支付可能需要手动核对并补发积分\n');
  } else {
    console.log('✅ 未发现未匹配的 webhook\n');
  }

  // 4. 检测长时间 pending 的订单
  console.log('📊 检查 4: 超过 30 分钟的待支付订单...');
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: stalePendingOrders, error: spError } = await supabase
    .from('credit_orders')
    .select('id, out_trade_no, user_id, amount, created_at')
    .eq('status', 'pending')
    .eq('provider', 'afdian')
    .lt('created_at', thirtyMinutesAgo)
    .order('created_at', { ascending: true })
    .limit(20);

  if (spError) {
    console.log('⚠️  查询失败:', spError.message, '\n');
  } else if (stalePendingOrders && stalePendingOrders.length > 0) {
    console.log('⏰ 发现 ' + stalePendingOrders.length + ' 个超时的待支付订单:');
    stalePendingOrders.forEach(order => {
      const ageMinutes = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
      console.log(`   订单号: ${order.out_trade_no}`);
      console.log(`   金额: ¥${order.amount}`);
      console.log(`   创建时间: ${order.created_at} (${ageMinutes} 分钟前)`);
      console.log('');
    });
    
    console.log('💡 建议: 考虑将这些订单标记为 expired 或 cancelled\n');
  } else {
    console.log('✅ 未发现超时的待支付订单\n');
  }

  console.log('═══════════════════════════════════════════════════');
  console.log('  检测完成');
  console.log('═══════════════════════════════════════════════════');
}

checkMatchingIssues().catch(console.error);
