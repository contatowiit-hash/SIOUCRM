import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, CreditCard, Crown, Infinity as InfinityIcon, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { useDemoMode } from '../hooks/useDemoMode';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useAuth } from '../providers/AuthProvider';

type PlanId = 'free' | 'plus' | 'starter' | 'pro' | 'premium' | 'lifetime' | 'founder_lifetime';
type CheckoutPlanId = 'plus' | 'pro' | 'premium' | 'lifetime' | 'founder_lifetime';

const DEV_PLAN_STORAGE_KEY = 'syntra_dev_plan';
const PENDING_CHECKOUT_KEY = 'pendingCheckout';
const PENDING_SESSION_ID_KEY = 'pendingSessionId';
const REDIRECT_AFTER_LOGIN_KEY = 'redirectAfterLogin';
const PLAN_IDS: PlanId[] = ['free', 'plus', 'starter', 'pro', 'premium', 'lifetime', 'founder_lifetime'];

const isPlanId = (value: string | null | undefined): value is PlanId =>
  Boolean(value && PLAN_IDS.includes(value as PlanId));

type BillingPlan = {
  id: PlanId;
  name: string;
  price: string;
  cadence: string;
  description: string;
  button: string;
  features: string[];
  badge?: string;
  free?: boolean;
  lifetime?: boolean;
};

const planLabels: Record<PlanId, string> = {
  free: 'Free',
  plus: 'Plus',
  starter: 'Plus',
  pro: 'Pro',
  premium: 'Premium',
  lifetime: 'Vitalício',
  founder_lifetime: 'Founder',
};

