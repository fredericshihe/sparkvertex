import { NextRequest, NextResponse } from 'next/server';
import { verifyCode } from '@/lib/aliyun-sms';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
      
      // 初始化用户 profile（仅设置手机登录特有的字段）
      // 积分由数据库触发器 handle_new_user 统一设置
      try {
        await supabaseAdmin.from('profiles').update({
          username: `user_${normalizedPhone.slice(-4)}`,
          full_name: `用户${normalizedPhone.slice(-4)}`,
        }).eq('id', userId);
      } catch (e) {
        console.warn('[Auth] Profile update warning:', e);
      }
    }
    
    // 3. 直接为用户设置登录会话
    // 使用 admin API 生成自定义 token，然后通过 cookie 设置 session
    const cookieStore = cookies();
    
    const supabaseWithCookies = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            try {
              cookieStore.set({ name, value, ...options });
            } catch (e) {
              // Cookie 可能在响应头发送后无法设置
            }
          },
          remove(name: string, options: any) {
            try {
              cookieStore.set({ name, value: '', ...options });
            } catch (e) {}
          },
        },
      }
    );
    
    // 使用 admin 用邮箱密码登录（我们已经知道密码生成逻辑）
    // 但更简单的方式是：直接用 signInWithPassword 登录刚创建的用户
    // 或者使用 admin.createSession
    
    // 方案：使用一个固定的临时密码，让用户可以登录
    const tempPassword = `phone_${normalizedPhone}_${process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-8)}`;
    
    // 更新用户密码为可预测的值
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: tempPassword,
    });
    
    // 使用密码登录
    const { data: signInData, error: signInError } = await supabaseWithCookies.auth.signInWithPassword({
      email: fakeEmail,
      password: tempPassword,
    });
    
    if (signInError || !signInData.session) {
      console.error('[Auth] Sign in error:', signInError);
      return NextResponse.json(
        { success: false, message: '登录失败，请稍后重试' },
        { status: 500 }
      );
    }
    
    console.log('[Auth] User logged in successfully:', userId);
    
    return NextResponse.json({
      success: true,
      message: '登录成功',
      user: {
        id: signInData.user.id,
        phone: normalizedPhone,
      },
    });
    
  } catch (error: any) {
    console.error('[API] Verify code error:', error);
    return NextResponse.json(
      { success: false, message: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}
