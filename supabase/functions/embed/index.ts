import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Security Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');
    
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const token = authHeader.replace('Bearer ', '');

    if (!serviceRoleKey || token !== serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const { input, inputs } = await req.json();
    if (!input && !inputs) throw new Error('Missing input text or inputs array');

    // Use Google Gemini for Embeddings
    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    if (!apiKey) throw new Error('Missing GOOGLE_API_KEY');

    // Handle Batch Request (inputs array)
    if (inputs && Array.isArray(inputs)) {
        const batchResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                requests: inputs.map(text => ({
                    model: 'models/gemini-embedding-001',
                    content: { parts: [{ text }] },
                    outputDimensionality: 768
                }))
            })
        });

        if (!batchResponse.ok) {
            const error = await batchResponse.text();
            throw new Error(`Google Batch API Error: ${error}`);
        }

        const batchData = await batchResponse.json();
        const embeddings = batchData.embeddings.map((e: any) => e.values);

        return new Response(JSON.stringify({ embeddings }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // Handle Single Request (Legacy support)
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: {
          parts: [{ text: input }]
        },
        outputDimensionality: 768 // Optional: Explicitly set dimension, though 768 is default for 004
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google API Error: ${error}`);
    }

    const data = await response.json();
    const embedding = data.embedding.values;

    return new Response(JSON.stringify({ embedding }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
