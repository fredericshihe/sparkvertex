#!/usr/bin/env node
/**
 * Run Supabase Migration
 * Usage: node scripts/run-migration.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 从 .env.local 读取配置（手动解析）
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  console.log('🚀 Running migration: process_credit_order function...\n');

  const migrationFile = path.join(__dirname, '../supabase/migrations/20251205_create_process_credit_order_function.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  try {
    // 执行 SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).catch(() => {
      // 如果 rpc 方法不存在，尝试直接执行
      return { data: null, error: new Error('RPC method not available, trying direct execution') };
    });

    // 由于 CREATE FUNCTION 需要直接执行，我们分步骤执行
    console.log('📝 Creating process_credit_order function...');
    
    // 直接通过 SQL 查询执行
    const { error: execError } = await supabase.rpc('exec_sql', { 
      query: sql 
    }).catch(async () => {
      // Fallback: 使用 REST API 直接执行
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql_query: sql })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return { error: null };
    });

    if (execError) {
      throw execError;
    }

    console.log('✅ Migration completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   - Function: process_credit_order');
    console.log('   - Purpose: Atomic order processing with row-level locking');
    console.log('   - Protection: Race condition prevention for duplicate payments');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\n📋 Alternative: Run this SQL manually in Supabase Dashboard:');
    console.log('   1. Go to: https://supabase.com/dashboard/project/waesizzoqodntrlvrwhw/sql');
    console.log('   2. Open: supabase/migrations/20251205_create_process_credit_order_function.sql');
    console.log('   3. Copy and paste the SQL into the editor');
    console.log('   4. Click "Run"');
    process.exit(1);
  }
}

// 测试函数是否创建成功
async function testFunction() {
  console.log('\n🧪 Testing function...');
  
  try {
    // 尝试调用函数（使用无效的 UUID 测试）
    const { data, error } = await supabase.rpc('process_credit_order', {
      order_id: '00000000-0000-0000-0000-000000000000',
      afdian_trade_no: 'test',
      afdian_order_info: {}
    });

    if (error && error.message.includes('does not exist')) {
      console.log('❌ Function not found. Please run migration manually.');
      return false;
    }

    console.log('✅ Function exists and is callable!');
    return true;
  } catch (error) {
    console.log('⚠️  Function test failed (this is expected if migration needs manual execution)');
    return false;
  }
}

(async () => {
  const migrationName = process.argv[2] || '20251205_create_process_credit_order_function.sql';
  
  console.log('═══════════════════════════════════════════════════');
  console.log('  Supabase Migration Runner');
  console.log('  Migration: ' + migrationName);
  console.log('═══════════════════════════════════════════════════\n');

  // 先测试函数是否已存在
  const exists = await testFunction();
  
  if (exists) {
    console.log('\n✅ Function already exists! No action needed.');
    process.exit(0);
  }

  console.log('\n⚠️  Function does not exist. Please run it manually:');
  console.log('\n📋 Steps:');
  console.log('   1. Open: https://supabase.com/dashboard/project/waesizzoqodntrlvrwhw/sql');
  console.log('   2. Click "New Query"');
  console.log('   3. Copy content from: supabase/migrations/20251205_create_process_credit_order_function.sql');
  console.log('   4. Paste and click "Run"\n');

  const migrationFile = path.join(__dirname, '../supabase/migrations/20251205_create_process_credit_order_function.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');
  
  console.log('═══════════════════════════════════════════════════');
  console.log('SQL to execute:');
  console.log('═══════════════════════════════════════════════════\n');
  console.log(sql);
  console.log('\n═══════════════════════════════════════════════════');
})();
