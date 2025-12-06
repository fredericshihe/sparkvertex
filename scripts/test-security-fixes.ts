/**
 * 支付系统安全修复测试套件
 * 
 * 使用方法:
 * 1. 设置环境变量: SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_ID
 * 2. 运行: npm run test:security
 * 
 * 或使用 Supabase 本地测试:
 * npx supabase test db
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// 测试数据
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const TEST_TRADE_NO = `test_${Date.now()}`;

/**
 * 测试 1: 金额验证 - 应该拒绝不匹配的金额
 */
async function testAmountValidation() {
  console.log('\n🧪 测试 1: 金额验证');
  
  try {
    // 尝试创建一个金额不匹配的订单（19.9元但声称2000积分）
    const { data, error } = await adminClient.rpc('process_credit_order', {
      p_user_id: TEST_USER_ID,
      p_out_trade_no: `${TEST_USER_ID}|2000|${Date.now()}|random`,
      p_trade_no: `${TEST_TRADE_NO}_1`,
      p_amount: 19.9,
      p_credits: 2000, // 声称2000积分，但只支付了19.9元
      p_provider: 'afdian',
      p_payment_info: {}
    });
    
    if (error) {
      console.log('✅ 正确拒绝了金额不匹配的订单');
      return true;
    } else {
      console.error('❌ 金额验证失败：接受了不匹配的订单');
      return false;
    }
  } catch (error) {
    console.log('✅ 异常被正确抛出:', error);
    return true;
  }
}

/**
 * 测试 2: 并发安全 - 同一订单不应该被处理两次
 */
async function testConcurrentSafety() {
  console.log('\n🧪 测试 2: 并发安全');
  
  const outTradeNo = `${TEST_USER_ID}|1|${Date.now()}|concurrent_test`;
  const tradeNo = `${TEST_TRADE_NO}_2`;
  
  // 同时发起两个相同的订单请求
  const promises = [
    adminClient.rpc('process_credit_order', {
      p_user_id: TEST_USER_ID,
      p_out_trade_no: outTradeNo,
      p_trade_no: tradeNo,
      p_amount: 19.9,
      p_credits: 1,
      p_provider: 'afdian',
      p_payment_info: {}
    }),
    adminClient.rpc('process_credit_order', {
      p_user_id: TEST_USER_ID,
      p_out_trade_no: outTradeNo,
      p_trade_no: tradeNo,
      p_amount: 19.9,
      p_credits: 1,
      p_provider: 'afdian',
      p_payment_info: {}
    })
  ];
  
  const results = await Promise.allSettled(promises);
  
  // 应该有一个成功，一个失败
  const successCount = results.filter(r => r.status === 'fulfilled').length;
  const failureCount = results.filter(r => r.status === 'rejected').length;
  
  if (successCount === 1 && failureCount === 1) {
    console.log('✅ 并发安全测试通过：只有一个请求成功');
    return true;
  } else {
    console.error(`❌ 并发安全测试失败: ${successCount} 成功, ${failureCount} 失败`);
    return false;
  }
}

/**
 * 测试 3: 重试机制 - pending_credits 订单应该被重试
 */
async function testRetryMechanism() {
  console.log('\n🧪 测试 3: 重试机制');
  
  // 创建一个 pending_credits 状态的测试订单
  const { error: insertError } = await adminClient
    .from('credit_orders')
    .insert({
      user_id: TEST_USER_ID,
      out_trade_no: `${TEST_USER_ID}|1|${Date.now()}|retry_test`,
      trade_no: `${TEST_TRADE_NO}_3`,
      amount: 19.9,
      credits: 1,
      status: 'pending_credits',
      provider: 'afdian'
    });
  
  if (insertError) {
    console.error('❌ 创建测试订单失败:', insertError);
    return false;
  }
  
  // 调用重试函数
  const { data, error } = await adminClient.rpc('retry_pending_credit_orders');
  
  if (error) {
    console.error('❌ 重试函数调用失败:', error);
    return false;
  }
  
  if (data.processed > 0) {
    console.log(`✅ 重试机制测试通过：处理了 ${data.processed} 个订单`);
    return true;
  } else {
    console.error('❌ 重试机制测试失败：没有处理任何订单');
    return false;
  }
}

