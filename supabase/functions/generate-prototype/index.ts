import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // 验证用户身份
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 获取请求参数
        // mode: 'prototype' (默认) = 应用原型图, 'image' = 点选编辑生成图片
        const { description, category, device, style, language, mode = 'prototype' } = await req.json();

        if (!description) {
            return new Response(JSON.stringify({ success: false, error: 'Description is required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 🔒 积分校验和扣除（仅 image 模式需要积分）
        // Gemini 2.5 Flash Image 成本：$0.039/张 ≈ ¥0.28，定价 5 积分 ≈ ¥0.50（利润率 ~44%）
        const CREDIT_COST = 5;
        let newCredits = 0;
        
        if (mode === 'image') {
            // 使用 service role 进行积分操作（绕过 RLS）
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
            
            // 获取当前积分
            const { data: profile, error: profileError } = await supabaseAdmin
                .from('profiles')
                .select('credits')
                .eq('id', user.id)
                .single();
            
            if (profileError || !profile) {
                console.error('[Prototype] Failed to get user profile:', profileError);
                return new Response(JSON.stringify({ success: false, error: 'Failed to verify credits' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            
            const currentCredits = profile.credits || 0;
            
            if (currentCredits < CREDIT_COST) {
                return new Response(JSON.stringify({ 
                    success: false, 
                    error: 'Insufficient credits',
                    errorCode: 'INSUFFICIENT_CREDITS',
                    required: CREDIT_COST,
                    current: currentCredits
                }), {
                    status: 402, // Payment Required
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            
            // 🔒 先扣除积分（在调用 AI 之前）
            newCredits = currentCredits - CREDIT_COST;
            const { error: updateError } = await supabaseAdmin
                .from('profiles')
                .update({ credits: newCredits })
                .eq('id', user.id)
                .eq('credits', currentCredits); // 乐观锁：确保积分未被其他请求修改
            
            if (updateError) {
                console.error('[Prototype] Failed to deduct credits:', updateError);
                return new Response(JSON.stringify({ success: false, error: 'Failed to deduct credits' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            
            console.log(`[Prototype] Deducted ${CREDIT_COST} credits from user ${user.id}, new balance: ${newCredits}`);
        }

        // 获取 Google API Key
        const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
        if (!googleApiKey) {
            console.error('[Prototype] Missing GOOGLE_API_KEY');
            return new Response(JSON.stringify({ success: false, error: 'API configuration error' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const isZh = language === 'zh';
        let systemPrompt = '';
        let userPrompt = '';

        if (mode === 'image') {
            // 🆕 点选编辑模式：根据用户提示词生成图片（用于替换元素图片）
            systemPrompt = isZh
                ? `你是一个专业的图像生成专家。请根据用户描述生成一张高质量的图片。

⚠️ 尺寸要求（必须严格遵守）：
- 生成正方形图片，尺寸为 1024x1024 像素
- 图片的宽度和高度都不得超过 1024 像素

图片要求：
- 风格现代、美观、高质量
- 色彩和谐、符合现代设计趋势
- 适合用作网页或应用界面中的配图
- 不要包含文字或水印
- 图片应该清晰、专业`
                : `You are a professional image generation expert. Generate a high-quality image based on the user's description.

⚠️ SIZE REQUIREMENTS (MUST STRICTLY FOLLOW):
- Generate a square image, size 1024x1024 pixels
- Image width and height MUST NOT exceed 1024 pixels

Image Requirements:
- Modern, visually appealing, high-quality style
- Harmonious colors following modern design trends
- Suitable for use as web or app interface graphics
- Do NOT include text or watermarks
- Image should be clear and professional`;

            userPrompt = isZh 
                ? `请生成以下图片：\n\n${description}`
                : `Generate the following image:\n\n${description}`;

            console.log('[Image] Generating image with Gemini 2.5 Flash Image...');
        } else {
            // 原有的应用原型图模式
            const deviceName = device === 'mobile' ? (isZh ? '移动端' : 'mobile') : (isZh ? '桌面端' : 'desktop');
            const categoryName = getCategoryName(category, isZh);
            
            // 根据设备类型设置尺寸规格（限制最大 1024 像素）
            const sizeSpec = device === 'mobile' 
                ? (isZh ? '竖屏手机界面 (宽高比 9:16，最大尺寸 576x1024 像素)' : 'vertical phone screen (aspect ratio 9:16, max size 576x1024 pixels)')
                : (isZh ? '横屏桌面界面 (宽高比 16:9，最大尺寸 1024x576 像素)' : 'horizontal desktop screen (aspect ratio 16:9, max size 1024x576 pixels)');

            systemPrompt = isZh
                ? `你是一个专业的 UI/UX 设计师。请根据用户描述生成一个现代、美观的 ${deviceName} 应用原型图。

⚠️ 尺寸要求（必须严格遵守）：
- 生成 ${sizeSpec}
- 图片的宽度和高度都不得超过 1024 像素
- ${device === 'mobile' ? '必须是竖向/纵向的手机屏幕比例，不要生成横向图片' : '必须是横向的宽屏桌面比例，不要生成竖向图片'}

设计要求：
- 应用类型: ${categoryName}
${style ? `- 设计风格: ${style}` : ''}
- 使用清晰的布局和视觉层次
- 包含真实的 UI 元素（按钮、表单、卡片等）
- 配色和谐、符合现代设计趋势
- 展示主要功能和交互区域

请生成一张高质量的 UI 原型设计图，展示应用的主界面布局和核心功能区域。`
                : `You are a professional UI/UX designer. Generate a modern, visually appealing ${deviceName} app prototype based on the user's description.

⚠️ SIZE REQUIREMENTS (MUST STRICTLY FOLLOW):
- Generate ${sizeSpec}
- Image width and height MUST NOT exceed 1024 pixels
- ${device === 'mobile' ? 'MUST be a vertical/portrait phone screen ratio, do NOT generate horizontal images' : 'MUST be a horizontal/landscape desktop ratio, do NOT generate vertical images'}

Design Requirements:
- App type: ${categoryName}
${style ? `- Design style: ${style}` : ''}
- Use clear layout and visual hierarchy
- Include realistic UI elements (buttons, forms, cards, etc.)
- Harmonious colors following modern design trends
- Show main features and interaction areas

Generate a high-quality UI prototype image showing the app's main interface layout and core feature areas.`;

            userPrompt = isZh 
                ? `请为以下应用生成原型设计图：\n\n${description}`
                : `Generate a prototype design for the following app:\n\n${description}`;

            console.log('[Prototype] Generating image with Gemini 2.5 Flash Image...');
        }

        // 使用 Gemini 2.5 Flash Image API（速度快、成本低 $0.039/张）
        // 参考: https://ai.google.dev/gemini-api/docs/image-generation
        
        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${googleApiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: systemPrompt + '\n\n' + userPrompt }
                            ]
                        }
                    ],
                    generationConfig: {
                        // Gemini 2.5 Flash Image 推荐温度 1.0
                        temperature: 1.0,
                        // 启用图片生成响应模态
                        responseModalities: ['TEXT', 'IMAGE']
                    }
                })
            }
        );

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error('[Prototype] Gemini API error:', errorText);
            
            // 🔒 AI 调用失败时回滚积分（仅 image 模式）
            if (mode === 'image') {
                const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
                const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
                await supabaseAdmin
                    .from('profiles')
                    .update({ credits: newCredits + CREDIT_COST })
                    .eq('id', user.id);
                console.log(`[Prototype] Refunded ${CREDIT_COST} credits to user ${user.id} due to API error`);
            }
            
            return new Response(JSON.stringify({ 
                success: false, 
                error: `Gemini API error: ${geminiResponse.status}` 
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const geminiData = await geminiResponse.json();
        
        // 提取生成的图像
        let imageBase64 = null;
        
        if (geminiData.candidates && geminiData.candidates[0]?.content?.parts) {
            for (const part of geminiData.candidates[0].content.parts) {
                if (part.inlineData?.data) {
                    const mimeType = part.inlineData.mimeType || 'image/png';
                    imageBase64 = `data:${mimeType};base64,${part.inlineData.data}`;
                    break;
                }
            }
        }

        if (!imageBase64) {
            console.warn('[Prototype] No image generated in response:', JSON.stringify(geminiData));
            
            // 🔒 无图片生成时回滚积分（仅 image 模式）
            if (mode === 'image') {
                const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
                const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
                await supabaseAdmin
                    .from('profiles')
                    .update({ credits: newCredits + CREDIT_COST })
                    .eq('id', user.id);
                console.log(`[Prototype] Refunded ${CREDIT_COST} credits to user ${user.id} due to no image generated`);
            }
            
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'Failed to generate image' 
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        console.log('[Prototype] Successfully generated prototype image');

        return new Response(JSON.stringify({ 
            success: true, 
            imageBase64,
            // 🔒 返回新积分值供前端更新（仅 image 模式）
            ...(mode === 'image' && { newCredits, creditCost: CREDIT_COST })
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('[Prototype] Error:', error);
        return new Response(JSON.stringify({ 
            success: false, 
            error: error.message || 'Internal server error' 
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

function getCategoryName(category: string, isZh: boolean): string {
    const categories: Record<string, { zh: string; en: string }> = {
        tool: { zh: '工具应用', en: 'Tool App' },
        game: { zh: '游戏', en: 'Game' },
        creative: { zh: '创意应用', en: 'Creative App' },
        social: { zh: '社交应用', en: 'Social App' },
        productivity: { zh: '效率工具', en: 'Productivity Tool' },
        education: { zh: '教育应用', en: 'Education App' },
        entertainment: { zh: '娱乐应用', en: 'Entertainment App' },
        business: { zh: '商务应用', en: 'Business App' },
        lifestyle: { zh: '生活应用', en: 'Lifestyle App' },
        other: { zh: '其他', en: 'Other' }
    };
    
    const cat = categories[category] || categories.other;
    return isZh ? cat.zh : cat.en;
}
