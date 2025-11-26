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
    const openAiKey = process.env.OPENAI_API_KEY;

    // Construct Professional Prompt
    let finalPrompt = '';
    if (title && description) {
      finalPrompt = `App icon for "${title}". Context: ${description}. Style: iOS App Store style, rounded square, minimalist, flat design with subtle gradients. Subject: A single, clear, central symbolic object. Details: High resolution, vector graphics, 4k, vibrant colors. Negative: text, letters, words, realistic photos, complex details, messy, blurry, low quality.`;
    } else {
      finalPrompt = `mobile app icon representing ${prompt}, no text, no letters, no words, symbolic, abstract, edge to edge, full bleed, no padding, no margin, single large central shape, premium color palette, elegant, clean, flat vector style with subtle gradient, high quality, 4k, square, full fill`;
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
            num_inference_steps: 20
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

    // 2. Try OpenAI DALL-E 3
    if (openAiKey) {
      console.log('Using OpenAI DALL-E 3...');
      try {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openAiKey}`
          },
          body: JSON.stringify({
            model: "dall-e-3",
            prompt: `A modern, minimalist, high-quality app icon for an application named "${prompt}". The icon should be simple, elegant, and suitable for iOS and Android home screens. Rounded square shape. Flat design with subtle gradients.`,
            n: 1,
            size: "1024x1024",
            response_format: "b64_json"
          })
        });

        if (response.ok) {
          const data = await response.json();
          const imageBase64 = data.data[0].b64_json;
          
          return NextResponse.json({ 
            url: `data:image/png;base64,${imageBase64}`,
            isMock: false,
            source: 'openai'
          });
        }
      } catch (err) {
        console.error('OpenAI failed, falling back...', err);
      }
    }

    // 3. Fallback to Pollinations.ai (Free)
    console.log('Using Pollinations.ai (Free Fallback)...');
    
    // Construct a prompt optimized for icons
    const iconPrompt = `mobile app icon representing ${prompt}, no text, no letters, no words, symbolic, abstract, edge to edge, full bleed, no padding, no margin, single large central shape, premium color palette, elegant, clean, flat vector style with subtle gradient, high quality, 4k, square, full fill`;
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
            ${prompt.slice(0, 1).toUpperCase()}
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