/**
 * 测试 4: 订单过期清理
 */
async function testOrderExpiration() {
  console.log('\n🧪 测试 4: 订单过期清理');
  
  // 创建一个过期的测试订单（创建时间设为25小时前）
  const expiredTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  
  const { error: insertError } = await adminClient
    .from('credit_orders')
    .insert({
      user_id: TEST_USER_ID,
      out_trade_no: `${TEST_USER_ID}|1|${Date.now()}|expired_test`,
      trade_no: `${TEST_TRADE_NO}_4`,
      amount: 19.9,
      credits: 1,
      status: 'pending',
      provider: 'afdian',
      created_at: expiredTime
    });
  
  if (insertError) {
    console.error('❌ 创建过期测试订单失败:', insertError);
    return false;
  }
  
  // 调用清理函数
  const { data, error } = await adminClient.rpc('cleanup_expired_orders');
  
  if (error) {
    console.error('❌ 清理函数调用失败:', error);
    return false;
  }
  
  if (data.deleted_count > 0) {
    console.log(`✅ 订单过期清理测试通过：清理了 ${data.deleted_count} 个订单`);
    return true;
  } else {
    console.error('❌ 订单过期清理测试失败：没有清理任何订单');
    return false;
  }
}

/**
 * 测试 5: 健康监控视图
 */
async function testHealthMonitor() {
  console.log('\n🧪 测试 5: 健康监控视图');
  
  const { data, error } = await adminClient
    .from('payment_health_monitor')
    .select('*')
    .single();
  
  if (error) {
    console.error('❌ 健康监控视图查询失败:', error);
    return false;
  }
  
  console.log('📊 当前系统健康状态:');
  console.log('  - 超时待支付订单:', data.stale_pending_orders);
  console.log('  - 待添加积分订单:', data.pending_credit_orders);
  console.log('  - 失败订单:', data.failed_orders);
  console.log('  - 最近1小时订单:', data.recent_orders);
  console.log('  - 最近1小时成功订单:', data.recent_paid_orders);
  console.log('  - 成功率:', data.success_rate_last_hour + '%');
  
  console.log('✅ 健康监控视图测试通过');
  return true;
}

/**
 * 清理测试数据
 */
async function cleanup() {
  console.log('\n🧹 清理测试数据...');
  
  // 删除所有测试订单
  await adminClient
    .from('credit_orders')
    .delete()
    .like('trade_no', `${TEST_TRADE_NO}%`);
  
  console.log('✅ 清理完成');
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('🚀 开始运行支付系统安全测试套件...');
  console.log('================================================\n');
  
  const results: { name: string; passed: boolean }[] = [];
  
  // 注意：这些测试需要在实际的 Supabase 环境中运行
  // 如果在生产环境，请谨慎执行
  
  try {
    results.push({ 
      name: '金额验证', 
      passed: await testAmountValidation() 
    });
    
    results.push({ 
      name: '并发安全', 
      passed: await testConcurrentSafety() 
    });
    
    results.push({ 
      name: '重试机制', 
      passed: await testRetryMechanism() 
    });
    
    results.push({ 
      name: '订单过期清理', 
      passed: await testOrderExpiration() 
    });
    
    results.push({ 
      name: '健康监控视图', 
      passed: await testHealthMonitor() 
    });
    
  } catch (error) {
    console.error('\n❌ 测试过程中发生错误:', error);
  } finally {
    await cleanup();
  }
  
  // 打印测试结果摘要
  console.log('\n================================================');
  console.log('📋 测试结果摘要:\n');
  
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}: ${result.passed ? '通过' : '失败'}`);
  });
  
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  const passRate = ((passedCount / totalCount) * 100).toFixed(1);
  
  console.log(`\n总计: ${passedCount}/${totalCount} 通过 (${passRate}%)`);
  
  if (passedCount === totalCount) {
    console.log('\n🎉 所有测试通过！支付系统安全修复验证成功。');
    process.exit(0);
  } else {
    console.log('\n⚠️  部分测试失败，请检查上述错误信息。');
    process.exit(1);
  }
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  runAllTests();
}

export { 
  testAmountValidation,
  testConcurrentSafety,
  testRetryMechanism,
  testOrderExpiration,
  testHealthMonitor
};
