const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

console.log('Script started...');

// Load env vars from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const googleApiKey = process.env.GOOGLE_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}

if (!googleApiKey) {
    console.warn('Warning: GOOGLE_API_KEY not found. Cannot perform local analysis.');
} else {
    console.log('GOOGLE_API_KEY found. Using local analysis mode.');
}

// Use Service Role to bypass RLS
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function reanalyzeAll() {
  console.log('Fetching all items...');
  
  // Fetch all item IDs
  const { data: items, error } = await supabase
    .from('items')
    .select('id, title')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching items:', error);
    return;
  }

  console.log(`Found ${items.length} items. Starting re-analysis...`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`[${i + 1}/${items.length}] Analyzing: ${item.title} (${item.id})...`);

    try {
      // Invoke the Edge Function for a single item
      const { data, error: fnError } = await supabase.functions.invoke('score-items', {
        body: { id: item.id }
      });

      if (fnError) {
        console.error(`❌ Function invocation failed for ${item.id}:`, fnError);
        failCount++;
      } else {
        if (data && data.error) {
             console.error(`❌ Analysis failed for ${item.id}:`, data.error);
             failCount++;
        } else {
             console.log(`✅ Success.`);
             successCount++;
        }
      }
    } catch (e) {
      console.error(`❌ Exception for ${item.id}:`, e.message);
      failCount++;
    }

    // Add a delay to avoid hitting rate limits (Gemini API)
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('-----------------------------------');
  console.log(`Re-analysis complete.`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

reanalyzeAll().catch(console.error);
