
// require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Testing Supabase Connection...');
console.log('URL:', supabaseUrl);
console.log('Key exists:', !!supabaseKey);

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

async function test() {
    try {
        const { data, error } = await supabase.from('generation_tasks').select('count').limit(1);
        if (error) {
            console.error('Supabase Error:', error);
        } else {
            console.log('Supabase Connection Successful. Data:', data);
        }
    } catch (e) {
        console.error('Exception:', e);
    }
}

test();
