import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Gemini 2.0 Flash Preview Image Generation - 原型图生成
const GEMINI_IMAGE_GENERATION_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent';

// 生成原型图的 System Prompt
const getPrototypeSystemPrompt = (language: string) => `You are a senior UI/UX designer specializing in creating app prototype mockups.

Your task is to generate a **single, clean, professional UI prototype image** based on the user's description.

## Design Principles
1. **Mobile-First**: Design for mobile screens (portrait orientation, ~375x812 aspect ratio)
2. **Clean & Modern**: Use flat design, generous whitespace, consistent spacing
3. **Realistic**: Include realistic UI elements (buttons, inputs, navigation bars, cards)
4. **Professional Color Palette**: Use harmonious colors matching the specified style
5. **Typography Hierarchy**: Clear distinction between headings, body, and labels
6. **Touch-Friendly**: Visible touch targets (buttons, interactive elements)

## Output Requirements
- Generate a **single complete screen** showing the main interface
- Include realistic placeholder content (text, icons, images)
- Show interactive states (buttons should look clickable)
- Use the appropriate platform conventions (iOS/Android/Web)
- **NO** wireframe sketches - generate a polished, high-fidelity mockup

## Style Guidelines
Based on the style choice, apply the following aesthetics:
- **Cyberpunk**: Neon colors, dark background, glowing effects, futuristic fonts
- **Minimalist**: Black/white/gray, lots of whitespace, thin lines, subtle shadows
- **Cute**: Pastel colors, rounded corners, playful icons, soft shadows
- **Business**: Navy/slate/white, professional layout, clean grid, subtle accents
- **Retro**: Pixel art style, limited color palette, nostalgic elements
- **Glassmorphism**: Frosted glass effects, gradient backgrounds, transparency
- **Neobrutalism**: Bold colors, thick black borders, hard shadows
- **Dark Mode**: Dark surfaces, high contrast text, subtle highlights

${language === 'zh' ? '请生成中文界面，包含中文文字标签。' : 'Generate English interface with English labels.'}`;

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
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    );
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: Please login first' }, { status: 401 });
    }

    // 2. 解析请求
    const { 
      description, 
      category, 
      device, 
      style, 
      language = 'zh' 
    } = await request.json();

    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    // 3. 速率限制检查
    const { allowed, error: rateLimitError } = await checkRateLimit(
      supabase, 
      session.user.id, 
      'generate-prototype', 
      10,  // 每分钟 10 次
      30   // 每天 30 次
    );

    if (!allowed) {
      return NextResponse.json({ error: rateLimitError }, { status: 429 });
    }

    // 4. 积分检查 (原型图生成消耗 2 积分)
    const COST = 2;
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
    }

    const currentCredits = Number(profile.credits || 0);
    if (currentCredits < COST) {
      return NextResponse.json({ error: `Insufficient credits (Required: ${COST})` }, { status: 403 });
    }

    // 5. 构建原型图生成 Prompt
    const categoryLabels: Record<string, { zh: string, en: string }> = {
      game: { zh: '休闲游戏', en: 'Casual Game' },
      portfolio: { zh: '个人作品集', en: 'Portfolio' },
      appointment: { zh: '预约服务', en: 'Appointment Service' },
      productivity: { zh: '效率工具', en: 'Productivity Tool' },
      tool: { zh: '实用工具', en: 'Utility Tool' },
      devtool: { zh: '开发者工具', en: 'Developer Tool' },
      education: { zh: '教育应用', en: 'Educational App' },
      visualization: { zh: '数据可视化', en: 'Data Visualization' },
      lifestyle: { zh: '生活方式', en: 'Lifestyle App' }
    };

    const deviceLabels: Record<string, { zh: string, en: string }> = {
      mobile: { zh: '手机', en: 'Mobile Phone' },
      tablet: { zh: '平板', en: 'Tablet' },
      desktop: { zh: '桌面', en: 'Desktop' }
    };

    const styleLabels: Record<string, { zh: string, en: string }> = {
      cyberpunk: { zh: '赛博朋克', en: 'Cyberpunk' },
      minimalist: { zh: '极简主义', en: 'Minimalist' },
      cute: { zh: '可爱风', en: 'Cute' },
      business: { zh: '商务风', en: 'Business' },
      retro: { zh: '复古像素', en: 'Retro Pixel' },
      native: { zh: '原生风格', en: 'Native' },
      glassmorphism: { zh: '玻璃拟态', en: 'Glassmorphism' },
      neobrutalism: { zh: '新野兽派', en: 'Neobrutalism' },
      dark_mode: { zh: '暗黑模式', en: 'Dark Mode' }
    };

    const categoryLabel = categoryLabels[category as keyof typeof categoryLabels]?.[language as 'zh' | 'en'] || category;
    const deviceLabel = deviceLabels[device as keyof typeof deviceLabels]?.[language as 'zh' | 'en'] || device;
    const styleLabel = styleLabels[style as keyof typeof styleLabels]?.[language as 'zh' | 'en'] || style;

    const userPrompt = `Create a high-fidelity UI prototype mockup for the following app:

**App Type**: ${categoryLabel}
**Target Device**: ${deviceLabel}
**Design Style**: ${styleLabel}

**Description**:
${description}

Generate a polished, realistic UI mockup image that shows:
1. The main screen/interface of this app
2. Realistic UI components (navigation, buttons, cards, inputs)
3. Placeholder content that makes sense for this app
4. The specified visual style applied throughout

The image should look like a screenshot from a real, finished app.`;

    // 6. 调用 Gemini 2.0 Flash Preview Image Generation
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    console.log('[PrototypeGen] Calling Gemini 2.0 Flash Preview Image Generation...');
    console.log('[PrototypeGen] Category:', category, 'Device:', device, 'Style:', style);

    const geminiResponse = await fetch(`${GEMINI_IMAGE_GENERATION_API}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: getPrototypeSystemPrompt(language) + '\n\n' + userPrompt }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ['image', 'text'],
          responseMimeType: 'image/png'
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('[PrototypeGen] Gemini API Error:', errorText);
      return NextResponse.json({ 
        error: 'Failed to generate prototype image',
        details: errorText 
      }, { status: geminiResponse.status });
    }

    const geminiData = await geminiResponse.json();
    
    // 7. 提取生成的图片
    let imageBase64 = '';
    let imageUrl = '';
    
    if (geminiData.candidates?.[0]?.content?.parts) {
      for (const part of geminiData.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;
          // 转换为 data URL
          const mimeType = part.inlineData.mimeType || 'image/png';
          imageUrl = `data:${mimeType};base64,${imageBase64}`;
          break;
        }
      }
    }

    if (!imageUrl) {
      console.error('[PrototypeGen] No image in response:', JSON.stringify(geminiData).substring(0, 500));
      return NextResponse.json({ 
        error: 'Prototype generation did not return an image',
        debug: geminiData
      }, { status: 500 });
    }

    // 8. 扣除积分
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: currentCredits - COST })
      .eq('id', session.user.id);

    if (updateError) {
      console.warn('[PrototypeGen] Failed to deduct credits:', updateError);
    }

    console.log('[PrototypeGen] Successfully generated prototype image');

    // 9. 返回结果
    return NextResponse.json({
      success: true,
      imageUrl,
      imageBase64,
      cost: COST,
      prompt: userPrompt
    });

  } catch (error: any) {
    console.error('[PrototypeGen] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal Server Error' 
    }, { status: 500 });
  }
}
