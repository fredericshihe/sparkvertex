import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    // 1. Security Check: Verify User Session
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: Please login first' }, { status: 401 });
    }

    // 2. Rate Limiting & Quota
    // Limit: 20 per minute, 50 per day
    const { allowed, error: rateLimitError } = await checkRateLimit(
      supabase, 
      session.user.id, 
      'generate-icon', 
      20, 
      50
    );

    if (!allowed) {
      return NextResponse.json({ error: rateLimitError }, { status: 429 });
    }

    const { prompt, title, description } = await request.json();

    if (!prompt && (!title || !description)) {
      return NextResponse.json({ error: 'Prompt or Title/Description is required' }, { status: 400 });
    }

    // 3. Security Check: Input Validation
    const inputLength = (prompt?.length || 0) + (title?.length || 0) + (description?.length || 0);
    if (inputLength > 5000) {
      return NextResponse.json({ error: 'Input too long (max 5000 chars)' }, { status: 400 });
    }

    // User provided specific key for SiliconFlow
    const siliconFlowKey = 'sk-zuggbrweuquheciuetyncladlbuxkfimoqnpawyloigutjnv';
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    
    // Debug Info Collector
    const debugInfo = {
      hasDeepSeekKey: !!deepseekKey,
      hasSiliconFlowKey: !!siliconFlowKey,
      promptSource: 'heuristic',
      imageSource: 'svg',
      finalPrompt: '',
      trace: [] as string[]
    };

    // Construct Professional Prompt
    let finalPrompt = '';
    
    // 1. Try to use DeepSeek to generate the optimized prompt first
    if (deepseekKey && (title && description)) {
      debugInfo.trace.push('DeepSeek: Started');
      try {
        console.log('Using DeepSeek to optimize icon prompt...');
        const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deepseekKey}`
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              {
                role: "system",
                content: `You are a World-Class App Icon Designer (Apple Design Award Winner). Your task is to craft the perfect prompt for an AI image generator (Flux/Midjourney) to create a stunning, production-ready app icon.

# Core Philosophy
- **Less is More:** The best icons are simple, memorable, and scalable.
- **Visual Metaphor:** Do not just describe the app literally. Use abstract symbols or clever metaphors (e.g., for a "Speed Browser", use a stylized rocket or lightning, not a web page).
- **Vibrancy:** Use rich, deep, and harmonious colors. Avoid muddy or dull tones.
- **No Text:** Icons must NEVER contain text.

# Analysis Strategy
1.  **Analyze the App:** Understand the core value proposition from the Title and Description.
2.  **Determine the Vibe:**
    - **Game:** Playful, 3D Render, Claymorphism, Low Poly, Vibrant.
    - **Productivity:** Clean, Minimalist, Glassmorphism, Frosted Glass, Swiss Design.
    - **Creative/Art:** Abstract, Fluid shapes, Watercolor, Ink, Surreal.
    - **Tech/Dev:** Geometric, Neon, Cyberpunk, Dark Mode, Blueprint.
    - **Lifestyle:** Soft, Pastel, Organic, Hand-drawn, Warm lighting.
3.  **Select the Style:** Choose the ONE most impactful style.

# Prompt Construction Rules
Generate a prompt string following this structure:
"App icon for '{App Title}', [Central Subject/Metaphor]. Style: [Specific Style Name], [3-4 Visual Adjectives]. Lighting: [Lighting Setup]. Colors: [Specific Color Palette]. Composition: [Composition Details]. High quality, 8k, masterpiece. Negative prompt: text, letters, words, ui elements, buttons, screenshots, phone frame, borders, low quality, blurry."

# Example
Input: "Spark Notes - A fast note taking app"
Output: "App icon for 'Spark Notes', a glowing minimalist feather pen floating above a paper plane. Style: MacOS Big Sur style, 3D icon, soft shadows, depth. Lighting: Soft studio lighting from top left. Colors: Gradient from electric blue to purple, white accents. Composition: Centered, floating, clean background. High quality, 8k, masterpiece. Negative prompt: text, letters, words, ui elements, buttons, screenshots, phone frame, borders, low quality, blurry."

# Execution
Output ONLY the generated prompt string. Do not include any other text.`
              },
              {
                role: "user",
                content: `App Name: ${title}\nDescription: ${description}`
              }
            ],
            temperature: 0.7
          })
        });

        if (deepseekResponse.ok) {
          const data = await deepseekResponse.json();
          const generatedContent = data.choices?.[0]?.message?.content?.trim();
          if (generatedContent) {
            finalPrompt = generatedContent.replace(/^"|"$/g, ''); // Remove quotes if present
            console.log('DeepSeek generated prompt:', finalPrompt);
            debugInfo.promptSource = 'deepseek';
            debugInfo.trace.push('DeepSeek: Success');
          } else {
            debugInfo.trace.push('DeepSeek: Empty Response');
          }
        } else {
            const errText = await deepseekResponse.text();
            console.error('DeepSeek API Error:', errText);
            debugInfo.trace.push(`DeepSeek: Failed (${deepseekResponse.status})`);
        }
      } catch (err: any) {
        console.error('DeepSeek prompt generation failed:', err);
        debugInfo.trace.push(`DeepSeek: Error (${err.message})`);
      }
    } else {
        debugInfo.trace.push('DeepSeek: Skipped (Missing Key or Data)');
    }

    // Fallback if DeepSeek failed or not available
    if (!finalPrompt) {
      debugInfo.trace.push('Fallback: Activated');
      // Enhanced Heuristic for Intelligent Prompt Generation
      const lowerDesc = (description || prompt || "").toLowerCase();
      const lowerTitle = (title || "").toLowerCase();
      const combinedText = `${lowerTitle} ${lowerDesc}`;

      let style = "Modern 3D minimalist, smooth matte texture, claymorphism";
      let colors = "Vibrant gradient background, soft pastel accents";
      let metaphor = "abstract geometric shape representing the core functionality";

      // 1. Determine App Type & Vibe
      if (combinedText.includes("game") || combinedText.includes("play") || combinedText.includes("arcade")) {
        style = "Playful 3D cartoon style, bubbly shapes, low poly, vibrant, fortnite style";
        colors = "Bright and energetic colors, orange, purple and blue";
        metaphor = "stylized game controller or character mascot";
      } else if (combinedText.includes("tool") || combinedText.includes("utility") || combinedText.includes("calculator") || combinedText.includes("converter")) {
        style = "Clean flat design, vector art, swiss design, minimalist, apple ios style";
        colors = "Professional solid background, blue and white, high contrast";
        metaphor = "simplified gear or wrench or mathematical symbol";
      } else if (combinedText.includes("finance") || combinedText.includes("money") || combinedText.includes("wallet")) {
        style = "Premium glassmorphism, frosted glass, metallic texture, secure";
        colors = "Emerald green, gold, and dark navy";
        metaphor = "stylized coin or shield or wallet";
      } else if (combinedText.includes("health") || combinedText.includes("fitness") || combinedText.includes("meditation")) {
        style = "Organic, soft lighting, zen, nature-inspired, rounded corners";
        colors = "Sage green, soft teal, bamboo color, white";
        metaphor = "lotus flower or heartbeat line or leaf";
      } else if (combinedText.includes("social") || combinedText.includes("chat") || combinedText.includes("connect")) {
        style = "Friendly, rounded, bubble-like, gradient mesh";
        colors = "Hot pink, electric blue, purple gradient";
        metaphor = "speech bubble or connecting nodes or smiling face";
      } else if (combinedText.includes("cyber") || combinedText.includes("future") || combinedText.includes("ai") || combinedText.includes("bot")) {
        style = "Cyberpunk neon style, glowing edges, glassmorphism, futuristic, holographic";
        colors = "Dark background with neon purple and cyan accents";
        metaphor = "glowing brain circuit or robot eye or digital spark";
      } else if (combinedText.includes("art") || combinedText.includes("design") || combinedText.includes("photo")) {
        style = "Abstract fluid shapes, watercolor, artistic, surreal, colorful";
        colors = "Colorful, rainbow, pastel, vivid";
        metaphor = "palette or brush or camera lens or abstract splash";
      }

      const subject = title || prompt || "app icon";
      // Assemble the High-Quality Prompt
      finalPrompt = `App icon for "${subject}", featuring a ${metaphor} in the center. Style: ${style}. Lighting: Soft studio lighting, rim lighting. Colors: ${colors}. Composition: Centered object, simple background, enough padding. High quality, 8k, masterpiece, trending on artstation. Negative prompt: text, letters, words, ui elements, buttons, screenshots, phone frame, borders, low quality, blurry, complex details.`;
    }
    
    debugInfo.finalPrompt = finalPrompt;

    // 1. Try SiliconFlow (Flux-1-schnell) - Priority
    if (siliconFlowKey) {
      debugInfo.trace.push('SiliconFlow: Started');
      console.log('Using SiliconFlow API (Flux-1-schnell)...');
      try {
        const response = await fetch('https://api.siliconflow.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${siliconFlowKey}`
          },
          body: JSON.stringify({
            model: "black-forest-labs/FLUX.1-schnell",
            prompt: finalPrompt,
            image_size: "1024x1024",
            num_inference_steps: 4 // Increased for better quality
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          debugInfo.trace.push(`SiliconFlow: Failed (${response.status})`);
          throw new Error(`SiliconFlow API Error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const imageUrl = data.images?.[0]?.url;

        if (imageUrl) {
          // Fetch the image and convert to base64 to avoid expiration/CORS
          const imageRes = await fetch(imageUrl);
          const arrayBuffer = await imageRes.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          
          debugInfo.imageSource = 'siliconflow';
          debugInfo.trace.push('SiliconFlow: Success');
          return NextResponse.json({ 
            url: `data:image/jpeg;base64,${base64}`,
            isMock: false,
            source: 'siliconflow',
            debug: debugInfo
          });
        } else {
            debugInfo.trace.push('SiliconFlow: No Image URL');
        }
      } catch (err: any) {
        console.error('SiliconFlow failed, falling back...', err);
        debugInfo.trace.push(`SiliconFlow: Error (${err.message})`);
        // Continue to other methods if this fails
      }
    } else {
        debugInfo.trace.push('SiliconFlow: Skipped (Missing Key)');
    }

    // 2. Fallback to Pollinations.ai (Free)
    debugInfo.trace.push('Pollinations: Started');
    console.log('Using Pollinations.ai (Free Fallback)...');
    
    // Construct a prompt optimized for icons
    const basePrompt = finalPrompt || `mobile app icon representing ${title || prompt}, minimalist, vector art, clean`;
    // Enhanced Pollinations prompt
    const iconPrompt = `${basePrompt}, (masterpiece), (best quality), (ultra-detailed), (8k), (illustration), (3d render), centered, simple background, vector style, flat design, smooth, sharp focus, no text, no watermark, no letters, no ui, no borders, no frame`;
    
    const encodedPrompt = encodeURIComponent(iconPrompt);
    const seed = Math.floor(Math.random() * 1000000);
    
    // Use Flux model for better quality
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`;

    try {
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) throw new Error('Pollinations API Error');
      
      const arrayBuffer = await imageRes.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      
      debugInfo.imageSource = 'pollinations';
      return NextResponse.json({ 
        url: `data:image/jpeg;base64,${base64}`,
        isMock: false,
        source: 'pollinations',
        debug: debugInfo
      });
    } catch (err) {
      console.error('Pollinations fallback failed:', err);
      // Fallback to SVG if even Pollinations fails
      const color1 = '#' + Math.floor(Math.random()*16777215).toString(16);
      const color2 = '#' + Math.floor(Math.random()*16777215).toString(16);
      const displayLetter = (title || prompt || 'A').slice(0, 1).toUpperCase();
      const svg = `
        <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
              <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
            </linearGradient>
          </defs>
          <rect width="1024" height="1024" fill="url(#grad)" rx="220" />
          <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="400" fill="white" text-anchor="middle" dy=".3em" font-weight="bold">
            ${displayLetter}
          </text>
        </svg>
      `;
      const base64Svg = Buffer.from(svg).toString('base64');
      
      debugInfo.imageSource = 'svg';
      return NextResponse.json({ 
        url: `data:image/svg+xml;base64,${base64Svg}`,
        isMock: true,
        debug: debugInfo
      });
    }

  } catch (error: any) {
    console.error('Generate Icon Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

