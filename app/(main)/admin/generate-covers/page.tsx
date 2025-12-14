'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getPreviewContent } from '@/lib/preview';
import Link from 'next/link';

interface ItemToProcess {
  id: string;
  title: string;
  content: string;
  cover_url?: string;
}

export default function GenerateCoversPage() {
  const [items, setItems] = useState<ItemToProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentItem, setCurrentItem] = useState<ItemToProcess | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const processingRef = useRef(false);

  // 检查管理员权限
  useEffect(() => {
    const checkAdmin = async () => {
      // 开发环境直接允许访问
      const isDev = typeof window !== 'undefined' && 
                    (window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1');
      
      if (isDev) {
        setIsAdmin(true);
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      
      // 检查是否是管理员（可以根据需要修改判断逻辑）
      const adminEmails = ['admin@sparkvertex.com'];
      const isAdminUser = adminEmails.includes(session.user.email || '') || 
                          session.user.user_metadata?.role === 'admin';
      
      setIsAdmin(isAdminUser);
      setLoading(false);
    };
    
    checkAdmin();
  }, []);

  // 加载需要处理的作品
  const loadItems = async () => {
    setLoading(true);
    addLog('正在加载作品列表...');
    
    try {
      let query = supabase
        .from('items')
        .select('id, title, content, cover_url')
        .not('content', 'is', null)
        .order('created_at', { ascending: false });
      
      if (onlyMissing) {
        query = query.or('cover_url.is.null,cover_url.eq.');
      }
      
      const { data, error } = await query.limit(500);
      
      if (error) throw error;
      
      const validItems = (data || []).filter(item => item.content && item.content.trim().length > 0);
      setItems(validItems);
      addLog(`找到 ${validItems.length} 个作品需要处理`);
    } catch (err: any) {
      addLog(`加载失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadItems();
    }
  }, [isAdmin, onlyMissing]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 99)]);
  };

  // 带超时的 Promise
  const withTimeout = <T,>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
    ]);
  };

  // 处理单个作品 - 在 iframe 内部执行 html2canvas
  const processItem = async (item: ItemToProcess): Promise<boolean> => {
    setCurrentItem(item);
    
    // 诊断信息
    const contentLength = item.content?.length || 0;
    const hasBody = item.content?.includes('<body') || false;
    const hasHtml = item.content?.includes('<html') || false;
    const hasCanvas = item.content?.includes('<canvas') || false;
    const hasVue = item.content?.includes('Vue') || item.content?.includes('v-') || false;
    const hasReact = item.content?.includes('React') || item.content?.includes('react-dom') || false;
    
    addLog(`处理中: ${item.title} (${item.id})`);
    addLog(`  内容: ${contentLength} 字符, body:${hasBody}, html:${hasHtml}, canvas:${hasCanvas}, vue:${hasVue}, react:${hasReact}`);

    return new Promise(async (resolve) => {
      try {
        // 移除之前的 iframe
        const existingIframe = document.getElementById('cover-generator-iframe');
        if (existingIframe) existingIframe.remove();

        // 创建 iframe
        const iframe = document.createElement('iframe');
        iframe.id = 'cover-generator-iframe';
        iframe.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px;border:none;background:#fff;z-index:99999;';
        
        // 注入 html2canvas 脚本到内容中
        const html2canvasCDN = 'https://cdn.bootcdn.net/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        
        // 保留原有脚本，让内容正常渲染
        let contentToRender = item.content;
        
        // 只移除危险的事件处理器，保留脚本
        contentToRender = contentToRender.replace(/on(error|load)="[^"]*"/gi, '');
        
        // 在 </body> 或 </html> 前注入截图脚本，延长等待时间让 JS 框架渲染
        const captureScript = `
          <script src="${html2canvasCDN}"><\/script>
          <script>
            (function() {
              var captureAttempts = 0;
              var maxAttempts = 10;
              
              function attemptCapture() {
                captureAttempts++;
                console.log('[Cover] Attempt', captureAttempts);
                
                // 检查页面是否有可见内容
                var body = document.body;
                var hasContent = body && body.innerHTML.trim().length > 100;
                var hasVisibleElements = document.querySelectorAll('div, p, h1, h2, h3, span, img, canvas, svg').length > 0;
                
                console.log('[Cover] Has content:', hasContent, 'Visible elements:', hasVisibleElements);
                
                // 如果还没有内容且未达到最大尝试次数，继续等待
                if (captureAttempts < maxAttempts && !hasVisibleElements) {
                  setTimeout(attemptCapture, 500);
                  return;
                }
                
                // 等待图片加载
                var images = document.querySelectorAll('img');
                var loadPromises = Array.from(images).map(function(img) {
                  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
                  return new Promise(function(resolve) {
                    img.onload = resolve;
                    img.onerror = resolve;
                    setTimeout(resolve, 2000);
                  });
                });
                
                Promise.all(loadPromises).then(function() {
                  // 额外等待让 CSS 动画和字体加载
                  setTimeout(function() {
                    if (typeof html2canvas === 'undefined') {
                      window.parent.postMessage({ type: 'coverError', error: 'html2canvas not loaded' }, '*');
                      return;
                    }
                    
                    html2canvas(document.body, {
                      useCORS: true,
                      allowTaint: true,
                      backgroundColor: '#ffffff',
                      scale: 1,
                      logging: false,
                      width: 800,
                      height: 600
                    }).then(function(canvas) {
                      var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                      window.parent.postMessage({ type: 'coverCaptured', dataUrl: dataUrl }, '*');
                    }).catch(function(err) {
                      window.parent.postMessage({ type: 'coverError', error: err.message }, '*');
                    });
                  }, 500);
                });
              }
              
              // 开始尝试截图
              if (document.readyState === 'complete') {
                setTimeout(attemptCapture, 1000);
              } else {
                window.addEventListener('load', function() {
                  setTimeout(attemptCapture, 1000);
                });
              }
            })();
          <\/script>
        `;
        
        // 注入脚本到内容末尾
        if (contentToRender.includes('</body>')) {
          contentToRender = contentToRender.replace('</body>', captureScript + '</body>');
        } else if (contentToRender.includes('</html>')) {
          contentToRender = contentToRender.replace('</html>', captureScript + '</html>');
        } else {
          contentToRender = contentToRender + captureScript;
        }
        
        // 设置消息监听
        const messageHandler = async (event: MessageEvent) => {
          if (event.data?.type === 'coverCaptured') {
            window.removeEventListener('message', messageHandler);
            clearTimeout(timeoutId);
            
            const dataUrl = event.data.dataUrl;
            addLog(`  截图完成，大小: ${Math.round(dataUrl.length / 1024)} KB`);
            
            // 检查是否是白屏
            const img = new Image();
            img.onload = async () => {
              const testCanvas = document.createElement('canvas');
              testCanvas.width = 100;
              testCanvas.height = 100;
              const ctx = testCanvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, 100, 100);
                const imageData = ctx.getImageData(0, 0, 100, 100);
                const pixels = imageData.data;
                let nonWhitePixels = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                  if (pixels[i] < 250 || pixels[i+1] < 250 || pixels[i+2] < 250) {
                    nonWhitePixels++;
                  }
                }
                
                addLog(`  非白像素数: ${nonWhitePixels}`);
                
                if (nonWhitePixels < 50) {
                  addLog(`  ⚠️ 截图是白屏，跳过上传`);
                  iframe.remove();
                  resolve(false);
                  return;
                }
              }
              
              // 上传封面
              try {
                const response = await fetch('/api/generate-cover', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ itemId: item.id, coverDataUrl: dataUrl })
                });
                
                if (response.ok) {
                  addLog(`  ✅ 成功生成封面`);
                  iframe.remove();
                  resolve(true);
                } else {
                  const err = await response.json();
                  addLog(`  ❌ 上传失败: ${err.error}`);
                  iframe.remove();
                  resolve(false);
                }
              } catch (e: any) {
                addLog(`  ❌ 上传出错: ${e.message}`);
                iframe.remove();
                resolve(false);
              }
            };
            img.onerror = () => {
              addLog(`  ❌ 无法加载截图图片`);
              iframe.remove();
              resolve(false);
            };
            img.src = dataUrl;
            
          } else if (event.data?.type === 'coverError') {
            window.removeEventListener('message', messageHandler);
            clearTimeout(timeoutId);
            addLog(`  ❌ 截图出错: ${event.data.error}`);
            iframe.remove();
            resolve(false);
          }
        };
        
        window.addEventListener('message', messageHandler);
        
        // 超时处理
        const timeoutId = setTimeout(() => {
          window.removeEventListener('message', messageHandler);
          addLog(`  ❌ 超时，未收到截图结果`);
          iframe.remove();
          resolve(false);
        }, 20000);
        
        // 使用 srcdoc 加载内容
        iframe.srcdoc = contentToRender;
        document.body.appendChild(iframe);
        
        addLog(`  iframe 已创建，等待截图...`);
        
      } catch (err: any) {
        addLog(`  ❌ 处理出错: ${err.message}`);
        const existingIframe = document.getElementById('cover-generator-iframe');
        if (existingIframe) existingIframe.remove();
        resolve(false);
      }
    });
  };
  // 开始批量处理
  const startProcessing = async () => {
    if (items.length === 0) {
      addLog('没有需要处理的作品');
      return;
    }

    setProcessing(true);
    processingRef.current = true;
    setProcessedCount(0);
    setErrorCount(0);
    setCurrentIndex(0);

    addLog(`开始批量处理 ${items.length} 个作品...`);

    for (let i = 0; i < items.length; i++) {
      if (!processingRef.current) {
        addLog('处理已停止');
        break;
      }

      setCurrentIndex(i);
      const success = await processItem(items[i]);
      
      if (success) {
        setProcessedCount(prev => prev + 1);
      } else {
        setErrorCount(prev => prev + 1);
      }

      // 间隔 500ms 避免过快
      await new Promise(r => setTimeout(r, 500));
    }

    setProcessing(false);
    processingRef.current = false;
    setCurrentItem(null);
    addLog(`处理完成! 成功: ${processedCount}, 失败: ${errorCount}`);
  };

  // 停止处理
  const stopProcessing = () => {
    processingRef.current = false;
    addLog('正在停止...');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <i className="fa-solid fa-circle-notch fa-spin text-4xl text-brand-500 mb-4"></i>
          <p className="text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <i className="fa-solid fa-lock text-4xl text-red-500 mb-4"></i>
          <p className="text-slate-400 mb-4">无权限访问此页面</p>
          <Link href="/" className="text-brand-500 hover:underline">返回首页</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">批量生成封面图</h1>
            <p className="text-slate-400">为现有作品自动生成预览封面</p>
          </div>
          <Link href="/" className="text-slate-400 hover:text-white transition">
            <i className="fa-solid fa-arrow-left mr-2"></i>返回
          </Link>
        </div>

        {/* Controls */}
        <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-6 mb-6">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={onlyMissing}
                onChange={(e) => setOnlyMissing(e.target.checked)}
                disabled={processing}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-brand-500 focus:ring-brand-500"
              />
              <span className="text-slate-300">仅处理缺少封面的作品</span>
            </label>
            
            <button 
              onClick={loadItems}
              disabled={processing}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition disabled:opacity-50"
            >
              <i className="fa-solid fa-refresh mr-2"></i>刷新列表
            </button>
          </div>

          <div className="flex items-center gap-4">
            {!processing ? (
              <button 
                onClick={startProcessing}
                disabled={items.length === 0}
                className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-bold transition disabled:opacity-50"
              >
                <i className="fa-solid fa-play mr-2"></i>
                开始处理 ({items.length} 个作品)
              </button>
            ) : (
              <button 
                onClick={stopProcessing}
                className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-xl font-bold transition"
              >
                <i className="fa-solid fa-stop mr-2"></i>停止
              </button>
            )}

            {processing && (
              <div className="flex items-center gap-4 text-slate-400">
                <i className="fa-solid fa-circle-notch fa-spin"></i>
                <span>处理中: {currentIndex + 1} / {items.length}</span>
                <span className="text-emerald-400">✓ {processedCount}</span>
                <span className="text-red-400">✗ {errorCount}</span>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {processing && (
            <div className="mt-4">
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-600 to-violet-600 transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / items.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Preview & Logs */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Current Preview */}
          <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4">当前预览</h2>
            <div className="relative bg-slate-800 rounded-xl overflow-hidden" style={{ height: '300px' }}>
              {currentItem ? (
                <iframe 
                  ref={iframeRef}
                  srcDoc={getPreviewContent(currentItem.content, { raw: true })}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                  style={{ 
                    width: '800px', 
                    height: '600px',
                    transform: 'scale(0.375)',
                    transformOrigin: 'top left'
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                  <span>等待处理...</span>
                </div>
              )}
            </div>
            {currentItem && (
              <p className="mt-3 text-sm text-slate-400 truncate">
                {currentItem.title}
              </p>
            )}
          </div>

          {/* Logs */}
          <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4">处理日志</h2>
            <div className="h-[300px] overflow-y-auto bg-slate-950 rounded-xl p-4 font-mono text-sm">
              {logs.length === 0 ? (
                <p className="text-slate-500">暂无日志</p>
              ) : (
                logs.map((log, i) => (
                  <div 
                    key={i} 
                    className={`mb-1 ${
                      log.includes('✅') ? 'text-emerald-400' : 
                      log.includes('❌') ? 'text-red-400' : 
                      'text-slate-400'
                    }`}
                  >
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Items List */}
        <div className="mt-6 bg-slate-900/50 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4">待处理列表 ({items.length})</h2>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-400 border-b border-white/10">
                <tr>
                  <th className="pb-2 pr-4">#</th>
                  <th className="pb-2 pr-4">标题</th>
                  <th className="pb-2 pr-4">ID</th>
                  <th className="pb-2">封面状态</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 100).map((item, index) => (
                  <tr 
                    key={item.id} 
                    className={`border-b border-white/5 ${index === currentIndex && processing ? 'bg-indigo-500/20' : ''}`}
                  >
                    <td className="py-2 pr-4 text-slate-500">{index + 1}</td>
                    <td className="py-2 pr-4 truncate max-w-[200px]">{item.title}</td>
                    <td className="py-2 pr-4 text-slate-500 font-mono text-xs">{item.id}</td>
                    <td className="py-2">
                      {item.cover_url ? (
                        <span className="text-emerald-400">
                          <i className="fa-solid fa-check mr-1"></i>已有
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          <i className="fa-solid fa-minus mr-1"></i>缺失
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length > 100 && (
                  <tr>
                    <td colSpan={4} className="py-2 text-center text-slate-500">
                      ... 还有 {items.length - 100} 个作品
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
