/**
 * 阿里云短信服务 - 验证码发送与验证
 * 使用阿里云官方 SDK
 */

import Dysmsapi20170525, * as $Dysmsapi20170525 from '@alicloud/dysmsapi20170525';
import * as $OpenApi from '@alicloud/openapi-client';

interface SendSmsResult {
  success: boolean;
  message: string;
  requestId?: string;
}

interface VerifySmsResult {
  success: boolean;
  message: string;
}

// 使用全局变量存储验证码（防止开发环境热重载清除）
// 生产环境应使用 Redis
declare global {
  var __verifyCodeStore: Map<string, { code: string; expireAt: number }> | undefined;
}

const verifyCodeStore = global.__verifyCodeStore || new Map<string, { code: string; expireAt: number }>();
if (!global.__verifyCodeStore) {
  global.__verifyCodeStore = verifyCodeStore;
}

// 生成 6 位随机验证码
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 创建阿里云短信客户端
function createClient(): Dysmsapi20170525 {
  const config = new $OpenApi.Config({
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  });
  config.endpoint = 'dysmsapi.aliyuncs.com';
  return new Dysmsapi20170525(config);
}

// 发送验证码短信
export async function sendVerifyCode(phoneNumber: string): Promise<SendSmsResult> {
  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  const signName = process.env.ALIYUN_SMS_SIGN_NAME || '奇点映射';
  const templateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE || 'SMS_499295264';
  
  if (!accessKeyId || !accessKeySecret) {
    console.error('[SMS] Missing Aliyun credentials');
    return { success: false, message: '短信服务未配置' };
  }
  
  // 规范化手机号（移除 +86 前缀）
  const normalizedPhone = phoneNumber.replace(/^\+86/, '').replace(/\s/g, '');
  
  // 验证手机号格式
  if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
    return { success: false, message: '请输入有效的手机号码' };
  }
  
  // 生成验证码
  const code = generateCode();
  
  try {
    const client = createClient();
    
    const sendSmsRequest = new $Dysmsapi20170525.SendSmsRequest({
      phoneNumbers: normalizedPhone,
      signName: signName,
      templateCode: templateCode,
      templateParam: JSON.stringify({ code }),
    });
    
    console.log('[SMS] Sending SMS to:', normalizedPhone);
    
    const response = await client.sendSms(sendSmsRequest);
    const body = response.body;
    
    console.log('[SMS] SendSms response:', JSON.stringify(body));
    
    if (body?.code === 'OK') {
      // 存储验证码（5 分钟有效期）
      verifyCodeStore.set(normalizedPhone, {
        code,
        expireAt: Date.now() + 5 * 60 * 1000,
      });
      
      console.log('[SMS] Code stored for phone:', normalizedPhone, 'code:', code);
      
      return {
        success: true,
        message: '验证码已发送',
        requestId: body?.requestId,
      };
    } else {
      // 常见错误码处理
      // 注意：isv.BUSINESS_LIMIT_CONTROL 是阿里云平台限制（同号码每小时5条，每天10条）
      const errorMessages: Record<string, string> = {
        'isv.BUSINESS_LIMIT_CONTROL': '短信发送次数已达上限，请1小时后再试或使用邮箱登录',
        'isv.MOBILE_NUMBER_ILLEGAL': '手机号码格式错误',
        'isv.TEMPLATE_MISSING_PARAMETERS': '短信模板参数缺失',
        'isv.INVALID_PARAMETERS': '参数错误',
        'isv.AMOUNT_NOT_ENOUGH': '短信余额不足',
        'isv.SMS_SIGNATURE_ILLEGAL': '短信签名不合法',
        'isv.SMS_TEMPLATE_ILLEGAL': '短信模板不合法',
        'isv.DAY_LIMIT_CONTROL': '今日短信次数已用完，请明天再试或使用邮箱登录',
      };
      
      return {
        success: false,
        message: errorMessages[body?.code || ''] || body?.message || '发送失败，请稍后重试',
      };
    }
  } catch (error: any) {
    console.error('[SMS] Send error:', error);
    return { success: false, message: error.message || '网络错误，请稍后重试' };
  }
}

// 验证验证码（本地验证）
export async function verifyCode(phoneNumber: string, code: string): Promise<VerifySmsResult> {
  // 规范化手机号
  const normalizedPhone = phoneNumber.replace(/^\+86/, '').replace(/\s/g, '');
  
  // 验证码格式检查
  if (!/^\d{4,6}$/.test(code)) {
    return { success: false, message: '验证码格式错误' };
  }
  
  // 从存储中获取验证码
  const stored = verifyCodeStore.get(normalizedPhone);
  
  if (!stored) {
    return { success: false, message: '请先获取验证码' };
  }
  
  // 检查是否过期
  if (Date.now() > stored.expireAt) {
    verifyCodeStore.delete(normalizedPhone);
    return { success: false, message: '验证码已过期，请重新获取' };
  }
  
  // 验证验证码
  if (stored.code !== code) {
    return { success: false, message: '验证码错误' };
  }
  
  // 验证成功，删除验证码（一次性使用）
  verifyCodeStore.delete(normalizedPhone);
  
  return { success: true, message: '验证成功' };
}
