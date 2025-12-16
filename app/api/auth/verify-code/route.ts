import { NextRequest, NextResponse } from 'next/server';
import { verifyCode } from '@/lib/aliyun-sms';
import { createClient } from '@supabase/supabase-js';

// 使用 Service Role Key 创建管理员客户端（可以创建用户）
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
  try {
    const { phone, code } = await request.json();
    
    if (!phone || !code) {
      return NextResponse.json(
        { success: false, message: '请输入手机号和验证码' },
        { status: 400 }
      );
    }
    
    const normalizedPhone = phone.replace(/^\+86/, '').replace(/\s/g, '');
    
    // 1. 验证验证码
    const verifyResult = await verifyCode(normalizedPhone, code);
    
    if (!verifyResult.success) {
      return NextResponse.json(verifyResult, { status: 400 });
    }
    
    // 2. 查找或创建用户
    // 使用手机号作为邮箱的一部分（Supabase 需要邮箱字段）
    const fakeEmail = `${normalizedPhone}@phone.sparkvertex.com`;
    
    // 检查用户是否存在
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => 
      u.email === fakeEmail || 
      u.phone === normalizedPhone ||
      u.user_metadata?.phone === normalizedPhone
    );
    
    let userId: string;
    
    if (existingUser) {
      // 用户已存在，直接使用
      userId = existingUser.id;
      console.log('[Auth] Existing user found:', userId);
    } else {
      // 创建新用户
      const randomPassword = crypto.randomUUID(); // 生成随机密码（用户无需知道）
      
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: fakeEmail,
        phone: normalizedPhone,
        password: randomPassword,
        email_confirm: true, // 跳过邮箱验证
        phone_confirm: true, // 跳过手机验证（我们已经验证过了）
        user_metadata: {
          phone: normalizedPhone,
          full_name: `用户${normalizedPhone.slice(-4)}`,
          username: `user_${normalizedPhone.slice(-4)}`,
          auth_method: 'phone',
        },
      });
      
      if (createError || !newUser.user) {
        console.error('[Auth] Create user error:', createError);
        return NextResponse.json(
          { success: false, message: '创建账号失败，请稍后重试' },
          { status: 500 }
        );
      }
      
      userId = newUser.user.id;
      console.log('[Auth] New user created:', userId);
      
      // 初始化用户 profile（如果有 profiles 表）
      try {
        await supabaseAdmin.from('profiles').upsert({
          id: userId,
          username: `user_${normalizedPhone.slice(-4)}`,
          full_name: `用户${normalizedPhone.slice(-4)}`,
          credits: 10, // 新用户赠送积分
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('[Auth] Profile creation warning:', e);
      }
    }
    
    // 3. 为用户生成登录链接（Magic Link 方式）
    // 或者直接生成 Session Token
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: fakeEmail,
      options: {
        redirectTo: `${request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });
    
    if (linkError || !linkData) {
      console.error('[Auth] Generate link error:', linkError);
      return NextResponse.json(
        { success: false, message: '登录失败，请稍后重试' },
        { status: 500 }
      );
    }
    
    // 从 Magic Link 中提取 token 参数
    const linkUrl = new URL(linkData.properties.action_link);
    const token = linkUrl.searchParams.get('token');
    const type = linkUrl.searchParams.get('type');
    
    return NextResponse.json({
      success: true,
      message: '验证成功',
      // 返回验证 token，前端用它来完成登录
      authToken: token,
      authType: type,
      redirectUrl: `/auth/callback?token=${token}&type=${type}`,
    });
    
  } catch (error: any) {
    console.error('[API] Verify code error:', error);
    return NextResponse.json(
      { success: false, message: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}
