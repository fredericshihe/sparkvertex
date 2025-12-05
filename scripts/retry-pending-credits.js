#!/usr/bin/env node

/**
 * 重试失败的积分更新
 * 用于处理 pending_credits 状态的订单
 * 
 * 使用方法:
 * node scripts/retry-pending-credits.js
 */

const { createClient } = require('@supabase/supabase-js');

async function retryPendingCredits() {
  // 检查环境变量
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  
  console.log('🔍 Looking for orders with pending_credits status...');
  
  // 查询所有 pending_credits 状态的订单
  const { data: orders, error: fetchError } = await supabase
    .from('credit_orders')
    .select('*')
    .eq('status', 'pending_credits')
    .order('created_at', { ascending: true });
  
  if (fetchError) {
    console.error('❌ Failed to fetch orders:', fetchError);
    process.exit(1);
  }
  
  if (!orders || orders.length === 0) {
    console.log('✅ No pending_credits orders found. All good!');
    return;
  }
  
  console.log(`📦 Found ${orders.length} orders with pending credits:\n`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const order of orders) {
    console.log(`\n📝 Processing order ${order.id}:`);
    console.log(`   User: ${order.user_id}`);
    console.log(`   Credits: ${order.credits}`);
    console.log(`   Amount: ¥${order.amount}`);
    console.log(`   Created: ${order.created_at}`);
    
    try {
      // 获取用户当前积分
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', order.user_id)
        .single();
      
      if (profileError || !profile) {
        console.error(`   ❌ User profile not found: ${profileError?.message}`);
        failCount++;
        continue;
      }
      
      const oldCredits = profile.credits || 0;
      const newCredits = oldCredits + order.credits;
      
      // 更新用户积分
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', order.user_id);
      
      if (updateError) {
        console.error(`   ❌ Failed to update credits: ${updateError.message}`);
        failCount++;
        continue;
      }
      
      // 更新订单状态为 paid
      const { error: orderError } = await supabase
        .from('credit_orders')
        .update({ 
          status: 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);
      
      if (orderError) {
        console.error(`   ⚠️  Credits updated but failed to update order status: ${orderError.message}`);
        // 积分已经加上了，只是状态没更新，标记为成功但警告
        console.log(`   ⚠️  Please manually update order ${order.id} status to 'paid'`);
      }
      
      console.log(`   ✅ Success! Credits: ${oldCredits} → ${newCredits}`);
      successCount++;
      
    } catch (error) {
      console.error(`   ❌ Unexpected error: ${error.message}`);
      failCount++;
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 Summary:`);
  console.log(`   Total: ${orders.length}`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`${'='.repeat(50)}\n`);
  
  if (failCount > 0) {
    console.log('⚠️  Some orders failed to process. Please check the logs above.');
    process.exit(1);
  } else {
    console.log('🎉 All orders processed successfully!');
  }
}

// 运行脚本
retryPendingCredits().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
