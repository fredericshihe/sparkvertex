const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function generateEmbedding(text) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ input: text })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Edge Function Error: ${error}`);
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    return null;
  }
}

async function backfillEmbeddings() {
  console.log('Starting embedding backfill for ALL items using full code content...');

  const pageSize = 50;
  let page = 0;
  let successCount = 0;
  let failCount = 0;
  let hasMore = true;

  while (hasMore) {
    // Fetch items with pagination
    const { data: items, error } = await supabase
      .from('items')
      .select('id, title, content')
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching items:', error);
      break;
    }

    if (!items || items.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`Processing page ${page + 1} (${items.length} items)...`);

    for (const item of items) {
      console.log(`Processing item: ${item.title} (${item.id})`);
      
      // Use content (code) for embedding, truncated to 20000 chars
      const text = item.content ? item.content.substring(0, 20000) : '';
      
      if (!text) {
        console.warn(`Skipping item ${item.id} (no content)`);
        continue;
      }

      // Add delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));

      const embedding = await generateEmbedding(text);

      if (embedding) {
        const { error: updateError } = await supabase
          .from('items')
          .update({ embedding })
          .eq('id', item.id);

        if (updateError) {
          console.error(`Failed to update item ${item.id}:`, updateError);
          failCount++;
        } else {
          console.log(`✅ Updated item ${item.id}`);
          successCount++;
        }
      } else {
        console.error(`❌ Failed to generate embedding for item ${item.id}`);
        failCount++;
      }
    }
    
    page++;
  }

  console.log(`\nBackfill complete.`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

backfillEmbeddings().catch(console.error);
