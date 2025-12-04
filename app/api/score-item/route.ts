import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { itemId } = await req.json();

    if (!itemId) {
      return NextResponse.json({ error: '缺少 itemId' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // 调用 score-items Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/score-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ id: itemId })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('评分函数调用失败:', errorText);
      return NextResponse.json({ error: '评分失败' }, { status: 500 });
    }

    const result = await response.json();
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('API 错误:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
