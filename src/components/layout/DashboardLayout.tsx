import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Bot,
  CalendarDays,
  CreditCard,
  Gauge,
  Megaphone,
  MessageSquareText,
  PanelLeft,
  Package,
  Settings,
  ShoppingBag,
  Upload,
  Users,
  Workflow,
  Search,
  Bell,
  LogOut,
} from 'lucide-react';
import { AppLogo } from '../ui/AppLogo';
import { useAuth } from '../../providers/AuthProvider';
import { useDemoMode } from '../../hooks/useDemoMode';
import { demoRestaurant } from '../../data/demo';
import { cn } from '../../lib/cn';

type MenuRole = 'owner' | 'admin' | 'manager' | 'agent';
const allRoles: MenuRole[] = ['owner', 'admin', 'manager', 'agent'];
type MenuItem = { label: string; to: string; icon: typeof Gauge; roles: MenuRole[]; hiddenInDemo?: boolean };

const menu: Array<{ label: string; items: MenuItem[] }> = [
  {
    label: 'Principal',
    items: [
      { label: 'Dashboard', to: 'dashboard', icon: Gauge, roles: ['owner', 'admin', 'manager'] as MenuRole[] },
      { label: 'Clientes', to: 'clientes', icon: Users, roles: allRoles },
      { label: 'Reservas', to: 'reservas', icon: CalendarDays, roles: ['owner', 'admin', 'manager'] as MenuRole[] },
      { label: 'Pedidos', to: 'pedidos', icon: ShoppingBag, roles: ['owner', 'admin', 'manager'] as MenuRole[] },
      { label: 'Importar pedidos', to: 'importar-pedidos', icon: Upload, roles: ['owner', 'admin', 'manager'] as MenuRole[], hiddenInDemo: true },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { label: 'Campanhas', to: 'campanhas', icon: Megaphone, roles: ['owner', 'admin', 'manager'] as MenuRole[] },
      { label: 'WhatsApp', to: 'whatsapp', icon: MessageSquareText, roles: ['owner', 'admin', 'agent'] as MenuRole[] },
      { label: 'IA', to: 'ia', icon: Bot, roles: ['owner', 'admin'] as MenuRole[] },
      { label: 'Automações', to: 'automacoes', icon: Workflow, roles: ['owner', 'admin'] as MenuRole[] },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { label: 'Meu Plano', to: 'meu-plano', icon: Package, roles: allRoles },
      { label: 'Relatórios', to: 'relatorios', icon: BarChart3, roles: ['owner', 'admin', 'manager'] as MenuRole[] },
      { label: 'Configurações', to: 'configuracoes', icon: Settings, roles: ['owner', 'admin'] as MenuRole[] },
      { label: 'Planos', to: 'planos', icon: CreditCard, roles: ['owner'] as MenuRole[] },
    ],
  },
];

const planLabels: Record<string, string> = {
  free: 'Free',
  plus: 'Plus',
  starter: 'Plus',
  pro: 'Pro',
  premium: 'Premium',
  lifetime: 'Vitalício',
  founder_lifetime: 'Vitalício',
};

const DEV_PLAN_STORAGE_KEY = 'syntra_dev_plan';

const isKnownPlan = (value: string | null | undefined): value is string => Boolean(value && planLabels[value]);
const paidPlans = new Set(['plus', 'starter', 'pro', 'premium', 'lifetime', 'founder_lifetime']);

