import { cn } from '../../lib/cn';

const labels: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  vip: 'VIP',
  new: 'Novo',
  pending: 'Pendente',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Concluída',
  no_show: 'No-show',
  received: 'Recebido',
  preparing: 'Preparando',
  delivered: 'Entregue',
  draft: 'Rascunho',
  scheduled: 'Agendada',
  sending: 'Enviando',
  sent: 'Enviada',
  paused: 'Pausada',
};

export const StatusBadge = ({ status }: { status: string }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
      ['vip', 'sent', 'confirmed', 'delivered', 'active'].includes(status) &&
        'border-neon/35 bg-neon/12 text-sky-100',
      ['inactive', 'cancelled', 'no_show'].includes(status) && 'border-rose-400/30 bg-rose-500/12 text-rose-100',
      ['new', 'pending', 'scheduled', 'sending', 'received', 'preparing'].includes(status) &&
        'border-amber-300/30 bg-amber-300/12 text-amber-100',
      status === 'draft' && 'border-slate-400/30 bg-slate-400/10 text-slate-200',
      status === 'paused' && 'border-fuchsia-300/30 bg-fuchsia-400/10 text-fuchsia-100',
    )}
  >
    {labels[status] || status}
  </span>
);
