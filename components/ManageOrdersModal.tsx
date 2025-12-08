'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useLanguage } from '@/context/LanguageContext';

export default function ManageOrdersModal() {
  const { isManageOrdersModalOpen, closeManageOrdersModal } = useModal();
  const { t } = useLanguage();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isManageOrdersModalOpen) {
      fetchOrders();
    }
  }, [isManageOrdersModalOpen]);

  const fetchOrders = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        items:item_id (title, price),
        profiles:buyer_id (username)
      `)
      .eq('seller_id', session.user.id)
      .in('status', ['pending', 'paid', 'completed'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
    }

    setOrders(data || []);
    setLoading(false);
  };

  const confirmOrder = async (orderId: string) => {
    if (!confirm(t.manage_orders.confirm_alert)) return;

    const { error } = await supabase
      .from('orders')
      .update({ status: 'completed' })
      .eq('id', orderId);

    if (error) {
      alert(t.manage_orders.fail_alert);
    } else {
      fetchOrders(); // Refresh list
    }
  };

  if (!isManageOrdersModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeManageOrdersModal}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl bg-black/60 backdrop-blur-2xl rounded-3xl border border-white/10 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)] animate-in zoom-in fade-in duration-300 ring-1 ring-white/5">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">
            <i className="fa-solid fa-list-check text-brand-500 mr-2"></i>
            {t.manage_orders.title}
          </h2>
          <button onClick={closeManageOrdersModal} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-10">
            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-brand-500"></i>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            <i className="fa-solid fa-check-circle text-4xl mb-4 opacity-50"></i>
            <p>{t.manage_orders.no_orders}</p>
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[60vh] custom-scrollbar space-y-4 p-1">
            {orders.map(order => (
              <div key={order.id} className={`relative p-5 rounded-xl border transition-all duration-300 ${order.status === 'paid' ? 'bg-brand-900/10 border-brand-500/50 shadow-[0_0_20px_rgba(168,85,247,0.1)]' : 'bg-black/20 border-white/10 hover:bg-white/5'}`}>
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  {/* Left: Info */}
                  <div className="flex-grow space-y-2">
                    <div className="flex items-start justify-between md:justify-start md:gap-4">
                      <h3 className="font-bold text-white text-lg">{order.items?.title || 'Unknown Item'}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                        order.status === 'paid' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                        order.status === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {order.status === 'paid' ? t.manage_orders.status_pending : order.status === 'completed' ? t.manage_orders.status_completed : order.status}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-slate-400">
                      <div>
                        <span className="block text-xs text-slate-500 mb-0.5">{t.manage_orders.buyer}</span>
                        <div className="flex items-center gap-2">
                          <i className="fa-solid fa-user-circle"></i>
                          <span className="text-slate-300">{order.profiles?.username || 'Unknown'}</span>
                        </div>
                      </div>
                      <div>
                        <span className="block text-xs text-slate-500 mb-0.5">{t.manage_orders.amount}</span>
                        <div className="flex items-center gap-2">
                          <i className="fa-solid fa-yen-sign"></i>
                          <span className="text-white font-bold">{order.amount}</span>
                        </div>
                      </div>
                      <div>
                        <span className="block text-xs text-slate-500 mb-0.5">{t.manage_orders.time}</span>
                        <span suppressHydrationWarning>{new Date(order.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {order.remark && (
                      <div className="bg-slate-950/50 p-2 rounded border border-slate-800 text-xs mt-2">
                        <span className="text-slate-500 mr-2">{t.manage_orders.remark}</span>
                        <span className="font-mono text-brand-400">{order.remark}</span>
                      </div>
                    )}
                  </div>

                  {/* Right: Action */}
                  <div className="flex items-center justify-end md:border-l md:border-slate-700 md:pl-6 min-w-[140px]">
                    {order.status === 'paid' ? (
                      <button 
                        onClick={() => confirmOrder(order.id)}
                        className="w-full md:w-auto px-6 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-bold shadow-lg shadow-brand-500/20 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                      >
                        <i className="fa-solid fa-check-circle"></i>
                        {t.manage_orders.confirm_btn}
                      </button>
                    ) : (
                      <div className="text-slate-500 flex items-center gap-2 cursor-default opacity-50">
                        <i className="fa-solid fa-check"></i> {t.manage_orders.processed}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}