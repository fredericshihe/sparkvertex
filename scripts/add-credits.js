const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load env vars
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
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: Missing env vars (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function addCredits(email, amount) {
  if (!email || !amount) {
    console.log('Usage: node scripts/add-credits.js <email> <amount>');
    return;
  }

  console.log(`Looking up user: ${email}...`);
  
  // Note: listUsers defaults to page 1, perPage 50. 
  // For a production script, you should implement pagination.
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (error) {
    console.error('Error listing users:', error.message);
    return;
  }
  
  const user = data.users.find(u => u.email === email);
  
  if (!user) {
    console.error(`❌ User not found: ${email}`);
    return;
  }
  
  console.log(`Found user: ${user.id}`);
  
  // Get current credits
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', user.id)
    .single();
    
  if (profileError) {
     // If profile doesn't exist, we might need to create it or just warn
     console.warn('Profile not found, assuming 0 credits.');
  }

  const currentCredits = profile?.credits || 0;
  const newCredits = currentCredits + parseInt(amount);
  
  console.log(`Current credits: ${currentCredits}`);
  console.log(`Adding ${amount} credits...`);
  
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ credits: newCredits })
    .eq('id', user.id);
    
  if (updateError) {
    console.error('❌ Error updating credits:', updateError.message);
  } else {
    console.log(`✅ Success! New balance: ${newCredits}`);
  }
}

const args = process.argv.slice(2);
addCredits(args[0], args[1]);
