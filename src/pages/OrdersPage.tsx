import { zodResolver } from '@hookform/resolvers/zod';
import { CreditCard, ExternalLink, LoaderCircle, Plus, QrCode, ShoppingBag, TrendingUp, Utensils, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useDemoMode } from '../hooks/useDemoMode';
import { useCreateOrder, useOrders } from '../hooks/useRestaurantData';
import { OrderSchema, type OrderInput } from '../schemas/modules';
import { api } from '../lib/api';
import type { Order } from '../types/domain';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const OrderModal = ({ onClose }: { onClose: () => void }) => {
  const createOrder = useCreateOrder();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OrderInput>({
    resolver: zodResolver(OrderSchema),
    defaultValues: {
      channel: 'whatsapp',
      status: 'received',
      payment_method: 'Pix',
      item_quantity: 1,
      item_price: 0,
      item_category: 'Principal',
      notes: '',
    },
  });

  const onSubmit = async (values: OrderInput) => {
    setFormError(null);
    try {
      await createOrder.mutateAsync({
        customer_name: values.customer_name,
        channel: values.channel,
        status: values.status,
        payment_method: values.payment_method,
        notes: values.notes || null,
        items: [
          {
            name: values.item_name,
            category: values.item_category,
            quantity: values.item_quantity,
            price: values.item_price,
          },
        ],
      });
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível salvar o pedido.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit(onSubmit)} className="glass-panel w-full max-w-2xl rounded-3xl p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-white">Criar pedido</h2>
            <p className="mt-1 text-sm text-muted">Pedido real salvo no banco do restaurante logado.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-slate-300">
            Fechar
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Cliente</span>
            <input className="form-field" {...register('customer_name')} />
            {errors.customer_name ? <p className="mt-2 text-xs text-rose-200">{errors.customer_name.message}</p> : null}
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Canal</span>
            <select className="form-field" {...register('channel')}>
              <option value="dining_room">Salão</option>
              <option value="delivery">Delivery</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="ifood">iFood</option>
              <option value="phone">Telefone</option>
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Item</span>
            <input className="form-field" placeholder="Pizza, hambúrguer, combo..." {...register('item_name')} />
            {errors.item_name ? <p className="mt-2 text-xs text-rose-200">{errors.item_name.message}</p> : null}
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Categoria</span>
            <input className="form-field" {...register('item_category')} />
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Quantidade</span>
            <input className="form-field" type="number" min={1} {...register('item_quantity')} />
            {errors.item_quantity ? <p className="mt-2 text-xs text-rose-200">{errors.item_quantity.message}</p> : null}
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Preço</span>
            <input className="form-field" type="number" min={0} max={300000} step="0.01" placeholder="Ex: 49.90" {...register('item_price')} />
            {errors.item_price ? <p className="mt-2 text-xs text-rose-200">{errors.item_price.message}</p> : null}
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Pagamento</span>
            <input className="form-field" {...register('payment_method')} />
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Status</span>
            <select className="form-field" {...register('status')}>
              <option value="received">Recebido</option>
              <option value="preparing">Preparando</option>
              <option value="delivered">Entregue</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </label>
        </div>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-semibold text-slate-200">Observações</span>
          <textarea className="form-field min-h-24 resize-none" {...register('notes')} />
        </label>
        {formError ? <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{formError}</div> : null}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSubmitting || createOrder.isPending}>Salvar pedido</Button>
        </div>
      </form>
    </div>
  );
};

