'use client';

import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';

export default function ContactPage() {
  const { language } = useLanguage();
  const isZh = language === 'zh';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4">
        <Link href="/" className="text-brand-400 hover:text-brand-300 text-sm mb-8 inline-block">
          ← {isZh ? '返回首页' : 'Back to Home'}
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2">
          {isZh ? '联系我们' : 'Contact Us'}
        </h1>
        <p className="text-slate-500 mb-8">
          {isZh ? '技术支持 / 账户 / 支付问题' : 'Support for technical, account, and billing inquiries'}
        </p>

        <div className="prose prose-invert prose-slate max-w-none">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '联系方式' : 'Contact Information'}</h2>

            <p className="text-slate-300">
              <strong>{isZh ? '邮箱：' : 'Email:'}</strong>{' '}
              <a href="mailto:sparkvertex@163.com" className="text-brand-400 hover:underline">sparkvertex@163.com</a>
              <br />
              <strong>{isZh ? '回复时间：' : 'Response time:'}</strong> {isZh ? '1-3 个工作日' : '1-3 business days'}
            </p>
          </div>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '常见问题' : 'Common Inquiries'}</h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-300">
              <li>
                <strong>{isZh ? '技术支持：' : 'Technical support:'}</strong>{' '}
                {isZh ? '请提供问题描述、截图与复现步骤。' : 'Include a description, screenshots, and reproduction steps.'}
              </li>
              <li>
                <strong>{isZh ? '账户问题：' : 'Account issues:'}</strong>{' '}
                {isZh ? '请提供你的注册邮箱。' : 'Include the email associated with your account.'}
              </li>
              <li>
                <strong>{isZh ? '支付问题：' : 'Billing issues:'}</strong>{' '}
                {isZh ? '请提供订单号/交易号与交易时间。' : 'Include your order/transaction ID and transaction time.'}
              </li>
              <li>
                <strong>{isZh ? '退款相关：' : 'Refunds:'}</strong>{' '}
                {isZh ? '请先阅读 ' : 'Please review our '}
                <Link href="/legal/refund" className="text-brand-400 hover:underline">
                  {isZh ? '退款政策' : 'Refund Policy'}
                </Link>
                {isZh ? '，如符合例外情况再联系我们。' : ' before contacting us for exceptions.'}
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
