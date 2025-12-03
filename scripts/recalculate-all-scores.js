const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load env vars from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
let envConfig = '';
try {
  envConfig = fs.readFileSync(envPath, 'utf8');
} catch (e) {
  console.error('Could not find .env.local at', envPath);
  process.exit(1);
}

const envVars = {};
envConfig.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    envVars[key.trim()] = value.trim();
  }
});

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
const DEEPSEEK_API_KEY = envVars.DEEPSEEK_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DEEPSEEK_API_KEY) {
  console.error('Missing environment variables in .env.local');
  console.log('Found:', { 
    URL: !!SUPABASE_URL, 
    SERVICE_KEY: !!SUPABASE_SERVICE_ROLE_KEY, 
    DEEPSEEK: !!DEEPSEEK_API_KEY 
  });
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function analyzeItem(item) {
  console.log(`Analyzing item ${item.id}: ${item.title}...`);
  
  const codeSnippet = item.content ? item.content.substring(0, 15000) : '';
  
  const systemPrompt = `You are a Senior Code Auditor and Product Manager. 
Analyze the provided HTML/JS code for a single-file web application.
Evaluate it on three dimensions (0-100 score):
1. Quality: Code cleanliness, modern practices (React/Tailwind), error handling, structure.
2. Richness: Feature completeness, UI complexity, visual appeal, interactivity.
3. Utility: Practical value, problem-solving capability, reusability.

Return ONLY a valid JSON object in this format:
{
  "quality": number,
  "richness": number,
  "utility": number,
  "reason": "Short summary of the evaluation (max 50 words)"
}`;

  const userPrompt = `Title: ${item.title}\nDescription: ${item.description}\nCode:\n${codeSnippet}`;

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      console.error(`API Error for item ${item.id}: ${response.statusText}`);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }

    const aiData = await response.json();
    const content = aiData.choices[0].message.content;
    let scores;
    
    try {
      scores = JSON.parse(content);
    } catch (e) {
      console.error(`JSON Parse Error for item ${item.id}:`, content);
      return;
    }

    const { error: updateError } = await supabase
      .from('items')
      .update({
        quality_score: scores.quality,
        richness_score: scores.richness,
        utility_score: scores.utility,
        analysis_reason: scores.reason,
        last_analyzed_at: new Date().toISOString()
      })
      .eq('id', item.id);

    if (updateError) {
      console.error(`DB Update Error for item ${item.id}:`, updateError);
    } else {
      console.log(`✅ Item ${item.id} updated. Q:${scores.quality} R:${scores.richness} U:${scores.utility}`);
    }

  } catch (err) {
    console.error(`Error processing item ${item.id}:`, err);
  }
}

async function main() {
  console.log('Starting full recalculation...');
  
  // Fetch ALL items
  const { data: items, error } = await supabase
    .from('items')
    .select('id, content, description, title');

  if (error) {
    console.error('Error fetching items:', error);
    return;
  }

  console.log(`Found ${items.length} items to analyze.`);

  for (const item of items) {
    await analyzeItem(item);
    // Add a small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('All items processed. Updating ranks...');
  try {
    const { error: rankError } = await supabase.rpc('update_daily_ranks');
    if (rankError) {
        console.error('Error updating ranks (RPC might be missing):', rankError.message);
    } else {
        console.log('Ranks updated successfully.');
    }
  } catch (e) {
      console.error('RPC call failed:', e);
  }
}

main();
