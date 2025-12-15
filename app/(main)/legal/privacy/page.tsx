'use client';

import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';

export default function PrivacyPolicyPage() {
  const { language } = useLanguage();
  const isZh = language === 'zh';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4">
        <Link href="/" className="text-brand-400 hover:text-brand-300 text-sm mb-8 inline-block">
          ← {isZh ? '返回首页' : 'Back to Home'}
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2">
          {isZh ? '隐私政策' : 'Privacy Policy'}
        </h1>
        <p className="text-slate-500 mb-8">
          {isZh ? '我们如何收集、使用与保护你的信息' : 'How we collect, use, and protect your information'}
        </p>

        <div className="prose prose-invert prose-slate max-w-none text-slate-300">
          <p className="text-slate-400 mb-6">
            <strong>{isZh ? '最后更新：' : 'Last Updated:'}</strong> {isZh ? '2025年1月' : 'January 2025'}
          </p>

          <p className="mb-6">
            {isZh
              ? 'SparkVertex（“我们”）重视你的隐私。本隐私政策说明当你使用 sparkvertex.cn（“服务”）时，我们如何收集、使用、披露与保护你的信息。'
              : 'SparkVertex ("we", "our", or "us") values your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use sparkvertex.cn (the "Service").'}
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '1. 我们收集的信息' : '1. Information We Collect'}</h2>
            <p className="mb-4">
              {isZh ? '我们可能收集以下类型的信息：' : 'We may collect the following types of information:'}
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>{isZh ? '账户信息：' : 'Account Information:'}</strong>{' '}
                {isZh
                  ? '用于登录与账户识别的邮箱地址及第三方登录（如 Google/GitHub）返回的基础资料。'
                  : 'Email address and basic profile information from third-party login providers (e.g., Google/GitHub).'}
              </li>
              <li>
                <strong>{isZh ? '支付信息：' : 'Payment Information:'}</strong>{' '}
                {isZh
                  ? '交易相关信息由 Paddle（支付处理方）安全处理。我们不会保存你的完整银行卡号等敏感支付信息。'
                  : 'Transaction-related information is processed securely by Paddle. We do not store full card numbers or sensitive payment credentials.'}
              </li>
              <li>
                <strong>{isZh ? '使用数据：' : 'Usage Data:'}</strong>{' '}
                {isZh
                  ? '例如访问时间、页面浏览、功能使用情况、生成记录等。'
                  : 'Such as access times, pages viewed, feature usage, and generation history.'}
              </li>
              <li>
                <strong>{isZh ? '设备与日志信息：' : 'Device & Log Data:'}</strong>{' '}
                {isZh
                  ? '例如浏览器类型、操作系统、IP 地址、设备标识符等。'
                  : 'Such as browser type, operating system, IP address, and device identifiers.'}
              </li>
              <li>
                <strong>{isZh ? '你提交的内容：' : 'User Content:'}</strong>{' '}
                {isZh
                  ? '你用于生成代码的输入（提示词/描述）以及生成输出。'
                  : 'Your prompts/descriptions and generated outputs produced by the Service.'}
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '2. 我们如何使用信息' : '2. How We Use Your Information'}</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>{isZh ? '提供、运营与维护服务（含账户登录与功能可用性）' : 'Provide, operate, and maintain the Service'}</li>
              <li>{isZh ? '处理订单与积分发放/扣减' : 'Process orders and manage credits (grant/deduct)'}</li>
              <li>{isZh ? '发送与服务相关的通知（例如订单结果、系统更新）' : 'Send service-related notices (e.g., order status, updates)'}</li>
              <li>{isZh ? '分析与改进产品体验、性能与稳定性' : 'Analyze and improve product experience, performance, and reliability'}</li>
              <li>{isZh ? '防止欺诈、滥用与安全事件' : 'Prevent fraud, abuse, and security incidents'}</li>
              <li>{isZh ? '遵守法律法规与合规要求' : 'Comply with legal and regulatory obligations'}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '3. 信息共享与披露' : '3. Data Sharing and Disclosure'}</h2>
            <p className="mb-4">
              {isZh
                ? '我们可能在以下情形与第三方共享必要信息：'
                : 'We may share necessary information with third parties in the following situations:'}
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>{isZh ? '服务提供商：' : 'Service Providers:'}</strong>{' '}
                {isZh
                  ? '例如 Paddle（支付）、Supabase（数据存储/鉴权）以及用于实现 AI 功能的第三方服务。'
                  : 'Such as Paddle (payments), Supabase (data/auth), and third-party AI services used to provide features.'}
              </li>
              <li>
                <strong>{isZh ? '法律要求：' : 'Legal Requirements:'}</strong>{' '}
                {isZh
                  ? '在法律法规要求或为保护我们与用户的合法权益时。'
                  : 'When required by law or to protect the rights and safety of users and us.'}
              </li>
              <li>
                <strong>{isZh ? '业务变更：' : 'Business Transfers:'}</strong>{' '}
                {isZh
                  ? '在发生并购、资产转让等情形时，信息可能随业务转移。'
                  : 'In connection with a merger, acquisition, or asset sale where data may be transferred.'}
              </li>
            </ul>
            <p className="mt-4">{isZh ? '我们不会出售你的个人信息。' : 'We do not sell your personal information.'}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '4. Cookie 与类似技术' : '4. Cookies and Similar Technologies'}</h2>
            <p className="mb-4">
              {isZh
                ? '我们可能使用 Cookie 或类似技术用于：维持登录状态、记住语言偏好、统计与分析以改进服务。'
                : 'We may use cookies or similar technologies to: maintain sessions, remember language preferences, and perform analytics to improve the Service.'}
            </p>
            <p>
              {isZh
                ? '你可以在浏览器设置中控制 Cookie。禁用 Cookie 可能影响部分功能。'
                : 'You can control cookies in your browser settings. Disabling cookies may impact certain features.'}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '5. 数据安全' : '5. Data Security'}</h2>
            <p>
              {isZh
                ? '我们采用合理的安全措施（例如 HTTPS/TLS、访问控制等）来保护信息安全。但互联网传输并非绝对安全，我们无法保证绝对无风险。'
                : 'We use reasonable security measures (e.g., HTTPS/TLS, access controls) to protect your information. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.'}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '6. 数据保留' : '6. Data Retention'}</h2>
            <p>
              {isZh
                ? '我们会在实现服务目的所需期间保留信息，或在法律/合规要求的期限内保留必要记录。'
                : 'We retain information for as long as necessary to provide the Service, or as required for legal/compliance purposes.'}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '7. 你的权利' : '7. Your Rights'}</h2>
            <p className="mb-4">
              {isZh
                ? '根据你所在地区的法律，你可能享有访问、更正、删除或限制处理个人信息等权利。'
                : 'Depending on your jurisdiction, you may have rights to access, correct, delete, or restrict the processing of your personal information.'}
            </p>
            <p>
              {isZh ? '如需行使相关权利，请联系：' : 'To exercise these rights, contact us at:'}{' '}
              <a href="mailto:sparkvertex@163.com" className="text-brand-400 hover:underline">sparkvertex@163.com</a>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '8. 联系我们' : '8. Contact Us'}</h2>
            <p className="mt-2">
              <strong>{isZh ? '邮箱：' : 'Email:'}</strong>{' '}
              <a href="mailto:sparkvertex@163.com" className="text-brand-400 hover:underline">sparkvertex@163.com</a>
              <br />
              <strong>{isZh ? '网站：' : 'Website:'}</strong>{' '}
              <a href="https://sparkvertex.cn" className="text-brand-400 hover:underline">sparkvertex.cn</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
