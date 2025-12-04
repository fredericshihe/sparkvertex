
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env.local manually
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixEnglishReasons() {
  console.log('Scanning for items with English content in analysis_reason (ZH field)...');
  
  // Fetch items where analysis_reason is not null
  // We'll filter in JS because regex filtering in Supabase/PostgREST is limited
  const { data: items, error } = await supabase
    .from('items')
    .select('id, title, analysis_reason')
    .not('analysis_reason', 'is', null);

  if (error) {
    console.error('Error fetching items:', error);
    return;
  }

  const itemsToFix = items.filter(item => {
    // Check if it has NO Chinese characters
    const hasChinese = /[\u4e00-\u9fa5]/.test(item.analysis_reason);
    return !hasChinese && item.analysis_reason.trim().length > 0;
  });

  console.log(`Found ${itemsToFix.length} items with English reasons in ZH field.`);

  for (const item of itemsToFix) {
    console.log(`Marking item ${item.id} (${item.title}) for re-analysis...`);
    console.log(`  Current Reason: ${item.analysis_reason.substring(0, 50)}...`);
    
    const { error: updateError } = await supabase
      .from('items')
      .update({ 
        last_analyzed_at: null, // Trigger re-analysis
        analysis_reason: null,  // Clear bad data
        analysis_reason_en: null // Clear potential bad data
      })
      .eq('id', item.id);

    if (updateError) {
      console.error(`  Failed to update item ${item.id}:`, updateError);
    } else {
      console.log(`  Successfully marked for re-analysis.`);
    }
  }
  
  console.log('Done.');
}

fixEnglishReasons();
