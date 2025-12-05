#!/usr/bin/env node
/**
 * 直接执行 SQL Migration
 * Usage: node scripts/execute-sql.js <migration-file>
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 从 .env.local 读取配置
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;

const migrationName = process.argv[2] || '20251205_fix_order_matching.sql';
const migrationFile = path.join(__dirname, '../supabase/migrations', migrationName);

if (!fs.existsSync(migrationFile)) {
  console.error('❌ Migration file not found:', migrationFile);
  process.exit(1);
}

const sql = fs.readFileSync(migrationFile, 'utf8');

console.log('═══════════════════════════════════════════════════');
console.log('  直接执行 SQL Migration');
console.log('  File: ' + migrationName);
console.log('═══════════════════════════════════════════════════\n');

console.log('SQL Content:');
console.log('---------------------------------------------------');
console.log(sql);
console.log('---------------------------------------------------\n');

console.log('⚠️  无法通过 Node.js 客户端直接执行 DDL 语句');
console.log('请手动执行以下步骤:\n');
console.log('1. 打开 Supabase SQL Editor:');
console.log('   https://supabase.com/dashboard/project/waesizzoqodntrlvrwhw/sql\n');
console.log('2. 点击 "New Query"\n');
console.log('3. 复制上面的 SQL 内容\n');
console.log('4. 粘贴并点击 "Run"\n');
console.log('═══════════════════════════════════════════════════');
