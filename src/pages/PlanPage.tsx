import {
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  MessageCircle,
  PackageCheck,
  ShoppingBag,
  TriangleAlert,
  WalletCards,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Card } from '../components/ui/Card';
import { useDemoMode } from '../hooks/useDemoMode';
import { api, type PlanCurrentResponse } from '../lib/api';
import { cn } from '../lib/cn';

const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
const formatMoney = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date(value));

const daysUntil = (value: string) =>
  Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));

const UsageCard = ({
  icon,
  label,
  value,
  detail,
  progress,
  tone = 'cyan',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  progress?: number;
  tone?: 'cyan' | 'green' | 'amber';
}) => {
  const colors = {
    cyan: { text: 'text-cyan-300', bar: 'bg-cyan-400' },
    green: { text: 'text-emerald-300', bar: 'bg-emerald-400' },
    amber: { text: 'text-amber-300', bar: 'bg-amber-400' },
  }[tone];

  return (
    <Card className="min-h-[180px] rounded-lg border-white/10 bg-[#101720] p-5 shadow-none">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-400">
        <span className={colors.text}>{icon}</span>
        <span>{label}</span>
      </div>
      <p className={cn('mt-4 text-4xl font-black text-white', tone === 'amber' && 'text-amber-300')}>{value}</p>
      <p className={cn('mt-1 text-sm font-semibold', colors.text)}>{detail}</p>
      {typeof progress === 'number' ? (
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/[0.07]">
          <div className={cn('h-full rounded-full transition-all', colors.bar)} style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </Card>
  );
};

const DemoPlanPreview = () => (
  <div className="mx-auto max-w-[1180px] pb-8">
    <p className="text-xs font-bold uppercase text-cyan-300">SIOU</p>
    <h1 className="mt-2 text-3xl font-black text-white">Seu uso este mês</h1>
    <p className="mt-1 text-sm text-slate-400">Entre na sua conta para ver os dados reais do seu plano.</p>

    <Card className="mt-7 rounded-lg border-cyan-400/25 bg-cyan-400/[0.07] shadow-none">
      <div className="flex items-center gap-4">
        <PackageCheck className="h-8 w-8 shrink-0 text-cyan-300" />
        <div>
          <h2 className="font-black text-white">Seu plano será acompanhado automaticamente</h2>
          <p className="mt-1 text-sm text-slate-300">Aqui você verá quanto já usou e se terá algum valor adicional.</p>
        </div>
      </div>
    </Card>

    <div className="mt-5 grid gap-4 md:grid-cols-3">
      <UsageCard icon={<CheckCircle2 className="h-5 w-5" />} label="Conversas disponíveis" value="—" detail="Dados reais após entrar" tone="green" />
      <UsageCard icon={<MessageCircle className="h-5 w-5" />} label="Conversas utilizadas" value="—" detail="Dados reais após entrar" />
      <UsageCard icon={<WalletCards className="h-5 w-5" />} label="Valor extra até agora" value="—" detail="Dados reais após entrar" tone="amber" />
    </div>
  </div>
);

export const PlanPage = () => {
  const demoMode = useDemoMode();
  const [data, setData] = useState<PlanCurrentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demoMode) return;
    let active = true;
    api
      .currentPlan()
      .then((result) => active && setData(result))
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar seu plano.');
      });
    return () => {
      active = false;
    };
  }, [demoMode]);

  if (demoMode) return <DemoPlanPreview />;

  if (error) {
    return (
      <Card className="border-rose-400/25 bg-rose-500/10">
        <h1 className="text-xl font-black text-white">Meu Plano</h1>
        <p className="mt-2 text-sm text-rose-100">{error}</p>
      </Card>
    );
  }

  if (!data) {
    return <Card><p className="text-sm font-semibold text-slate-300">Carregando seu plano...</p></Card>;
  }

  const state = {
    within_plan: {
      icon: <CheckCircle2 className="h-7 w-7" />,
      title: 'Você está dentro do seu plano',
      text: 'Tudo funcionando normalmente.',
      box: 'border-emerald-400/40 bg-emerald-400/[0.06]',
      iconColor: 'text-emerald-300',
      tone: 'green' as const,
    },
    attention: {
      icon: <TriangleAlert className="h-7 w-7" />,
      title: 'Você está chegando perto do limite',
      text: 'Acompanhe o uso até a próxima renovação.',
      box: 'border-amber-400/60 bg-amber-400/[0.06]',
      iconColor: 'text-amber-300',
      tone: 'amber' as const,
    },
    exceeded: {
      icon: <CircleAlert className="h-7 w-7" />,
      title: 'Você ultrapassou o limite do seu plano',
      text: data.financials_visible
        ? 'O SIOU continua funcionando. O valor adicional aparece abaixo.'
        : 'O SIOU continua funcionando normalmente.',
      box: 'border-rose-400/50 bg-rose-400/[0.06]',
      iconColor: 'text-rose-300',
      tone: 'amber' as const,
    },
  }[data.status];

  const renewalDays = daysUntil(data.period.end);
  const includedLabel = data.plan.monthly_limit === null
    ? 'Conversas sem limite'
    : `${formatNumber(data.plan.monthly_limit)} conversas incluídas`;
  const remainingValue = data.usage.conversations_remaining === null
    ? 'Sem limite'
    : formatNumber(data.usage.conversations_remaining);
  const additionalValue = data.financials_visible
    ? formatMoney(data.billing.estimated_additional_amount ?? 0)
    : `${formatNumber(data.usage.additional_usage)} conversas`;
  const categories = [
    [MessageCircle, 'Conversas no WhatsApp', data.usage.categories.whatsapp_conversations],
    [Bot, 'Respostas automáticas', data.usage.categories.automatic_replies],
    [CalendarDays, 'Reservas', data.usage.categories.reservations],
    [ShoppingBag, 'Pedidos', data.usage.categories.orders],
  ] as const;

  return (
    <div className="mx-auto max-w-[1180px] pb-8">
      <div>
        <p className="text-xs font-bold uppercase text-cyan-300">SIOU</p>
        <h1 className="mt-2 text-3xl font-black text-white">Seu uso este mês</h1>
        <p className="mt-1 text-sm text-slate-400">Plano {data.plan.name} · Renova em {renewalDays} {renewalDays === 1 ? 'dia' : 'dias'}</p>
      </div>

      <Card className={cn('mt-7 rounded-lg px-5 py-4 shadow-none', state.box)}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className={state.iconColor}>{state.icon}</span>
            <div>
              <h2 className="font-black text-white">{state.title}</h2>
              <p className="mt-1 text-sm text-slate-300">{state.text}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => document.getElementById('plan-details')?.scrollIntoView({ behavior: 'smooth' })}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/[0.04] px-4 text-sm font-bold text-white transition hover:bg-white/[0.08]"
          >
            Ver detalhes
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </Card>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <UsageCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Conversas disponíveis"
          value={remainingValue}
          detail={includedLabel}
          progress={data.plan.monthly_limit === null ? undefined : Math.max(0, 100 - data.usage.progress)}
          tone="green"
        />
        <UsageCard
          icon={<MessageCircle className="h-5 w-5" />}
          label="Conversas utilizadas"
          value={formatNumber(data.usage.conversations_used)}
          detail={data.usage_level}
          progress={data.plan.monthly_limit === null ? undefined : data.usage.progress}
          tone={state.tone}
        />
        <UsageCard
          icon={<WalletCards className="h-5 w-5" />}
          label={data.financials_visible ? 'Valor extra até agora' : 'Uso adicional'}
          value={additionalValue}
          detail={
            data.financials_visible
              ? data.billing.will_pay_extra ? `${formatNumber(data.usage.additional_usage)} conversas além do plano` : 'Sem cobrança adicional'
              : 'Valores disponíveis apenas para o responsável da conta'
          }
          tone="amber"
        />
      </div>

      <Card className="mt-5 rounded-lg border-white/10 bg-[#101720] px-5 py-4 shadow-none">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-400">Próxima renovação em <strong className="text-white">{formatDate(data.period.end)}</strong></p>
            <p className="mt-1 text-sm text-slate-400">Seu uso é acompanhado automaticamente até essa data.</p>
          </div>
          {data.financials_visible ? (
            <div className="sm:text-right">
              <p className="text-2xl font-black text-white">{formatMoney(data.billing.estimated_additional_amount ?? 0)}</p>
              <p className="text-xs text-slate-500">valor adicional até agora</p>
            </div>
          ) : null}
        </div>
      </Card>

      <div id="plan-details" className="mt-5 grid scroll-mt-6 gap-4 lg:grid-cols-2">
        <Card className="rounded-lg border-white/10 bg-[#101720] shadow-none">
          <h2 className="flex items-center gap-2 font-black text-white">
            <MessageCircle className="h-5 w-5 text-cyan-300" />
            Onde estou usando meu plano
          </h2>
          <div className="mt-4 divide-y divide-white/[0.07]">
            {categories.map(([Icon, label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <span className="flex min-w-0 items-center gap-3 text-sm text-slate-400">
                  <Icon className="h-4 w-4 shrink-0 text-cyan-300" />
                  {label}
                </span>
                <strong className="shrink-0 text-sm text-white">{formatNumber(value)}</strong>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-lg border-white/10 bg-[#101720] shadow-none">
          <h2 className="flex items-center gap-2 font-black text-white">
            <PackageCheck className="h-5 w-5 text-emerald-300" />
            O que está incluído no seu plano
          </h2>
          <div className="mt-4 divide-y divide-white/[0.07]">
            <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
              <span className="text-sm text-slate-400">Plano atual</span>
              <strong className="text-sm text-white">{data.plan.name}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <span className="text-sm text-slate-400">Conversas por mês</span>
              <strong className="text-right text-sm text-white">{data.plan.monthly_limit === null ? 'Sem limite' : formatNumber(data.plan.monthly_limit)}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <span className="text-sm text-slate-400">Uso adicional</span>
              <strong className="text-right text-sm text-white">{data.usage.additional_usage > 0 ? `${formatNumber(data.usage.additional_usage)} conversas` : 'Nenhum'}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
              <span className="text-sm text-slate-400">Próxima renovação</span>
              <strong className="text-right text-sm text-white">{formatDate(data.period.end)}</strong>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
