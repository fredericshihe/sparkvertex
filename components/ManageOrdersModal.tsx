'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';

export default function ManageOrdersModal() {
  const { isManageOrdersModalOpen, closeManageOrdersModal } = useModal();
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
    if (!confirm('确认已收到款项？')) return;

    const { error } = await supabase
      .from('orders')
      .update({ status: 'completed' })
      .eq('id', orderId);

    if (error) {
      alert('操作失败');
    } else {
      fetchOrders(); // Refresh list
    }
  };

  if (!isManageOrdersModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeManageOrdersModal}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl bg-slate-900 rounded-2xl border border-slate-700 p-8 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">
            <i className="fa-solid fa-list-check text-brand-500 mr-2"></i>
            订单管理
          </h2>
          <button onClick={closeManageOrdersModal} className="text-slate-400 hover:text-white">
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
            <p>暂无待处理订单</p>
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[60vh] custom-scrollbar">
            <table className="w-full text-left text-sm text-slate-400 whitespace-nowrap">
              <thead className="bg-slate-800 text-slate-200 uppercase font-bold">
                <tr>
                  <th className="px-4 py-3">商品</th>
                  <th className="px-4 py-3">买家</th>
                  <th className="px-4 py-3">金额</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">备注码</th>
                  <th className="px-4 py-3">时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {orders.map(order => (
                  <tr key={order.id} className={`transition ${order.status === 'paid' ? 'bg-brand-900/20 hover:bg-brand-900/30' : 'hover:bg-slate-800/50'}`}>
                    <td className="px-4 py-3 font-medium text-white max-w-[200px] truncate" title={order.items?.title}>{order.items?.title || 'Unknown'}</td>
                    <td className="px-4 py-3">{order.profiles?.username || 'Unknown'}</td>
                    <td className="px-4 py-3 text-brand-400 font-bold">¥{order.amount}</td>
                    <td className="px-4 py-3">
                      {order.status === 'paid' ? (
                        <span className="inline-flex items-center gap-1 text-green-400 font-bold text-xs bg-green-400/10 px-2 py-1 rounded-full">
                          <i className="fa-solid fa-check-circle"></i> 已支付
                        </span>
                      ) : order.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 text-blue-400 font-bold text-xs bg-blue-400/10 px-2 py-1 rounded-full">
                          <i className="fa-solid fa-check-double"></i> 已完成
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500 text-xs bg-slate-800 px-2 py-1 rounded-full">
                          <i className="fa-regular fa-clock"></i> 待支付
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-yellow-400 font-bold">{order.remark || '-'}</td>
                    <td className="px-4 py-3 text-xs">{new Date(order.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {order.status === 'completed' ? (
                        <span className="text-slate-600 text-xs font-bold flex items-center gap-1 cursor-default">
                          <i className="fa-solid fa-check"></i> 已处理
                        </span>
                      ) : (
                        <button 
                          onClick={() => confirmOrder(order.id)}
                          disabled={order.status !== 'paid'}
                          className={`px-3 py-1 rounded text-xs font-bold transition flex items-center gap-1 ${
                            order.status === 'paid' 
                              ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/20' 
                              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                          }`}
                          title={order.status === 'pending' ? '等待买家确认支付' : '确认收到款项'}
                        >
                          <i className="fa-solid fa-check"></i> 确认收款
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}