const ChargeModal = ({ order, onClose }: { order: Order; onClose: () => void }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [pixCode, setPixCode] = useState<string | null>(null);

  const charge = async (provider: 'mercado_pago' | 'pagbank' | 'infinitepay') => {
    setBusy(provider);
    setMessage(null);
    setPaymentUrl(null);
    setPixCode(null);
    try {
      if (provider === 'infinitepay') {
        const result = await api.createPaymentLink(order.id);
        setPaymentUrl(result.data.url);
        setMessage('Link de pagamento criado.');
      } else {
        const result = await api.createPixCharge(order.id, undefined, provider);
        setPixCode(result.data.qr_code);
        setPaymentUrl(result.data.ticket_url);
        setMessage('Pix criado. Envie o código ou link ao cliente.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível criar a cobrança.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-lg rounded-lg p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-white">Cobrar pedido</h2>
            <p className="mt-1 text-sm text-muted">{order.customer_name} · {formatCurrency(order.total_amount)}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-button" title="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-5 grid gap-2">
          <Button disabled={Boolean(busy)} icon={busy === 'mercado_pago' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />} onClick={() => charge('mercado_pago')}>Criar Pix pelo Mercado Pago</Button>
          <Button disabled={Boolean(busy)} variant="secondary" icon={busy === 'pagbank' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />} onClick={() => charge('pagbank')}>Criar Pix pelo PagBank</Button>
          <Button disabled={Boolean(busy)} variant="secondary" icon={busy === 'infinitepay' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} onClick={() => charge('infinitepay')}>Criar link pela InfinitePay</Button>
        </div>
        {message ? <p className="mt-4 rounded-lg border border-line bg-black/20 p-3 text-sm text-slate-200">{message}</p> : null}
        {pixCode ? <textarea className="form-field mt-3 min-h-24 resize-none" readOnly value={pixCode} aria-label="Código Pix" /> : null}
        {paymentUrl ? <a href={paymentUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-neon underline">Abrir cobrança <ExternalLink className="h-4 w-4" /></a> : null}
      </div>
    </div>
  );
};

export const OrdersPage = () => {
  const demoMode = useDemoMode();
  const { data: orders = [] } = useOrders();
  const [modalOpen, setModalOpen] = useState(false);
  const [chargeOrder, setChargeOrder] = useState<Order | null>(null);
  const total = orders.reduce((sum, order) => sum + order.total_amount, 0);
  const average = orders.length ? total / orders.length : 0;
  const favorite = useMemo(() => {
    const counts = orders.flatMap((order) => order.items).reduce<Record<string, number>>((acc, item) => {
      acc[item.name] = (acc[item.name] || 0) + item.quantity;
      return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Sem pedidos';
  }, [orders]);

  return (
    <div>
      <PageHeader
        title="Pedidos"
        description="Histórico real por cliente, canal, itens, forma de pagamento, status, ticket médio e produto favorito."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)} disabled={demoMode}>Criar pedido</Button>}
      />

      <div className="mb-4 grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <ShoppingBag className="h-5 w-5 text-neon" />
          <p className="mt-4 text-2xl font-black text-white">{orders.length}</p>
          <p className="text-sm text-muted">Pedidos no mês</p>
        </Card>
        <Card className="p-4">
          <CreditCard className="h-5 w-5 text-neon" />
          <p className="mt-4 text-2xl font-black text-white">{formatCurrency(total)}</p>
          <p className="text-sm text-muted">Total vendido</p>
        </Card>
        <Card className="p-4">
          <TrendingUp className="h-5 w-5 text-neon" />
          <p className="mt-4 text-2xl font-black text-white">{formatCurrency(average)}</p>
          <p className="text-sm text-muted">Ticket médio</p>
        </Card>
        <Card className="p-4">
          <Utensils className="h-5 w-5 text-neon" />
          <p className="mt-4 text-xl font-black text-white">{favorite}</p>
          <p className="text-sm text-muted">Produto favorito</p>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.16em] text-muted">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Itens</th>
                <th className="px-4 py-3">Canal</th>
                <th className="px-4 py-3">Pagamento</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Cobrança</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-line transition hover:bg-white/[0.035]">
                  <td className="px-4 py-4 font-bold text-white">{order.customer_name}</td>
                  <td className="px-4 py-4 text-slate-300">{order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')}</td>
                  <td className="px-4 py-4 capitalize text-slate-300">{order.channel.replace('_', ' ')}</td>
                  <td className="px-4 py-4 text-slate-300">{order.payment_method}</td>
                  <td className="px-4 py-4 text-slate-300">{new Date(order.order_date).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-4 font-black text-neon">{formatCurrency(order.total_amount)}</td>
                  <td className="px-4 py-4">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-4">
                    <Button variant="secondary" className="min-h-8 px-3 py-1 text-xs" disabled={demoMode || order.payment_status === 'paid'} onClick={() => setChargeOrder(order)}>
                      {order.payment_status === 'paid' ? 'Pago' : 'Cobrar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!orders.length ? <p className="p-5 text-sm text-muted">Nenhum pedido real salvo ainda.</p> : null}
      </Card>
      {modalOpen ? <OrderModal onClose={() => setModalOpen(false)} /> : null}
      {chargeOrder ? <ChargeModal order={chargeOrder} onClose={() => setChargeOrder(null)} /> : null}
    </div>
  );
};
