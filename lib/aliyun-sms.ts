/**
 * 阿里云短信服务 - 验证码发送与验证
 * 使用号码认证服务的 SendSmsVerifyCode API
 */

import crypto from 'crypto';

const ALIYUN_REGION = 'cn-shenzhen'; // 华南1（深圳）

interface SendSmsResult {
  success: boolean;
  message: string;
  requestId?: string;
}

interface VerifySmsResult {
  success: boolean;
  message: string;
}

// 生成阿里云 API 签名
function generateSignature(params: Record<string, string>, secret: string): string {
  // 1. 按参数名排序
  const sortedKeys = Object.keys(params).sort();
  
  // 2. 构造待签名字符串
  const canonicalQueryString = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  
  const stringToSign = `POST&${encodeURIComponent('/')}&${encodeURIComponent(canonicalQueryString)}`;
  
  // 3. 计算 HMAC-SHA1 签名
  const hmac = crypto.createHmac('sha1', secret + '&');
  const signature = hmac.update(stringToSign).digest('base64');
  
  return signature;
}

// 发送验证码短信
export async function sendVerifyCode(phoneNumber: string): Promise<SendSmsResult> {
  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  const signName = process.env.ALIYUN_SMS_SIGN_NAME || '速通互联验证码';
  const templateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE || '100001';
  
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
  
  try {
    // 公共请求参数
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const nonce = crypto.randomUUID();
    
    const params: Record<string, string> = {
      // 公共参数
      AccessKeyId: accessKeyId,
      Action: 'SendSmsVerifyCode',
      Format: 'JSON',
      RegionId: ALIYUN_REGION,
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: nonce,
      SignatureVersion: '1.0',
      Timestamp: timestamp,
      Version: '2017-05-25',
      // 业务参数
      PhoneNumber: normalizedPhone,
      SignName: signName,
      TemplateCode: templateCode,
      // 可选：验证码有效期（分钟）
      CodeLength: '6',
      ValidTime: '5',
    };
    
    // 生成签名
    const signature = generateSignature(params, accessKeySecret);
    params.Signature = signature;
    
    // 发送请求
    const url = `https://dypnsapi.aliyuncs.com/`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });
    
    const data = await response.json();
    console.log('[SMS] SendSmsVerifyCode response:', JSON.stringify(data));
    
    if (data.Code === 'OK' || data.Code === 'Success') {
      return {
        success: true,
        message: '验证码已发送',
        requestId: data.RequestId,
      };
    } else {
      // 常见错误码处理
      const errorMessages: Record<string, string> = {
        'isv.BUSINESS_LIMIT_CONTROL': '发送频率过快，请稍后再试',
        'isv.MOBILE_NUMBER_ILLEGAL': '手机号码格式错误',
        'isv.TEMPLATE_MISSING_PARAMETERS': '短信模板参数缺失',
        'isv.INVALID_PARAMETERS': '参数错误',
        'isv.AMOUNT_NOT_ENOUGH': '短信余额不足',
      };
      
      return {
        success: false,
        message: errorMessages[data.Code] || data.Message || '发送失败，请稍后重试',
      };
    }
  } catch (error: any) {
    console.error('[SMS] Send error:', error);
    return { success: false, message: '网络错误，请稍后重试' };
  }
}

// 验证验证码
export async function verifyCode(phoneNumber: string, code: string): Promise<VerifySmsResult> {
  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  
  if (!accessKeyId || !accessKeySecret) {
    return { success: false, message: '短信服务未配置' };
  }
  
  // 规范化手机号
  const normalizedPhone = phoneNumber.replace(/^\+86/, '').replace(/\s/g, '');
  
  // 验证码格式检查
  if (!/^\d{4,6}$/.test(code)) {
    return { success: false, message: '验证码格式错误' };
  }
  
  try {
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const nonce = crypto.randomUUID();
    
    const params: Record<string, string> = {
      AccessKeyId: accessKeyId,
      Action: 'CheckSmsVerifyCode',
      Format: 'JSON',
      RegionId: ALIYUN_REGION,
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: nonce,
      SignatureVersion: '1.0',
      Timestamp: timestamp,
      Version: '2017-05-25',
      PhoneNumber: normalizedPhone,
      VerifyCode: code,
    };
    
    const signature = generateSignature(params, accessKeySecret);
    params.Signature = signature;
    
    const url = `https://dypnsapi.aliyuncs.com/`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });
    
    const data = await response.json();
    console.log('[SMS] CheckSmsVerifyCode response:', JSON.stringify(data));
    
    if (data.Code === 'OK' && data.VerifyResult === true) {
      return { success: true, message: '验证成功' };
    } else if (data.Code === 'OK' && data.VerifyResult === false) {
      return { success: false, message: '验证码错误或已过期' };
    } else {
      return { success: false, message: data.Message || '验证失败' };
    }
  } catch (error: any) {
    console.error('[SMS] Verify error:', error);
    return { success: false, message: '网络错误，请稍后重试' };
  }
}
