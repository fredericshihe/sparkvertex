import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const COST = 10; // 每次生成扣除10积分
const MAX_IMAGE_SIZE = 1024; // 最大像素尺寸1k

export async function POST(request: Request) {
  try {
    // 1. 验证用户会话
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ 
        success: false, 
        error: '请先登录' 
      }, { status: 401 });
    }

    // 2. 解析请求参数
    const { prompt, language = 'zh' } = await request.json();
    
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 2) {
      return NextResponse.json({ 
        success: false, 
        error: language === 'zh' ? '请输入有效的图片描述' : 'Please enter a valid image description'
      }, { status: 400 });
    }

    // 3. 检查积分
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profile) {
      console.error('[GenerateImage] Profile fetch error:', profileError);
      return NextResponse.json({ 
        success: false, 
        error: language === 'zh' ? '获取用户信息失败' : 'Failed to fetch user profile'
      }, { status: 500 });
    }

    const currentCredits = Number(profile.credits || 0);
    if (currentCredits < COST) {
      return NextResponse.json({ 
        success: false, 
        error: language === 'zh' 
          ? `积分不足，需要 ${COST} 积分，当前 ${currentCredits} 积分` 
          : `Insufficient credits. Need ${COST}, have ${currentCredits}`,
        code: 'INSUFFICIENT_CREDITS'
      }, { status: 403 });
    }

    // 4. 频率限制: 每分钟10次，每天100次
    const { allowed, error: rateLimitError } = await checkRateLimit(
      supabase,
      session.user.id,
      'generate-image',
      10,
      100
    );

    if (!allowed) {
      return NextResponse.json({ 
        success: false, 
        error: rateLimitError 
      }, { status: 429 });
    }

    // 5. 获取 Google API Key
    const googleApiKey = process.env.GOOGLE_API_KEY;
    if (!googleApiKey) {
      console.error('[GenerateImage] Missing GOOGLE_API_KEY');
      return NextResponse.json({ 
        success: false, 
        error: 'API configuration error' 
      }, { status: 500 });
    }

    // 6. 构建提示词
    const isZh = language === 'zh';
    const systemPrompt = isZh
      ? `你是一个专业的图片生成专家。请根据用户描述生成一张高质量的图片。

图片要求：
- 生成正方形图片，尺寸为 ${MAX_IMAGE_SIZE}x${MAX_IMAGE_SIZE} 像素
- 图片风格现代、美观
- 色彩和谐、符合现代设计趋势
- 适合用作应用界面中的配图

用户描述: ${prompt.trim()}`
      : `You are a professional image generation expert. Generate a high-quality image based on the user's description.

Image Requirements:
- Generate a square image, size ${MAX_IMAGE_SIZE}x${MAX_IMAGE_SIZE} pixels
- Modern, visually appealing style
- Harmonious colors following modern design trends
- Suitable for use as app interface graphics

User description: ${prompt.trim()}`;

    console.log('[GenerateImage] Generating image with Gemini...');

    // 7. 调用 Gemini 3 Pro Image Preview API
    // 使用与 generate-prototype 相同的模型和端点
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${googleApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: systemPrompt
            }]
          }],
          generationConfig: {
            responseModalities: ['image', 'text'],
            responseMimeType: 'image/png'
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('[GenerateImage] Gemini API error:', geminiResponse.status, errorText);
      
      // 不扣积分，直接返回错误
      return NextResponse.json({ 
        success: false, 
        error: isZh ? '图片生成失败，请稍后重试' : 'Image generation failed, please try again'
      }, { status: 500 });
    }

    const geminiData = await geminiResponse.json();
    
    // 8. 提取生成的图像 (与 generate-prototype 格式一致)
    const imagePart = geminiData.candidates?.[0]?.content?.parts?.find(
      (part: any) => part.inlineData?.mimeType?.startsWith('image/')
    );
    
    let imageBase64 = null;
    
    if (imagePart?.inlineData?.data) {
      const mimeType = imagePart.inlineData.mimeType || 'image/png';
      imageBase64 = `data:${mimeType};base64,${imagePart.inlineData.data}`;
    }

    if (!imageBase64) {
      console.warn('[GenerateImage] No image in response:', JSON.stringify(geminiData).slice(0, 500));
      return NextResponse.json({ 
        success: false, 
        error: isZh ? '未能生成图片，请尝试修改描述' : 'Failed to generate image, try modifying description'
      }, { status: 500 });
    }

    // 9. 生成成功，扣除积分
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: currentCredits - COST })
      .eq('id', session.user.id);

    if (updateError) {
      console.error('[GenerateImage] Credit deduction failed:', updateError);
      // 积分扣除失败但图片已生成，仍返回成功
    }

    console.log('[GenerateImage] Successfully generated image, deducted', COST, 'credits');

    return NextResponse.json({ 
      success: true, 
      imageBase64,
      creditsUsed: COST,
      remainingCredits: currentCredits - COST
    });

  } catch (error: any) {
    console.error('[GenerateImage] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}
