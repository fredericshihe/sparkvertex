import { NextRequest, NextResponse } from 'next/server';
import { sendVerifyCode } from '@/lib/aliyun-sms';

// 使用全局变量存储频率限制（防止开发环境热重载清除）
declare global {
  var __smsRateLimitMap: Map<string, { count: number; resetTime: number }> | undefined;
}

const rateLimitMap = global.__smsRateLimitMap || new Map<string, { count: number; resetTime: number }>();
if (!global.__smsRateLimitMap) {
  global.__smsRateLimitMap = rateLimitMap;
}

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();
    
    if (!phone) {
      return NextResponse.json({ success: false, message: '请输入手机号' }, { status: 400 });
    }
    
    // 规范化手机号
    const normalizedPhone = phone.replace(/^\+86/, '').replace(/\s/g, '');
    
    // 频率限制：同一手机号 30 秒内只能发送一次（放宽限制）
    const now = Date.now();
    const rateKey = `sms:${normalizedPhone}`;
    const rateLimit = rateLimitMap.get(rateKey);
    
    if (rateLimit && now < rateLimit.resetTime) {
      const waitSeconds = Math.ceil((rateLimit.resetTime - now) / 1000);
      return NextResponse.json(
        { success: false, message: `请${waitSeconds}秒后再试` },
        { status: 429 }
      );
    }
    
    // 发送验证码
    const result = await sendVerifyCode(normalizedPhone);
    
    if (result.success) {
      // 设置 30 秒冷却期（放宽限制）
      rateLimitMap.set(rateKey, { count: 1, resetTime: now + 30000 });
      
      // 清理过期的记录（简单的内存管理）
      for (const [key, value] of rateLimitMap.entries()) {
        if (now > value.resetTime + 300000) { // 5分钟后清理
          rateLimitMap.delete(key);
        }
      }
    }
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Send code error:', error);
    return NextResponse.json(
      { success: false, message: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}
