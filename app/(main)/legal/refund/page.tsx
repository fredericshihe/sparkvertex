'use client';

import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';

export default function RefundPolicyPage() {
  const { language } = useLanguage();
  const isZh = language === 'zh';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4">
        <Link href="/" className="text-brand-400 hover:text-brand-300 text-sm mb-8 inline-block">
          ← {isZh ? '返回首页' : 'Back to Home'}
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2">
          {isZh ? '退款政策' : 'Refund Policy'}
        </h1>
        <p className="text-slate-500 mb-8">
          {isZh ? '关于退款与例外情况的说明' : 'Refund rules and limited exceptions'}
        </p>

        <div className="prose prose-invert prose-slate max-w-none text-slate-300">
          <p className="text-slate-400 mb-6">
            <strong>{isZh ? '最后更新：' : 'Last Updated:'}</strong> {isZh ? '2025年1月' : 'January 2025'}
          </p>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-amber-400 mb-3">
              {isZh ? '重要提示：所有交易最终确认（不退款）' : 'Important: All Sales Are Final (No Refunds)'}
            </h2>
            <p className="text-amber-200/80 mb-0">
              {isZh
                ? '由于积分属于即时交付的数字商品，且 AI 服务会产生不可逆的计算成本，积分购买完成后默认不支持退款。购买前请仔细确认。'
                : 'Because credits are instantly delivered digital goods and AI services incur irreversible compute costs, credit purchases are generally non-refundable once completed. Please review carefully before purchasing.'}
            </p>
          </div>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '1. 一般规则' : '1. General Policy'}</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>{isZh ? '积分购买完成后不支持退款' : 'Credits are non-refundable once purchased'}</li>
              <li>{isZh ? '积分不可兑换现金、不可转让' : 'Credits are not redeemable for cash and are non-transferable'}</li>
              <li>{isZh ? '积分默认不过期（长期保留在账户内）' : 'Credits do not expire (remain in your account)'}</li>
              <li>{isZh ? '不提供部分退款' : 'We do not offer partial refunds'}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '2. 例外情况（极少数）' : '2. Limited Exceptions'}</h2>
            <p className="mb-4">
              {isZh
                ? '仅在以下极少数情形，我们可能提供退款或积分补偿：'
                : 'We may consider a refund or credit compensation only in limited cases such as:'}
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>{isZh ? '重复扣款：同一订单被扣费多次（将退还重复部分）' : 'Duplicate charges for the same order (duplicate amount refunded)'}</li>
              <li>{isZh ? '系统错误：扣减积分但服务未交付/未完成' : 'System error where credits were deducted without delivery'}</li>
              <li>{isZh ? '长时间故障：因我们原因导致服务连续不可用超过 48 小时' : 'Extended outage over 48 hours due to our fault'}</li>
              <li>{isZh ? '未经授权交易：在合理证据支持下进行调查处理' : 'Unauthorized transactions (subject to investigation)'}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '3. 申请方式' : '3. How to Request a Review'}</h2>
            <p className="mb-4">
              {isZh
                ? '如你认为符合例外情况，请在交易后 7 天内邮件联系我们，并提供：账户邮箱、订单号/交易号、交易时间与金额、问题描述与截图等。'
                : 'If you believe your case qualifies, email us within 7 days of the transaction with: your account email, order/transaction ID, date/amount, issue description, and supporting evidence.'}
            </p>
            <p>
              {isZh ? '联系邮箱：' : 'Contact email:'}{' '}
              <a href="mailto:sparkvertex@163.com" className="text-brand-400 hover:underline">sparkvertex@163.com</a>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '4. 拒付（Chargeback）' : '4. Chargebacks'}</h2>
            <p>
              {isZh
                ? '如未先联系我们而直接发起拒付/争议，可能导致账户被暂停或终止，并可能影响剩余积分使用。我们保留提供交付证据以争议拒付的权利。'
                : 'Filing a chargeback without contacting us first may result in suspension/termination and may affect remaining credits. We may dispute chargebacks by providing evidence of delivery.'}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">{isZh ? '5. 支付处理方' : '5. Payment Processor'}</h2>
            <p>
              {isZh
                ? '我们通过 Paddle（Merchant of Record）处理付款。付款相关问题可联系我们，也可参考 Paddle 的付款通知或收据。'
                : 'Payments are processed via Paddle (Merchant of Record). For billing issues, contact us and refer to Paddle receipts/notifications.'}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
