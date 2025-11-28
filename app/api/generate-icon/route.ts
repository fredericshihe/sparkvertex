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
    if (inputLength > 1000) {
      return NextResponse.json({ error: 'Input too long (max 1000 chars)' }, { status: 400 });
    }

    const siliconFlowKey = process.env.SILICONFLOW_API_KEY;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    // Construct Professional Prompt
    let finalPrompt = '';
    
    // 1. Try to use DeepSeek to generate the optimized prompt first
    if (deepseekKey && (title && description)) {
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
                content: `You are an expert Icon Designer. Your task is to generate a creative, unique, and genre-appropriate app icon prompt based on the user's input.

# Analysis & Strategy
1.  **Analyze Genre & Vibe:**
    - **Game:** Fun, dynamic, maybe Pixel Art, Cartoon, or Low Poly.
    - **Tool/Utility:** Clean, precise, Flat Design, Neumorphism, or Minimalist Line Art.
    - **Business/Finance:** Professional, abstract, Geometric, Deep colors, Glassmorphism.
    - **Lifestyle/Social:** Warm, soft, Hand-drawn, or Pastel colors.
    - **Cyberpunk/Tech:** Neon, glowing, Glitch effect, High contrast.

2.  **Select Style:** Choose the ONE most appropriate visual style from the list above. **DO NOT default to "Modern 3D minimalist" unless it truly fits.**

3.  **Composition:**
    - The icon must be suitable for a square format.
    - Keep the main subject clear and recognizable even at small sizes.
    - Background should complement the subject, not just be a generic gradient.

# Prompt Generation
Generate the image prompt using this strict format:

"Mobile app icon for '{App Title}', [Core Object/Symbol] in the center. Style: [Specific Style Name], [Style Descriptors]. Lighting: [Lighting suitable for style]. Colors: [Color Palette suitable for vibe]. Composition: [Composition details]. No borders, no frames, no rounded corners drawn, no icon container shape. The image is the icon itself."

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
          }
        }
      } catch (err) {
        console.error('DeepSeek prompt generation failed:', err);
      }
    }

    // Fallback if DeepSeek failed or not available
    if (!finalPrompt) {
      // Simple heuristic for fallback style
      let style = "Modern 3D minimalist, smooth matte texture";
      let colors = "Vibrant gradient background";
      
      const lowerDesc = (description || prompt || "").toLowerCase();
      if (lowerDesc.includes("game") || lowerDesc.includes("play")) {
        style = "Playful 3D cartoon style, bubbly shapes";
        colors = "Bright and energetic colors";
      } else if (lowerDesc.includes("tool") || lowerDesc.includes("utility")) {
        style = "Clean flat design, vector art";
        colors = "Professional solid background";
      } else if (lowerDesc.includes("cyber") || lowerDesc.includes("future")) {
        style = "Cyberpunk neon style, glowing edges";
        colors = "Dark background with neon accents";
      }

      if (title && description) {
        finalPrompt = `Mobile app icon for "${title}", ${description} in the center. Style: ${style}. Lighting: Studio lighting. Colors: ${colors}. Composition: Centered object, full bleed background. No borders, no frames, no rounded corners drawn, no icon container shape. The image is the icon itself.`;
      } else {
        finalPrompt = `Mobile app icon for "${prompt}", ${prompt} in the center. Style: ${style}. Lighting: Studio lighting. Colors: ${colors}. Composition: Centered object, full bleed background. No borders, no frames, no rounded corners drawn, no icon container shape. The image is the icon itself.`;
      }
    }

    // 1. Try SiliconFlow (Flux-1-schnell) - Priority
    if (siliconFlowKey) {
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
            num_inference_steps: 1
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`SiliconFlow API Error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const imageUrl = data.images?.[0]?.url;

        if (imageUrl) {
          // Fetch the image and convert to base64 to avoid expiration/CORS
          const imageRes = await fetch(imageUrl);
          const arrayBuffer = await imageRes.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          
          return NextResponse.json({ 
            url: `data:image/jpeg;base64,${base64}`,
            isMock: false,
            source: 'siliconflow'
          });
        }
      } catch (err) {
        console.error('SiliconFlow failed, falling back...', err);
        // Continue to other methods if this fails
      }
    }

    // 2. Fallback to Pollinations.ai (Free)
    console.log('Using Pollinations.ai (Free Fallback)...');
    
    // Construct a prompt optimized for icons
    const basePrompt = finalPrompt || `mobile app icon representing ${title || prompt}`;
    const iconPrompt = `${basePrompt}, no text, no letters, no words, symbolic, abstract, edge to edge, full bleed, no padding, no margin, single large central shape, premium color palette, elegant, clean, flat vector style with subtle gradient, high quality, 4k, square, full fill`;
    const encodedPrompt = encodeURIComponent(iconPrompt);
    const seed = Math.floor(Math.random() * 1000000);
    
    // Use Flux model for better quality
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`;

    try {
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) throw new Error('Pollinations API Error');
      
      const arrayBuffer = await imageRes.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      
      return NextResponse.json({ 
        url: `data:image/jpeg;base64,${base64}`,
        isMock: false,
        source: 'pollinations'
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
      return NextResponse.json({ 
        url: `data:image/svg+xml;base64,${base64Svg}`,
        isMock: true 
      });
    }

  } catch (error: any) {
    console.error('Generate Icon Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

