import { Bot, CalendarDays, Mail, MessageSquareText, ShoppingBag, Star, Tags } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useDemoMode } from '../hooks/useDemoMode';
import { useCustomers, useOrders, useReservations } from '../hooks/useRestaurantData';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export const CustomerProfilePage = () => {
  const demoMode = useDemoMode();
  const navigate = useNavigate();
  const { customerId } = useParams();
  const { data: customers = [], isLoading } = useCustomers();
  const { data: orders = [] } = useOrders();
  const { data: reservations = [] } = useReservations();
  const customer = customers.find((item) => item.id === customerId);

  if (!isLoading && !customer) return <Navigate to="/404" replace />;
  if (!customer) return <p className="text-sm text-muted">Carregando perfil...</p>;

  const customerOrders = orders.filter((order) => order.customer_id === customer.id || order.customer_name === customer.name);
  const customerReservations = reservations.filter(
    (reservation) => reservation.customer_id === customer.id || reservation.customer_name === customer.name,
  );
  const aiSummary =
    customerOrders.length || customerReservations.length
      ? `${customer.name.split(' ')[0]} tem ${customerOrders.length} pedidos e ${customerReservations.length} reservas no histórico real. Use preferências, tags e ticket para personalizar o próximo contato.`
      : `${customer.name.split(' ')[0]} ainda não tem histórico suficiente. Cadastre pedidos, reservas e mensagens para a IA gerar um resumo melhor.`;

  return (
    <div>
      <PageHeader
        title={customer.name}
        description="Perfil completo com histórico real, preferências, tags, notas internas e resumo gerado a partir dos dados salvos."
        actions={
          <>
            <Button variant="secondary" icon={<MessageSquareText className="h-4 w-4" />} onClick={() => navigate('/app/whatsapp')} disabled={demoMode}>
              Enviar WhatsApp
            </Button>
            <Button icon={<CalendarDays className="h-4 w-4" />} onClick={() => navigate('/app/reservas')} disabled={demoMode}>
              Criar reserva
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <div className="flex items-start gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-neon to-fuchsia-500 text-lg font-black text-white">
              {customer.name
                .split(' ')
                .map((part) => part[0])
                .slice(0, 2)
                .join('')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black text-white">{customer.name}</h2>
                <StatusBadge status={customer.status} />
              </div>
              <p className="mt-2 text-sm text-muted">{customer.phone}</p>
              <p className="mt-1 text-sm text-muted">{customer.email || '-'}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-white/[0.04] p-4">
              <p className="text-xs text-muted">Total gasto</p>
              <p className="mt-2 text-lg font-black text-white">{formatCurrency(customer.total_spent)}</p>
            </div>
            <div className="rounded-2xl border border-line bg-white/[0.04] p-4">
              <p className="text-xs text-muted">Pedidos</p>
              <p className="mt-2 text-lg font-black text-white">{customerOrders.length}</p>
            </div>
            <div className="rounded-2xl border border-line bg-white/[0.04] p-4">
              <p className="text-xs text-muted">Score</p>
              <p className="mt-2 text-lg font-black text-neon">{customer.loyalty_score}/100</p>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2 font-black text-white">
              <Tags className="h-4 w-4 text-neon" />
              Tags e preferências
            </div>
            <div className="flex flex-wrap gap-2">
              {customer.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-neon/25 bg-neon/10 px-3 py-1 text-xs font-bold text-sky-100">
                  {tag}
                </span>
              ))}
              {!customer.tags.length ? <span className="text-sm text-muted">Sem tags.</span> : null}
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">{customer.preferences || 'Sem preferências registradas.'}</p>
          </div>
        </Card>

        <Card className="border-fuchsia-400/25 bg-fuchsia-500/10">
          <div className="flex gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-fuchsia-400/15 text-fuchsia-100">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-black text-white">Resumo da IA</h2>
              <p className="mt-2 text-sm leading-7 text-slate-200">{aiSummary}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-black text-white">
            <ShoppingBag className="h-4 w-4 text-neon" />
            Histórico de pedidos
          </h2>
          <div className="space-y-3">
            {customerOrders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-line bg-white/[0.04] p-3">
                <div className="flex justify-between gap-3">
                  <p className="font-bold text-white">{order.items.map((item) => item.name).join(', ')}</p>
                  <p className="font-black text-neon">{formatCurrency(order.total_amount)}</p>
                </div>
                <p className="mt-1 text-xs text-muted">{new Date(order.order_date).toLocaleString('pt-BR')} - {order.channel}</p>
              </div>
            ))}
            {!customerOrders.length ? <p className="text-sm text-muted">Nenhum pedido registrado.</p> : null}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-black text-white">
            <CalendarDays className="h-4 w-4 text-neon" />
            Histórico de reservas
          </h2>
          <div className="space-y-3">
            {customerReservations.map((reservation) => (
              <div key={reservation.id} className="rounded-2xl border border-line bg-white/[0.04] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-white">{reservation.reservation_date} as {reservation.reservation_time}</p>
                  <StatusBadge status={reservation.status} />
                </div>
                <p className="mt-1 text-xs text-muted">{reservation.party_size} pessoas - {reservation.table_label || 'sem mesa'}</p>
              </div>
            ))}
            {!customerReservations.length ? <p className="text-sm text-muted">Nenhuma reserva registrada.</p> : null}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-black text-white">
            <Mail className="h-4 w-4 text-neon" />
            Mensagens e campanhas
          </h2>
          <p className="text-sm text-muted">Nenhuma mensagem real registrada neste perfil ainda.</p>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-4 flex items-center gap-2 font-black text-white">
          <Star className="h-4 w-4 text-neon" />
          Notas internas
        </h2>
        <p className="text-sm leading-7 text-slate-300">{customer.notes || 'Sem notas internas.'}</p>
        <div className="mt-5">
          <Link to="../clientes" className="text-sm font-bold text-neon hover:text-sky-200">
            Voltar para clientes
          </Link>
        </div>
      </Card>
    </div>
  );
};
