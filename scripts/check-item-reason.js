
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
      const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
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

async function checkItems() {
  // 搜索 MathPro
  const { data: items, error } = await supabase
    .from('items')
    .select('id, title, analysis_reason, analysis_reason_en, total_score')
    .ilike('title', '%MathPro%')
    .limit(5);

  if (error) {
    console.error('Error fetching items:', error);
    return;
  }

  console.log('Checking MathPro items:');
  items.forEach(item => {
    console.log('------------------------------------------------');
    console.log(`ID: ${item.id}`);
    console.log(`Title: ${item.title}`);
    console.log(`Score: ${item.total_score}`);
    console.log(`Reason (ZH): [${item.analysis_reason}]`);
    console.log(`Reason (EN): [${item.analysis_reason_en}]`);
    
    // 检测 Reason (ZH) 是否包含中文字符
    const hasChinese = /[\u4e00-\u9fa5]/.test(item.analysis_reason || '');
    console.log(`Reason (ZH) contains Chinese characters: ${hasChinese}`);
  });
}

checkItems();
