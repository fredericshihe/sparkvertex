/**
 * POST /api/compile-jsx
 * 服务端 JSX 预编译 API
 * 
 * 将包含 JSX 的 HTML 内容编译为普通 JavaScript
 * 从而消除浏览器端 Babel standalone (1.4MB) 的需要
 */

import { NextResponse } from 'next/server';
import { compileForPublish, hasJSX } from '@/lib/jsx-compiler';

const MAX_CONTENT_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(req: Request) {
  try {
    const { content } = await req.json();
    
    if (!content) {
      return NextResponse.json(
        { error: 'Missing content' },
        { status: 400 }
      );
    }
    
    if (content.length > MAX_CONTENT_SIZE) {
      return NextResponse.json(
        { error: 'Content too large' },
        { status: 413 }
      );
    }
    
    // 快速检测是否包含 JSX
    if (!hasJSX(content)) {
      return NextResponse.json({
        success: true,
        compiled: content,
        wasCompiled: false,
        message: 'No JSX detected, content unchanged'
      });
    }
    
    // 执行编译
    const result = await compileForPublish(content);
    
    return NextResponse.json({
      success: !result.error,
      compiled: result.compiled,
      wasCompiled: result.wasCompiled,
      error: result.error,
      stats: {
        originalSize: content.length,
        compiledSize: result.compiled.length,
        savedBytes: content.length - result.compiled.length
      }
    });
    
  } catch (error: any) {
    console.error('[JSX Compile API Error]', error);
    return NextResponse.json(
      { 
        error: 'Compilation failed',
        message: error.message,
        // 返回原始内容以便降级处理
        compiled: null,
        wasCompiled: false
      },
      { status: 500 }
    );
  }
}
