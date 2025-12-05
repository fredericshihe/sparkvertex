// 测试脚本：创建一个待支付订单用于测试爱发电回调
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少环境变量');
  console.error('请确保 .env.local 中有:');
  console.error('- NEXT_PUBLIC_SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestOrder() {
  try {
    // 1. 获取当前用户（需要你提供 user_id）
    console.log('\n📝 请提供测试用户的 user_id:');
    console.log('你可以从 Supabase Dashboard -> Authentication -> Users 中找到');
    
    // 这里先用一个占位符，实际使用时需要替换
    const userId = process.argv[2]; // 从命令行参数获取
    
    if (!userId) {
      console.error('\n❌ 请提供 user_id');
      console.error('用法: node scripts/create-test-order.js <your-user-id>');
      process.exit(1);
    }
    
    // 2. 创建测试订单（金额必须是 5.00 才能匹配爱发电的测试数据）
    const testOrder = {
      user_id: userId,
      out_trade_no: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount: 5.00, // 爱发电测试数据的金额
      credits: 100, // 测试用，实际可以改
      status: 'pending',
      provider: 'afdian'
    };
    
    console.log('\n🔨 创建测试订单:', testOrder);
    
    const { data, error } = await supabase
      .from('credit_orders')
      .insert(testOrder)
      .select()
      .single();
    
    if (error) {
      console.error('❌ 创建失败:', error);
      process.exit(1);
    }
    
    console.log('\n✅ 测试订单创建成功!');
    console.log('📦 订单详情:', data);
    console.log('\n📌 现在你可以在爱发电后台点击 "发送测试"');
    console.log('📌 系统会自动匹配这个 amount=5.00 的订单');
    console.log('📌 然后在 Vercel 日志中查看结果');
    
  } catch (error) {
    console.error('❌ 错误:', error);
    process.exit(1);
  }
}

createTestOrder();
