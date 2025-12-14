import { Suspense } from 'react';
import HomeClient from './HomeClient';
import HomeLoading from './loading';

// 首页使用 ISR 静态生成，1小时重新验证一次
// 首屏内容是静态的，可以预渲染以实现秒开
export const revalidate = 3600;

// 强制静态生成
export const dynamic = 'force-static';

export default function Home() {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeClient />
    </Suspense>
  );
}
