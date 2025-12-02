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
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not found');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testSignup() {
  const testEmail = `test_signup_${Date.now()}@example.com`;
  const testPassword = `Strong_${Date.now()}_${Math.random().toString(36).slice(-8)}!`;

  console.log(`Attempting to sign up with email: ${testEmail}`);
  console.log(`Supabase URL: ${supabaseUrl}`);

  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          full_name: 'Test User',
          locale: 'en'
        }
      }
    });

    const endTime = Date.now();
    console.log(`Request took ${endTime - startTime}ms`);

    if (error) {
      console.error('❌ Signup Failed!');
      console.error('Error Status:', error.status);
      console.error('Error Message:', error.message);
      console.error('Full Error:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ Signup Successful (API Response received)');
      console.log('User ID:', data.user?.id);
      console.log('Identities:', data.user?.identities);
      
      if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
        console.warn('⚠️ User created but no identities found (User might already exist or be unconfirmed).');
      }
    }
  } catch (err) {
    console.error('❌ Unexpected Script Error:', err);
  }
}

testSignup();
