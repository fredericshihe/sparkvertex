import { NextResponse } from 'next/server';

// 测试Webhook处理逻辑的GET端点
export async function GET() {
  return NextResponse.json({ 
    message: 'Afdian Webhook endpoint is ready',
    endpoint: '/api/payment/afdian/notify',
    method: 'POST',
    instructions: '请在爱发电后台配置此Webhook URL'
  });
}
