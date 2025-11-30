import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  // 1. Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  try {
    // --- SECURITY CHECK START ---
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    // Verify Service Role Key
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const token = authHeader.replace('Bearer ', '');

    if (!serviceRoleKey) {
      console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is not set in the environment.');
      return new Response(JSON.stringify({ error: 'Server Configuration Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (token !== serviceRoleKey) {
      console.warn('Unauthorized access attempt to generate-image');
      return new Response(JSON.stringify({
        error: 'Unauthorized: Direct access restricted.'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    // --- SECURITY CHECK END ---

    const { prompt, model, image_size, num_inference_steps } = await req.json();
    const apiKey = Deno.env.get('SILICONFLOW_API_KEY');
    
    if (!apiKey) throw new Error('Missing SILICONFLOW_API_KEY');
    if (!prompt) throw new Error('Missing prompt');

    console.log(`Generating image with prompt: ${prompt.substring(0, 50)}...`);

    // 2. Call SiliconFlow API
    const response = await fetch('https://api.siliconflow.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || "black-forest-labs/FLUX.1-schnell",
        prompt: prompt,
        image_size: image_size || "1024x1024",
        num_inference_steps: num_inference_steps || 4
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SiliconFlow API Error:', errorText);
      return new Response(JSON.stringify({
        error: 'SiliconFlow API Error',
        details: errorText
      }), {
        status: response.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    const data = await response.json();

    // 3. Return result
    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error: any) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal Server Error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