export const DashboardLayout = () => {
  const { restaurant, profile, session, signOut, apiUser } = useAuth();
  const demoMode = useDemoMode();
  const location = useLocation();
  const basePath = demoMode ? '/demo' : '/app';
  const currentRestaurant = demoMode ? demoRestaurant : restaurant;
  const isDeveloper = !demoMode && Boolean(apiUser?.is_dev);
  const [devPlan, setDevPlan] = useState('lifetime');

  useEffect(() => {
    if (!isDeveloper) return;

    const syncDevPlan = () => {
      const savedPlan = localStorage.getItem(DEV_PLAN_STORAGE_KEY);
      setDevPlan(isKnownPlan(savedPlan) ? savedPlan : 'lifetime');
    };

    const handleDevPlanChange = (event: Event) => {
      const nextPlan = (event as CustomEvent<string>).detail;
      setDevPlan(isKnownPlan(nextPlan) ? nextPlan : 'lifetime');
    };

    syncDevPlan();
    window.addEventListener('storage', syncDevPlan);
    window.addEventListener('syntra-dev-plan-change', handleDevPlanChange);

    return () => {
      window.removeEventListener('storage', syncDevPlan);
      window.removeEventListener('syntra-dev-plan-change', handleDevPlanChange);
    };
  }, [isDeveloper]);

  const rawPlan = isDeveloper ? devPlan : currentRestaurant?.plan || 'free';
  const currentPlan = rawPlan;
  const planLocked = !demoMode && !isDeveloper && !paidPlans.has(currentPlan);
  const visibleMenu = menu
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (planLocked) return item.to === 'meu-plano' || (item.to === 'planos' && profile?.role === 'owner');
        if (demoMode) return !item.hiddenInDemo;
        return Boolean(profile?.role && item.roles.includes(profile.role));
      }),
    }))
    .filter((section) => section.items.length > 0);

  if (session && location.pathname.startsWith('/demo')) {
    return <Navigate to={location.pathname.replace('/demo', '/app')} replace />;
  }

  return (
    <div className="min-h-screen bg-ink text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[280px] border-r border-line bg-[#070912]/95 backdrop-blur-xl lg:flex lg:flex-col">
        <div className="border-b border-line p-5">
          <AppLogo to={demoMode ? '/demo/dashboard' : planLocked ? '/app/planos' : '/app/dashboard'} />
        </div>
        <nav className="flex-1 space-y-7 overflow-y-auto p-4">
          {visibleMenu.map((section) => (
            <div key={section.label}>
              <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.22em] text-muted">{section.label}</p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={`${basePath}/${item.to}`}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-300 transition',
                          isActive
                            ? 'border border-neon/25 bg-neon/13 text-white shadow-[0_0_20px_rgba(0,175,255,0.10)]'
                            : 'hover:bg-white/[0.06] hover:text-white',
                        )
                      }
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-4">
          <div className="rounded-2xl bg-white/[0.05] p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-neon to-fuchsia-500 text-sm font-black text-white">
                {(currentRestaurant?.name || 'SF').slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{currentRestaurant?.name || 'Restaurante'}</p>
                <p className="text-xs text-neon">{isDeveloper ? `Dev: ${planLabels[currentPlan] || 'Plano'}` : `Plano ${planLabels[currentPlan] || 'Free'}`}</p>
              </div>
            </div>
            {!demoMode ? (
              <button
                onClick={() => void signOut()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/[0.06]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sair
              </button>
            ) : (
              <p className="mt-3 rounded-xl border border-neon/20 bg-neon/10 px-3 py-2 text-xs font-semibold text-sky-100">
                Demonstração pública com dados fictícios.
              </p>
            )}
          </div>
        </div>
      </aside>

      <div className="lg:pl-[280px]">
        <header className="sticky top-0 z-30 border-b border-line bg-ink/82 px-4 py-3 backdrop-blur-xl md:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 lg:hidden">
              <PanelLeft className="h-5 w-5 text-neon" />
              <AppLogo to={demoMode ? '/demo/dashboard' : planLocked ? '/app/planos' : '/app/dashboard'} />
            </div>
            <div className="hidden lg:block">
              <p className="text-xs font-semibold text-neon">
                {new Intl.DateTimeFormat('pt-BR', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                }).format(new Date('2026-05-28'))}
              </p>
              <h2 className="text-lg font-black text-white">
                {demoMode ? 'Demonstração' : profile?.full_name ? `Olá, ${profile.full_name.split(' ')[0]}` : 'Painel'}
              </h2>
            </div>
            <div className="flex flex-1 justify-end gap-3">
              <label className="hidden min-w-[220px] items-center gap-2 rounded-xl border border-line bg-white/[0.05] px-3 py-2 text-sm text-muted md:flex">
                <Search className="h-4 w-4" />
                <input className="w-full bg-transparent outline-none placeholder:text-muted" placeholder="Buscar..." />
              </label>
              <button className="relative rounded-xl border border-line bg-white/[0.05] p-2.5 text-slate-200 transition hover:bg-white/[0.08]">
                <Bell className="h-4 w-4" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-fuchsia-400" />
              </button>
            </div>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto lg:hidden">
            {visibleMenu.flatMap((section) =>
              section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={`${basePath}/${item.to}`}
                  className={cn(
                    'shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-bold text-slate-300',
                    location.pathname.endsWith(item.to) && 'border-neon/50 bg-neon/15 text-white',
                  )}
                >
                  {item.label}
                </NavLink>
              )),
            )}
          </div>
        </header>

        <main className="min-h-[calc(100vh-73px)] px-4 py-6 md:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
