/**
 * 批量重新评分脚本
 * 使用方法: npx ts-node scripts/rescore-all-items.ts
 * 
 * 需要设置环境变量:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY (或 NEXT_PUBLIC_SUPABASE_ANON_KEY)
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Edge Function URL
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/score-items`;

// 配置
const BATCH_SIZE = 5; // 每批处理数量
const DELAY_BETWEEN_ITEMS = 2000; // 每个项目间隔 (ms)
const DELAY_BETWEEN_BATCHES = 10000; // 每批间隔 (ms)

async function main() {
  console.log('🚀 开始批量重新评分...\n');

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ 缺少环境变量: NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 获取所有作品
  console.log('📋 正在获取作品列表...');
  const { data: items, error } = await supabase
    .from('items')
    .select('id, title')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ 获取作品列表失败:', error.message);
    process.exit(1);
  }

  if (!items || items.length === 0) {
    console.log('✅ 没有作品需要处理');
    process.exit(0);
  }

  console.log(`📊 共找到 ${items.length} 个作品\n`);

  let successCount = 0;
  let errorCount = 0;
  const errors: { id: string; title: string; error: string }[] = [];

  // 分批处理
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(items.length / BATCH_SIZE);

    console.log(`\n📦 处理第 ${batchNum}/${totalBatches} 批 (${batch.length} 个作品)`);
    console.log('─'.repeat(50));

    for (const item of batch) {
      try {
        process.stdout.write(`  🔄 [${i + batch.indexOf(item) + 1}/${items.length}] ${item.title?.substring(0, 30) || item.id}... `);

        const response = await fetch(EDGE_FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({ id: item.id }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        const result = await response.json();
        
        if (result.results && result.results.length > 0) {
          const score = result.results[0];
          console.log(`✅ 总分: ${score.total_score} (Q:${score.quality} R:${score.richness} U:${score.utility})`);
          successCount++;
        } else if (result.message) {
          console.log(`⏭️ ${result.message}`);
        } else {
          console.log('✅ 完成');
          successCount++;
        }

        // 项目间延迟
        await sleep(DELAY_BETWEEN_ITEMS);

      } catch (err: any) {
        console.log(`❌ 失败: ${err.message}`);
        errorCount++;
        errors.push({
          id: item.id,
          title: item.title || 'Untitled',
          error: err.message,
        });

        // 如果是速率限制，等待更长时间
        if (err.message.includes('429') || err.message.includes('rate')) {
          console.log('  ⏳ 检测到速率限制，等待 30 秒...');
          await sleep(30000);
        }
      }
    }

    // 批次间延迟
    if (i + BATCH_SIZE < items.length) {
      console.log(`\n⏳ 等待 ${DELAY_BETWEEN_BATCHES / 1000} 秒后继续下一批...`);
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  // 打印统计
  console.log('\n' + '═'.repeat(50));
  console.log('📊 处理完成统计');
  console.log('═'.repeat(50));
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ 失败: ${errorCount}`);
  console.log(`📦 总计: ${items.length}`);

  if (errors.length > 0) {
    console.log('\n❌ 失败列表:');
    errors.forEach((e, idx) => {
      console.log(`  ${idx + 1}. [${e.id}] ${e.title}: ${e.error}`);
    });
  }

  // 触发排名更新
  console.log('\n🏆 正在更新排名...');
  try {
    await supabase.rpc('update_daily_ranks');
    console.log('✅ 排名更新完成');
  } catch (e: any) {
    console.warn('⚠️ 排名更新失败:', e.message);
  }

  console.log('\n🎉 全部完成！');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
