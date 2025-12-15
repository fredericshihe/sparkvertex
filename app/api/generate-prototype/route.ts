import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// 使用 Node.js Runtime 以确保环境变量正确加载
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 原型图生成 API
 * 
 * 使用 Gemini 3 Pro Image Preview 的图像生成能力，根据用户描述生成 UI 原型图。
 * 这个原型图将作为后续代码生成的视觉参考。
 */

interface PrototypeRequest {
  description: string;
  category: string;
  device: 'mobile' | 'tablet' | 'desktop';
  style?: string;
  language?: 'zh' | 'en';
}

interface PrototypeResponse {
  success: boolean;
  imageBase64?: string;
  error?: string;
}

export async function POST(request: Request): Promise<Response> {
  try {
    // 1. 验证用户身份
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set() {},
          remove() {},
        },
      }
    );

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. 解析请求
    const body: PrototypeRequest = await request.json();
    const { description, category, device, style, language = 'zh' } = body;

    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    // 3. 构建原型图生成 Prompt
    const prototypePrompt = buildPrototypePrompt({
      description,
      category,
      device,
      style,
      language
    });

    console.log('[Prototype] Generating with prompt:', prototypePrompt.substring(0, 200) + '...');

    // 4. 调用 Gemini 2.0 Flash 图像生成 API
    const googleApiKey = process.env.GOOGLE_API_KEY;
    if (!googleApiKey) {
      throw new Error('Missing Google API Key');
    }

    // 使用 Gemini 3 Pro Image Preview 的图像生成能力
    // 模型名称：gemini-3-pro-image-preview (用户指定，不要更改)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${googleApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prototypePrompt
            }]
          }],
          generationConfig: {
            responseModalities: ['image', 'text'],
            responseMimeType: 'image/png'
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Prototype] Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const result = await response.json();
    
    // 5. 提取生成的图像
    const imagePart = result.candidates?.[0]?.content?.parts?.find(
      (part: any) => part.inlineData?.mimeType?.startsWith('image/')
    );

    if (!imagePart?.inlineData?.data) {
      console.error('[Prototype] No image in response:', JSON.stringify(result).substring(0, 500));
      throw new Error('No image generated');
    }

    const imageBase64 = imagePart.inlineData.data;
    const mimeType = imagePart.inlineData.mimeType || 'image/png';

    console.log('[Prototype] Successfully generated image, size:', imageBase64.length);

    return NextResponse.json({
      success: true,
      imageBase64: `data:${mimeType};base64,${imageBase64}`
    });

  } catch (error: any) {
    console.error('[Prototype] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate prototype' },
      { status: 500 }
    );
  }
}

/**
 * 构建原型图生成的 Prompt
 */
function buildPrototypePrompt(options: {
  description: string;
  category: string;
  device: 'mobile' | 'tablet' | 'desktop';
  style?: string;
  language?: 'zh' | 'en';
}): string {
  const { description, category, device, style, language } = options;

  // 设备尺寸映射
  const deviceDimensions = {
    mobile: { width: 375, height: 812, aspect: '9:19.5' },
    tablet: { width: 768, height: 1024, aspect: '3:4' },
    desktop: { width: 1440, height: 900, aspect: '16:10' }
  };

  const dimensions = deviceDimensions[device] || deviceDimensions.mobile;

  // 类别描述
  const categoryDescriptions: Record<string, string> = {
    tool: 'utility/productivity tool',
    game: 'casual game or interactive entertainment',
    education: 'educational or learning application',
    life: 'lifestyle or daily life assistant',
    creative: 'creative or artistic application',
    social: 'social or community platform',
    business: 'business or professional tool',
    health: 'health or fitness application'
  };

  const categoryDesc = categoryDescriptions[category] || 'web application';

  // 构建 Prompt
  const prompt = `Generate a high-fidelity UI prototype mockup image for the following application:

## Application Description
${description}

## Design Specifications
- **Type**: ${categoryDesc}
- **Target Device**: ${device} (${dimensions.width}x${dimensions.height}px, aspect ratio ${dimensions.aspect})
- **Visual Style**: ${style || 'modern, clean, professional'}
- **Language**: ${language === 'zh' ? 'Chinese (Simplified)' : 'English'}

## Requirements
1. Create a realistic UI mockup that looks like a professional app design
2. Include all main UI elements: navigation, content areas, buttons, icons
3. Use appropriate colors and typography for the specified style
4. Show realistic placeholder content that matches the app description
5. The design should be visually complete and ready for development reference
6. Include appropriate spacing, shadows, and visual hierarchy
7. If it's a mobile app, show status bar and navigation elements
8. Make sure text is readable and icons are recognizable

## Output
Generate a single, complete UI prototype image in PNG format.
The image should be a clean mockup without device frames or annotations.
Focus on the actual UI design that will be implemented.`;

  return prompt;
}
