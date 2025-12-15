'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    Paddle: any;
  }
}

interface PaddleProviderProps {
  children: React.ReactNode;
}

/**
 * Paddle.js 初始化组件
 * 包装在 layout 中，确保 Paddle.js 在所有页面可用
 * 
 * 使用方式：
 * ```tsx
 * <PaddleProvider>
 *   {children}
 * </PaddleProvider>
 * ```
 */
export function PaddleProvider({ children }: PaddleProviderProps) {
  const [isReady, setIsReady] = useState(false);

  const initializePaddle = () => {
    if (typeof window !== 'undefined' && window.Paddle) {
      const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
      const environment = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT || 'production';
      
      if (!clientToken) {
        console.error('[Paddle] Client token not configured');
        return;
      }

      try {
        // 设置环境
        if (environment === 'sandbox') {
          window.Paddle.Environment.set('sandbox');
        }

        // 初始化 Paddle
        window.Paddle.Initialize({
          token: clientToken,
          eventCallback: (event: any) => {
            console.log('[Paddle] Event:', event.name, event);
            
            // 处理 checkout 错误事件
            if (event.name === 'checkout.error') {
              console.error('[Paddle] Checkout Error:', {
                type: event.type,
                code: event.code,
                detail: event.detail,
                errors: event.data?.errors,
                fullEvent: event
              });
            }
            
            // 处理 checkout 完成事件
            if (event.name === 'checkout.completed') {
              console.log('[Paddle] Checkout completed!', event.data);
              // 可以在这里触发 UI 更新或刷新页面
            }
          }
        });

        setIsReady(true);
        console.log('[Paddle] Initialized successfully');
      } catch (error) {
        console.error('[Paddle] Initialization error:', error);
      }
    }
  };

  return (
    <>
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        strategy="lazyOnload"
        onLoad={initializePaddle}
      />
      {children}
    </>
  );
}

/**
 * 使用 Paddle Checkout 的 Hook
 */
export function usePaddleCheckout() {
  const openCheckout = (options: {
    priceId: string;
    userId: string;
    userEmail?: string;
    successUrl?: string;
  }) => {
    if (typeof window === 'undefined' || !window.Paddle) {
      console.error('[Paddle] Not initialized');
      return;
    }

    const { priceId, userId, userEmail, successUrl } = options;

    try {
      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customData: {
          user_id: userId,
          email: userEmail,
        },
        settings: {
          successUrl: successUrl || `${window.location.origin}/profile?payment=success`,
          // 可以添加更多设置
          displayMode: 'overlay', // 'overlay' | 'inline'
          theme: 'dark',
          locale: 'zh', // 中文界面
        },
        customer: userEmail ? { email: userEmail } : undefined,
      });
    } catch (error) {
      console.error('[Paddle] Checkout error:', error);
    }
  };

  return { openCheckout };
}
