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

// Use Service Role to bypass RLS for setup/teardown
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function verifyStorage() {
  console.log('Checking Supabase Storage configuration...');
  const bucketName = 'temp-generations';
  const testFileName = `test-${Date.now()}.txt`;
  const fileContent = 'Supabase verification test';

  // 1. Upload with Admin (Bypass RLS)
  console.log(`Attempting to upload test file to bucket '${bucketName}' (using Service Role)...`);
  const { data: uploadData, error: uploadError } = await supabaseAdmin
    .storage
    .from(bucketName)
    .upload(testFileName, fileContent);

  if (uploadError) {
    console.error('❌ Upload failed:', uploadError.message);
    return;
  }
  console.log('✅ Upload successful.');

  // 2. Check Public URL Access
  const { data: publicUrlData } = supabaseAdmin
    .storage
    .from(bucketName)
    .getPublicUrl(testFileName);

  const publicUrl = publicUrlData.publicUrl;
  console.log(`Testing Public URL: ${publicUrl}`);
  
  try {
    const response = await fetch(publicUrl);
    if (response.ok) {
      const text = await response.text();
      if (text === fileContent) {
        console.log('✅ Public URL access successful (Bucket is Public).');
      } else {
        console.warn('⚠️ Public URL returned 200 but content did not match.');
      }
    } else {
      console.log(`ℹ️ Public URL returned ${response.status} (Bucket is likely Private).`);
    }
  } catch (e) {
    console.error('❌ Error fetching Public URL:', e.message);
  }

  // 3. Check Signed URL Access
  console.log('Testing Signed URL...');
  const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin
    .storage
    .from(bucketName)
    .createSignedUrl(testFileName, 60);

  if (signedUrlError) {
    console.error('❌ Failed to create Signed URL:', signedUrlError.message);
  } else {
    const signedUrl = signedUrlData.signedUrl;
    console.log(`Signed URL created.`);
    try {
      const response = await fetch(signedUrl);
      if (response.ok) {
        const text = await response.text();
        if (text === fileContent) {
          console.log('✅ Signed URL access successful.');
        } else {
          console.warn('⚠️ Signed URL returned 200 but content did not match.');
        }
      } else {
        console.error(`❌ Signed URL returned ${response.status}.`);
      }
    } catch (e) {
      console.error('❌ Error fetching Signed URL:', e.message);
    }
  }

  // Cleanup
  console.log('Cleaning up test file...');
  const { error: deleteError } = await supabaseAdmin
    .storage
    .from(bucketName)
    .remove([testFileName]);
  
  if (deleteError) {
    console.warn('⚠️ Failed to delete test file:', deleteError.message);
  } else {
    console.log('✅ Cleanup successful.');
  }
}

verifyStorage().catch(console.error);
