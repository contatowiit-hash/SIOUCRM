import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCheck,
  Clock3,
  MessageCircle,
  ShoppingBag,
  Sparkles,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { demoRestaurant } from '../data/demo';
import { useDemoMode } from '../hooks/useDemoMode';
import { useCustomers, useOrders, useReservations, useWhatsAppConversations } from '../hooks/useRestaurantData';
import { cn } from '../lib/cn';
import { useAuth } from '../providers/AuthProvider';

const formatMoney = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

const formatTime = (value?: string) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const getInitials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

const Metric = ({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: 'cyan' | 'violet' | 'emerald' | 'amber';
}) => {
  const tones = {
    cyan: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
    violet: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
  };

  return (
    <Card className="rounded-lg border-white/10 bg-[#0b111d]/90 p-4 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-black text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg border', tones[tone])}>{icon}</span>
      </div>
    </Card>
  );
};

const dashboardCard = 'rounded-lg border-white/10 bg-[#0b111d]/90 p-0 shadow-none';

export const DashboardPage = () => {
  const { restaurant } = useAuth();
  const demoMode = useDemoMode();
  const { data: customers = [] } = useCustomers();
  const { data: reservations = [] } = useReservations();
  const { data: orders = [] } = useOrders();
  const { data: conversations = [] } = useWhatsAppConversations();

  const currentRestaurant = demoMode ? demoRestaurant : restaurant;
  const basePath = demoMode ? '/demo' : '/app';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  const pendingReservations = reservations.filter((reservation) => reservation.status === 'pending');
  const inactiveCustomers = customers.filter((customer) => customer.status === 'inactive');
  const awaitingConversations = conversations.filter(
    (conversation) => conversation.messages.at(-1)?.direction === 'inbound',
  );

  const alert =
    awaitingConversations.length > 0
      ? {
          text: `${awaitingConversations.length} ${awaitingConversations.length === 1 ? 'cliente está esperando' : 'clientes estão esperando'} resposta. Posso ajudar você a responder agora.`,
          action: 'Responder agora',
          to: `${basePath}/whatsapp`,
        }
      : pendingReservations.length > 0
        ? {
            text: `${pendingReservations.length} ${pendingReservations.length === 1 ? 'reserva de hoje ainda não foi confirmada' : 'reservas de hoje ainda não foram confirmadas'}.`,
            action: 'Ver reservas',
            to: `${basePath}/reservas`,
          }
        : inactiveCustomers.length > 0
          ? {
              text: `${inactiveCustomers.length} ${inactiveCustomers.length === 1 ? 'cliente não volta' : 'clientes não voltam'} há mais de 30 dias. Quer mandar uma mensagem para eles?`,
              action: 'Enviar mensagem',
              to: `${basePath}/campanhas`,
            }
          : {
              text: 'Tudo tranquilo por aqui. Seus clientes estão sendo atendidos e não há nada urgente agora.',
              action: 'Ver conversas',
              to: `${basePath}/whatsapp`,
            };

  const revenue = orders.reduce((total, order) => total + order.total_amount, 0);
  const messagesToday =
    conversations.reduce((total, conversation) => total + conversation.messages.length, 0) || (demoMode ? 24 : 0);
  const reservationsToday = reservations.length || (demoMode ? 3 : 0);
  const ordersToday = orders.length || (demoMode ? 12 : 0);
  const revenueToday = revenue || (demoMode ? 1356 : 0);

  const demoConversationPreviews = [
    'Queria reservar uma mesa para hoje à noite.',
    'Vocês entregam no Centro?',
    'Pode separar meu pedido para retirada?',
    'Qual é a sobremesa mais pedida?',
    'Obrigado pelo atendimento!',
  ];

  const recentConversations =
    conversations.length > 0
      ? conversations.slice(0, 5).map((conversation) => {
          const lastMessage = conversation.messages.at(-1);
          const answeredByAi = lastMessage?.direction === 'outbound' && lastMessage.provider === 'groq_ai';
          return {
            id: conversation.id,
            name: conversation.customer_name,
            preview: lastMessage?.body || 'Conversa iniciada',
            time: formatTime(conversation.last_message_at),
            avatar: conversation.avatar_url,
            status: lastMessage?.direction === 'inbound' ? 'waiting' : answeredByAi ? 'ai' : 'answered',
          };
        })
      : customers.slice(0, 5).map((customer, index) => ({
          id: customer.id,
          name: customer.name,
          preview: demoConversationPreviews[index] || customer.notes || 'Conversa recente',
          time: ['11:42', '10:18', '09:55', '09:21', '08:47'][index] || '',
          avatar: customer.avatar_url,
          status: index === 0 ? 'waiting' : index === 1 ? 'ai' : 'answered',
        }));

  const visibleReservations = [...reservations]
    .sort((a, b) => a.reservation_time.localeCompare(b.reservation_time))
    .slice(0, 5);

  const conversationStatus = {
    waiting: { label: 'Aguardando', className: 'border-amber-400/20 bg-amber-400/10 text-amber-200' },
    ai: { label: 'Respondido pela IA', className: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' },
    answered: { label: 'Respondido', className: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200' },
  };

  return (
    <div className="mx-auto max-w-[1500px]">
      <section className="mb-5">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-cyan-300">
              <Sparkles className="h-3.5 w-3.5" />
              Seu resumo de hoje
            </p>
            <h1 className="text-2xl font-black text-white sm:text-3xl">
              {greeting}, {currentRestaurant?.name || 'seu restaurante'}! <span aria-hidden="true">👋</span>
            </h1>
            <p className="mt-1 capitalize text-sm text-slate-400">{dateLabel}</p>
          </div>
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Clock3 className="h-4 w-4 text-cyan-300" />
            Atualizado agora
          </p>
        </div>
      </section>

      <Card className="mb-4 overflow-hidden rounded-lg border-violet-400/25 bg-violet-500/10 p-0 shadow-[0_16px_44px_rgba(76,29,149,0.16)]">
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-violet-300/25 bg-violet-400/15 text-violet-100">
              <Bot className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase text-violet-200">Assistente SIOU</p>
              <p className="mt-1 max-w-3xl text-base font-semibold leading-6 text-white">{alert.text}</p>
            </div>
          </div>
          <Link
            to={alert.to}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-black text-[#041019] transition hover:bg-cyan-300"
          >
            {alert.action}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<MessageCircle className="h-5 w-5" />}
          label="Mensagens hoje"
          value={`${messagesToday}`}
          detail={awaitingConversations.length ? `${awaitingConversations.length} aguardando resposta` : 'Tudo respondido'}
          tone="cyan"
        />
        <Metric
          icon={<CalendarDays className="h-5 w-5" />}
          label="Reservas hoje"
          value={`${reservationsToday}`}
          detail={pendingReservations.length ? `${pendingReservations.length} precisam de confirmação` : 'Agenda confirmada'}
          tone="violet"
        />
        <Metric
          icon={<ShoppingBag className="h-5 w-5" />}
          label="Pedidos hoje"
          value={`${ordersToday}`}
          detail={ordersToday ? 'Pedidos recebidos' : 'Nenhum pedido ainda'}
          tone="emerald"
        />
        <Metric
          icon={<WalletCards className="h-5 w-5" />}
          label="Faturamento hoje"
          value={formatMoney(revenueToday)}
          detail="Total dos pedidos de hoje"
          tone="amber"
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className={dashboardCard}>
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="font-black text-white">Conversas recentes</h2>
              <p className="mt-0.5 text-xs text-slate-500">Últimos atendimentos pelo WhatsApp</p>
            </div>
            <Link to={`${basePath}/whatsapp`} className="text-sm font-bold text-cyan-300 hover:text-cyan-200">
              Ver todas
            </Link>
          </div>

          <div className="divide-y divide-white/[0.07]">
            {recentConversations.length ? (
              recentConversations.map((conversation) => {
                const status = conversationStatus[conversation.status as keyof typeof conversationStatus];
                return (
                  <div key={conversation.id} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-white/[0.025]">
                    {conversation.avatar ? (
                      <img
                        src={conversation.avatar}
                        alt={`Foto de ${conversation.name}`}
                        className="h-10 w-10 shrink-0 rounded-full border border-white/10 object-cover"
                      />
                    ) : (
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-xs font-black text-white">
                        {getInitials(conversation.name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-bold text-white">{conversation.name}</p>
                        <span className="shrink-0 text-xs text-slate-500">{conversation.time}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-slate-400">{conversation.preview}</p>
                    </div>
                    <span className={cn('hidden shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold md:inline-flex', status.className)}>
                      {status.label}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="grid min-h-48 place-items-center p-6 text-center">
                <div>
                  <MessageCircle className="mx-auto h-7 w-7 text-slate-600" />
                  <p className="mt-3 text-sm font-semibold text-slate-400">As conversas recentes aparecerão aqui.</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className={dashboardCard}>
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="font-black text-white">Reservas de hoje</h2>
              <p className="mt-0.5 text-xs text-slate-500">Quem você vai receber</p>
            </div>
            <Link to={`${basePath}/reservas`} className="text-sm font-bold text-cyan-300 hover:text-cyan-200">
              Ver agenda
            </Link>
          </div>

          <div className="divide-y divide-white/[0.07]">
            {visibleReservations.length ? (
              visibleReservations.map((reservation) => (
                <div key={reservation.id} className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/[0.025]">
                  <span className="grid h-11 w-14 shrink-0 place-items-center rounded-lg border border-cyan-400/15 bg-cyan-400/[0.07] text-sm font-black text-cyan-200">
                    {reservation.reservation_time}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{reservation.customer_name}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                      <UsersRound className="h-3.5 w-3.5" />
                      {reservation.party_size} {reservation.party_size === 1 ? 'pessoa' : 'pessoas'}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold',
                      reservation.status === 'confirmed'
                        ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                        : 'border-amber-400/20 bg-amber-400/10 text-amber-200',
                    )}
                  >
                    {reservation.status === 'confirmed' ? <CheckCheck className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                    {reservation.status === 'confirmed' ? 'Confirmada' : 'Pendente'}
                  </span>
                </div>
              ))
            ) : (
              <div className="grid min-h-48 place-items-center p-6 text-center">
                <div>
                  <CalendarDays className="mx-auto h-7 w-7 text-slate-600" />
                  <p className="mt-3 text-sm font-semibold text-slate-400">Nenhuma reserva para hoje.</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
};
