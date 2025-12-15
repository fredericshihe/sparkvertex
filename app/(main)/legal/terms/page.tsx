'use client';

import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';

export default function TermsPage() {
  const { language } = useLanguage();
  const isZh = language === 'zh';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4">
        <Link href="/" className="text-brand-400 hover:text-brand-300 text-sm mb-8 inline-block">
          ← {isZh ? '返回首页' : 'Back to Home'}
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2">
          {isZh ? '服务条款' : 'Terms of Service'}
        </h1>
        <p className="text-slate-500 mb-8">
          {isZh ? '使用 SparkVertex 前请仔细阅读' : 'Please read these terms carefully before using SparkVertex'}
        </p>

        <div className="prose prose-invert prose-slate max-w-none text-slate-300">
          <p className="text-slate-400 mb-6">
            <strong>{isZh ? '最后更新：' : 'Last Updated:'}</strong> {isZh ? '2025年1月' : 'January 2025'}
          </p>

          <p className="mb-6">
            {isZh
              ? '欢迎使用 SparkVertex。本服务条款（“条款”）适用于你对 sparkvertex.cn 及相关 AI 代码生成服务（“服务”）的访问与使用。访问或使用服务即表示你同意受本条款约束。'
              : 'Welcome to SparkVertex. These Terms of Service ("Terms") govern your access to and use of sparkvertex.cn and related AI code generation services (the "Service"). By using the Service, you agree to these Terms.'}
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '1. 接受条款' : '1. Acceptance of Terms'}</h2>
            <p>
              {isZh
                ? '如果你不同意本条款，请不要使用服务。你需年满 13 周岁方可使用本服务。'
                : 'If you do not agree to these Terms, do not use the Service. You must be at least 13 years old to use the Service.'}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '2. 服务说明' : '2. Description of Service'}</h2>
            <p className="mb-4">
              {isZh
                ? 'SparkVertex 是一个 AI 驱动的代码生成平台，你可以通过自然语言描述生成网页/应用代码，并进行预览、导出与分享。'
                : 'SparkVertex is an AI-powered code generation platform that lets you generate web/app code from natural language prompts, preview results, export code, and share projects.'}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '3. 账户与安全' : '3. Accounts and Security'}</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>{isZh ? '你应提供真实、准确的账户信息' : 'Provide accurate and current account information'}</li>
              <li>{isZh ? '你应妥善保管登录凭证并对账号活动负责' : 'Safeguard your credentials and be responsible for account activity'}</li>
              <li>{isZh ? '如发现未授权访问，请及时联系我们' : 'Notify us promptly of any unauthorized access'}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '4. 积分与付款' : '4. Credits and Payment'}</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>{isZh ? '积分用于使用 AI 生成能力，消耗规则会随功能而变化' : 'Credits are required for AI generation; consumption varies by feature/complexity'}</li>
              <li>{isZh ? '支付由 Paddle 处理，结账页展示最终价格' : 'Payments are processed by Paddle; final price is shown at checkout'}</li>
              <li>{isZh ? '积分不转让、不兑现、默认不退款' : 'Credits are non-transferable, non-redeemable for cash, and generally non-refundable'}</li>
              <li>
                {isZh ? '退款规则见 ' : 'Refund rules: '}
                <Link href="/legal/refund" className="text-brand-400 hover:underline">
                  {isZh ? '退款政策' : 'Refund Policy'}
                </Link>
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '5. 禁止行为' : '5. Prohibited Uses'}</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>{isZh ? '生成违法、侵权、恶意或欺诈内容' : 'Generate illegal, infringing, malicious, or fraudulent content'}</li>
              <li>{isZh ? '制作或传播恶意软件、钓鱼网站等' : 'Create or distribute malware or phishing content'}</li>
              <li>{isZh ? '攻击、绕过或破坏服务安全机制' : 'Attack, bypass, or compromise Service security'}</li>
              <li>{isZh ? '滥用服务或绕过计费/限流' : 'Abuse the Service or bypass billing/rate limits'}</li>
              <li>{isZh ? '未经许可转售或商业化分发服务' : 'Resell or commercially redistribute without permission'}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '6. 知识产权' : '6. Intellectual Property'}</h2>
            <p className="mb-4">
              {isZh
                ? '你对你提交的内容享有权利。使用服务生成的代码通常归你所有，但生成结果可能依赖第三方开源库，其许可条款以第三方为准。'
                : 'You retain rights to your inputs. Generated code is generally yours, but outputs may rely on third-party open-source libraries subject to their licenses.'}
            </p>
            <p>
              {isZh
                ? 'SparkVertex 的平台、品牌与技术相关知识产权归 SparkVertex 所有。'
                : 'SparkVertex retains all rights in the platform, branding, and underlying technology.'}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '7. AI 生成免责声明' : '7. AI-Generated Content Disclaimer'}</h2>
            <p>
              {isZh
                ? 'AI 生成内容可能包含错误或安全风险，你应在生产环境使用前自行审查、测试与加固。'
                : 'AI-generated outputs may contain errors or security risks. You must review, test, and harden any code before production use.'}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '8. 免责声明与责任限制' : '8. Disclaimers and Limitation of Liability'}</h2>
            <p className="mb-4">
              {isZh
                ? '服务按“现状”提供，我们不对服务不间断、无错误或完全安全作出保证。'
                : 'The Service is provided "as is" without warranties that it will be uninterrupted, error-free, or fully secure.'}
            </p>
            <p>
              {isZh
                ? '在法律允许的最大范围内，我们不对间接、附带、特殊或后果性损失承担责任。'
                : 'To the maximum extent permitted by law, we are not liable for indirect, incidental, special, or consequential damages.'}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '9. 条款变更与终止' : '9. Changes and Termination'}</h2>
            <p>
              {isZh
                ? '我们可能更新条款或调整服务内容。你继续使用服务即表示接受更新后的条款。若你违反本条款，我们可暂停或终止你的访问权限。'
                : 'We may update these Terms or modify the Service. Continued use means you accept updated Terms. We may suspend or terminate access for violations.'}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '10. 联系方式' : '10. Contact'}</h2>
            <p className="mt-2">
              <strong>{isZh ? '邮箱：' : 'Email:'}</strong>{' '}
              <a href="mailto:sparkvertex@163.com" className="text-brand-400 hover:underline">sparkvertex@163.com</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