const plans: BillingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 'R$ 0',
    cadence: 'grátis',
    description: 'Para entrar, conhecer o CRM e depois escolher um plano pago.',
    badge: 'Comece aqui',
    free: true,
    button: 'Plano gratuito',
    features: [
      'Clientes ilimitados',
      'Leads ilimitados',
      '1 usuário',
      'CRM básico + histórico de clientes',
      'Relatórios básicos',
      'Sem IA e sem automações pagas',
    ],
  },
  {
    id: 'plus',
    name: 'Plus',
    price: 'R$ 47',
    cadence: '/mês',
    description: 'Para começar com CRM completo e base ilimitada.',
    button: 'Começar no Plus',
    features: [
      'Clientes ilimitados',
      'Leads ilimitados',
      '1 usuário / 1 WhatsApp',
      'CRM completo + histórico de clientes',
      'Campanhas básicas / relatórios básicos',
      'Sem IA',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'R$ 147',
    cadence: '/mês',
    description: 'Para vender mais com IA, follow-up e automações.',
    badge: 'Recomendado',
    button: 'Selecionar Pro',
    features: [
      'Clientes ilimitados',
      'Leads ilimitados',
      'Tudo do Plus',
      '3 usuários / 2 WhatsApps',
      'IA básica de atendimento',
      'Follow-up automático + campanhas automáticas',
      'Relatórios avançados + aniversariantes',
      'Webhooks básicos',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 'R$ 297',
    cadence: '/mês',
    description: 'Para operações maiores, multiunidade e API completa.',
    button: 'Selecionar Premium',
    features: [
      'Clientes ilimitados',
      'Leads ilimitados',
      'Tudo do Pro',
      '10 usuários / 5 WhatsApps',
      'IA avançada + multiunidade',
      'Automações avançadas + relatórios premium',
      'Webhooks / API completa',
      'Suporte prioritário',
    ],
  },
  {
    id: 'founder_lifetime',
    name: 'Founder',
    price: 'R$ 1.497',
    cadence: 'pagamento único',
    description: 'Oferta especial limitada para entrar cedo e ficar para sempre.',
    badge: 'Licenças limitadas',
    lifetime: true,
    button: 'Garantir minha vaga',
    features: [
      'Clientes ilimitados',
      'Leads ilimitados',
      'Tudo do Premium',
      'Acesso vitalício + atualizações futuras inclusas',
      'Sem mensalidade',
      'Selo vitalício exclusivo',
      'Licenças limitadas',
    ],
  },
];

export const BillingPage = () => {
  const demoMode = useDemoMode();
  const { restaurant, apiUser, refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isDeveloper = Boolean(apiUser?.is_dev);
  const [devPlan, setDevPlan] = useState<PlanId>('founder_lifetime');
  const [checkoutPlan, setCheckoutPlan] = useState<PlanId | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null);
  const [confirmingPlan, setConfirmingPlan] = useState(false);

  useEffect(() => {
    if (!isDeveloper) return;

    const savedPlan = localStorage.getItem(DEV_PLAN_STORAGE_KEY);
    if (isPlanId(savedPlan)) {
      setDevPlan(savedPlan);
    }
  }, [isDeveloper]);

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    const sessionId = searchParams.get('session_id') || localStorage.getItem(PENDING_SESSION_ID_KEY);
    if (checkout === 'cancelled') {
      setCheckoutError('Checkout cancelado. Nenhuma assinatura foi alterada.');
      localStorage.removeItem(PENDING_CHECKOUT_KEY);
      localStorage.removeItem(PENDING_SESSION_ID_KEY);
      localStorage.removeItem(REDIRECT_AFTER_LOGIN_KEY);
      setSearchParams({}, { replace: true });
      return;
    }

    if (checkout !== 'success' || confirmingPlan) return;

    setCheckoutError(null);
    if (!sessionId) {
      setCheckoutSuccess('Pagamento concluido. Aguardando confirmacao do webhook do Stripe.');
      refreshProfile().catch(() => undefined);
      setSearchParams({}, { replace: true });
      return;
    }

    setConfirmingPlan(true);
    setCheckoutSuccess('Confirmando seu plano...');
    api
      .confirmSession({ session_id: sessionId })
      .then(async (result) => {
        await refreshProfile();
        if (isDeveloper && isPlanId(result.plan)) {
          setDevPlan(result.plan);
          localStorage.setItem(DEV_PLAN_STORAGE_KEY, result.plan);
          window.dispatchEvent(new CustomEvent('syntra-dev-plan-change', { detail: result.plan }));
        }
        setCheckoutSuccess(`Assinatura ${planLabels[result.plan]} ativada com sucesso.`);
      })
      .catch((error) => {
        setCheckoutError(error instanceof Error ? error.message : 'Nao foi possivel confirmar seu plano agora.');
        setCheckoutSuccess(null);
      })
      .finally(() => {
        localStorage.removeItem(PENDING_CHECKOUT_KEY);
        localStorage.removeItem(PENDING_SESSION_ID_KEY);
        localStorage.removeItem(REDIRECT_AFTER_LOGIN_KEY);
        setConfirmingPlan(false);
        setSearchParams({}, { replace: true });
      });
  }, [confirmingPlan, isDeveloper, refreshProfile, searchParams, setSearchParams]);

  const selectDevPlan = (planId: PlanId) => {
    if (!isDeveloper) return;

    setDevPlan(planId);
    localStorage.setItem(DEV_PLAN_STORAGE_KEY, planId);
    window.dispatchEvent(new CustomEvent('syntra-dev-plan-change', { detail: planId }));
  };

  const startCheckout = async (planId: PlanId) => {
    if (demoMode) {
      setCheckoutError('Demonstração somente para visualização.');
      return;
    }

    if (isDeveloper && (planId === 'free' || planId === 'starter')) {
      selectDevPlan(planId);
      return;
    }

    if (planId === 'free' || planId === 'starter' || (!isDeveloper && planId === currentPlan)) return;

    try {
      setCheckoutError(null);
      setCheckoutPlan(planId);
      const result = await api.createCheckout({ plan: planId as CheckoutPlanId });
      localStorage.setItem(PENDING_CHECKOUT_KEY, 'true');
      if (result.session_id) localStorage.setItem(PENDING_SESSION_ID_KEY, result.session_id);
      localStorage.setItem(REDIRECT_AFTER_LOGIN_KEY, '/app/planos?checkout=success');
      window.location.assign(result.url);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Não foi possível abrir o checkout agora.');
    } finally {
      setCheckoutPlan(null);
    }
  };

  const backendPlan = isPlanId(restaurant?.plan) ? restaurant.plan : 'free';
  const rawPlan = isDeveloper ? devPlan : backendPlan;
  const currentPlan = rawPlan;
  const activePlan =
    plans.find((plan) => plan.id === currentPlan) ||
    ({
      id: currentPlan,
      name: planLabels[currentPlan],
      price: '',
      cadence: '',
      description: '',
      button: '',
      features: [],
      lifetime: currentPlan === 'lifetime' || currentPlan === 'founder_lifetime',
      free: currentPlan === 'free',
    } satisfies BillingPlan);

  return (
    <div>
    <PageHeader
      title="Planos / Assinatura"
      description="Assinatura validada no backend. Cartões nunca passam pelo SIOU."
      actions={<Button icon={<CreditCard className="h-4 w-4" />} disabled={demoMode}>Gerenciar cobrança</Button>}
    />

    <div className="hidden sticky top-[72px] z-20 mb-4 rounded-2xl border border-sky-300/35 bg-[#06111f]/95 px-4 py-3 shadow-[0_18px_70px_rgba(56,189,248,0.16)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sky-400/15 text-sky-300">
            <InfinityIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-black text-white">Clientes ilimitados + Leads ilimitados em todos os planos</p>
            <p className="text-xs text-slate-400">A diferença dos planos está em usuários, WhatsApps, IA, automações e suporte.</p>
          </div>
        </div>
        <span className="w-fit rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-sky-200">
          Sem limite de base
        </span>
      </div>
    </div>

    <Card className="mb-4 hidden border-neon/30 bg-neon/10">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-neon/15 text-neon">
            <Crown className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-black text-white">
              {isDeveloper ? `Conta Dev: testando ${planLabels[currentPlan]}` : `Plano ${planLabels[currentPlan]} ativo`}
            </h2>
            <p className="mt-1 text-sm text-sky-100">
              {isDeveloper
                ? 'Conta dev com acesso liberado. Os botões pagos abrem o checkout de teste do Stripe.'
                : activePlan.lifetime
                ? 'Acesso vitalício ativo. Recursos liberados com validação segura no backend.'
                : activePlan.free
                  ? 'Plano gratuito ativo. Escolha um plano pago quando quiser liberar recursos avançados.'
                  : 'Renovação em 28/06/2026. Recursos liberados com validação segura no backend.'}
            </p>
          </div>
        </div>
        <Button variant="secondary" icon={<ShieldCheck className="h-4 w-4" />} disabled={confirmingPlan}>
          {confirmingPlan ? 'Confirmando...' : 'Ver status seguro'}
        </Button>
      </div>
    </Card>

    {checkoutSuccess ? (
      <div className="mb-4 rounded-2xl border border-neon/40 bg-neon/12 px-4 py-3 text-sm font-semibold text-sky-100">
        {checkoutSuccess}
      </div>
    ) : null}

    {checkoutError ? (
      <div className="mb-4 rounded-2xl border border-rose-400/40 bg-rose-500/12 px-4 py-3 text-sm font-semibold text-rose-100">
        {checkoutError}
      </div>
    ) : null}

    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      {plans.map((plan) => (
        <Card
          key={plan.id}
          className={cn(
            'relative flex min-h-[430px] flex-col overflow-hidden',
            plan.id === currentPlan ? 'border-sky-300/70 shadow-[0_0_38px_rgba(56,189,248,0.28)]' : '',
            plan.lifetime ? 'border-yellow-300/70 bg-[linear-gradient(145deg,rgba(250,204,21,0.16),rgba(11,16,32,0.92)_44%)] shadow-[0_0_42px_rgba(250,204,21,0.16)]' : '',
          )}
        >
          {plan.lifetime ? <div className="absolute inset-x-0 top-0 h-1 bg-yellow-300" /> : null}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-white">{plan.name}</h2>
              <p className="mt-2 min-h-10 text-sm leading-5 text-muted">{plan.description}</p>
            </div>
            {plan.badge ? (
              <span
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-xs font-black',
                  plan.lifetime ? 'bg-yellow-300 text-black' : 'bg-sky-300 text-ink',
                )}
              >
                {plan.badge}
              </span>
            ) : null}
          </div>

          <div className="mt-6">
            <p className="text-3xl font-black text-white">{plan.price}</p>
            <p className={cn('mt-1 text-sm font-bold', plan.lifetime ? 'text-yellow-200' : 'text-sky-200')}>{plan.cadence}</p>
          </div>

          <div className="mt-5 hidden gap-2">
            {['Clientes ilimitados', 'Leads ilimitados'].map((item) => (
              <div
                key={`${plan.id}-${item}`}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-black',
                  plan.lifetime
                    ? 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100'
                    : 'border-sky-300/30 bg-sky-400/10 text-sky-100',
                )}
              >
                <Users className="h-4 w-4" />
                {item}
              </div>
            ))}
          </div>

          <div className="mt-6 flex-1 space-y-3">
            {plan.features.map((feature) => (
              <p key={feature} className="flex items-start gap-3 text-sm leading-5 text-slate-300">
                <Check
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    plan.lifetime ? 'text-yellow-300' : feature.includes('ilimitados') ? 'text-sky-300' : 'text-neon',
                  )}
                />
                {feature}
              </p>
            ))}
          </div>
          <Button
            onClick={() => startCheckout(plan.id)}
            disabled={demoMode || checkoutPlan === plan.id}
            className={cn(
              'mt-7 w-full',
              plan.lifetime
                ? 'bg-yellow-300 text-black shadow-[0_0_28px_rgba(250,204,21,0.24)] hover:bg-yellow-200 hover:shadow-[0_0_36px_rgba(250,204,21,0.34)]'
                : '',
            )}
            variant={plan.id === currentPlan || plan.lifetime ? 'primary' : 'secondary'}
          >
            {checkoutPlan === plan.id
              ? 'Abrindo checkout...'
              : isDeveloper && (plan.free || plan.id === 'starter')
                ? plan.id === currentPlan
                  ? 'Testando agora'
                  : `Testar ${plan.name}`
                : isDeveloper
                  ? plan.button
                : plan.id === currentPlan
                  ? 'Plano atual'
                  : plan.button}
          </Button>
          <p className="mt-3 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Identificador: {plan.id}
          </p>
        </Card>
      ))}
    </div>

    <div className="mt-5 hidden gap-4 md:grid-cols-3">
      {[
        { icon: Zap, title: 'Upgrade sem travar', text: 'Os planos usam os novos identificadores sem quebrar o fluxo atual de checkout.' },
        { icon: ShieldCheck, title: 'Validação segura', text: 'Permissões continuam passando pelo backend antes de liberar recursos pagos.' },
        { icon: Sparkles, title: 'Vitalício separado', text: 'O vitalício usa lifetime: true, separado da renovação mensal dos outros planos.' },
      ].map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.title} className="border-sky-300/15 bg-white/[0.035]">
            <Icon className="mb-4 h-5 w-5 text-sky-300" />
            <h3 className="font-black text-white">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{item.text}</p>
          </Card>
        );
      })}
    </div>
    </div>
  );
};
