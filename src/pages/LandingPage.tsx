import {
  ArrowRight,
  Bot,
  CalendarCheck,
  Cake,
  Check,
  MessageSquareText,
  PieChart,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppLogo } from '../components/ui/AppLogo';
import { buttonStyles } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { customersByMonth, ordersByCategory } from '../data/demo';

const benefits = [
  {
    title: 'Clientes organizados',
    text: 'Nunca mais perca o histórico dos seus melhores clientes, saiba cada detalhe que vende em seu restaurante.',
    icon: Users,
  },
  { title: 'Reservas automáticas', text: 'Confirmações, lembretes e visão do dia em uma tela rápida.', icon: CalendarCheck },
  {
    title: 'Campanhas no WhatsApp',
    text: 'Traga clientes antigos de volta automaticamente pelo WhatsApp, gere movimento e vendas em seu restaurante',
    icon: MessageSquareText,
  },
  { title: 'Aniversários automatizados', text: 'Mensagens antes, no dia e depois com benefício configurável.', icon: Cake },
  { title: 'IA atendente', text: 'Sugestões de resposta, resumo de clientes e próximos passos.', icon: Bot },
  { title: 'Relatórios inteligentes', text: 'Retenção, ticket médio, receita estimada e melhores campanhas.', icon: PieChart },
];

const niches = ['Restaurantes', 'Pizzarias', 'Hamburguerias', 'Sushi', 'Bares', 'Cafeterias', 'Delivery', 'Food trucks'];

const publicPlans = [
  {
    name: 'Starter',
    price: 'R$ 19,90',
    cadence: '/mês',
    features: ['Clientes ilimitados', 'Leads ilimitados', '1 usuário / 1 WhatsApp', 'CRM completo'],
  },
  {
    name: 'Pro',
    price: 'R$ 49,90',
    cadence: '/mês',
    featured: true,
    badge: 'Recomendado',
    features: ['Clientes ilimitados', 'Leads ilimitados', 'IA básica', 'Campanhas automáticas', 'Aniversariantes'],
  },
  {
    name: 'Premium',
    price: 'R$ 99,90',
    cadence: '/mês',
    features: ['Clientes ilimitados', 'Leads ilimitados', '10 usuários / 5 WhatsApps', 'IA avançada', 'API completa'],
  },
  {
    name: 'Fundador Vitalício',
    price: 'R$ 500',
    cadence: 'único',
    featured: true,
    founder: true,
    badge: 'Licenças limitadas',
    features: ['Clientes ilimitados', 'Leads ilimitados', 'Tudo do Premium', 'Sem mensalidade', 'Selo Fundador'],
  },
];

const DashboardMockup = () => (
  <div className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-[28px] border border-neon/25 bg-[#080B16] shadow-[0_32px_120px_rgba(0,175,255,0.16)]">
    <div className="flex border-b border-line">
      <div className="hidden w-56 border-r border-line bg-[#080617] p-4 md:block">
        <AppLogo to="/" />
        <div className="mt-8 space-y-2">
          {['Dashboard', 'Clientes', 'Reservas', 'Campanhas', 'WhatsApp'].map((item, index) => (
            <div
              key={item}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${index === 0 ? 'bg-neon/14 text-white' : 'text-slate-400'}`}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1 p-4 md:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-neon">Quinta-feira, 28 maio 2026</p>
            <h3 className="text-xl font-black text-white">Dashboard</h3>
          </div>
          <div className="hidden rounded-xl border border-line bg-white/[0.05] px-4 py-2 text-sm text-muted sm:block">Buscar...</div>
        </div>
        <div className="mb-4 rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/10 p-4">
          <div className="flex items-center gap-3 text-sm font-semibold text-white">
            <Sparkles className="h-5 w-5 text-fuchsia-200" />
            Insights da IA: 23 clientes não voltam há 30+ dias.
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Total clientes', '1.284', '+38 este mês'],
            ['Reservas hoje', '17', '5 confirmadas'],
            ['Receita mês', 'R$48.2k', '+12% vs mês ant.'],
            ['Aniversariantes', '12', 'esta semana'],
          ].map(([label, value, delta]) => (
            <div key={label} className="rounded-2xl border border-line bg-white/[0.05] p-4">
              <p className="text-xs text-sky-100">{label}</p>
              <p className="mt-3 text-2xl font-black text-white">{value}</p>
              <p className="mt-1 text-xs text-neon">{delta}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-line bg-white/[0.04] p-4">
            <div className="flex items-end gap-2">
              {customersByMonth.map((bar) => (
                <div key={bar.month} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-electric to-neon"
                    style={{ height: `${bar.value / 3}px` }}
                  />
                  <span className="text-[10px] text-muted">{bar.month}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-white/[0.04] p-4">
            <p className="mb-3 text-sm font-bold text-white">Origem dos clientes</p>
            {ordersByCategory.slice(0, 4).map((item) => (
              <div key={item.name} className="mb-3">
                <div className="mb-1 flex justify-between text-xs">
                  <span>{item.name}</span>
                  <span>{item.value}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-neon" style={{ width: `${item.value * 2}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const LandingPage = () => (
  <div className="min-h-screen overflow-hidden bg-ink text-white">
    <header className="sticky top-0 z-50 border-b border-line bg-ink/82 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
        <AppLogo />
        <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-300 md:flex">
          <a href="#recursos" className="hover:text-white">Recursos</a>
          <a href="#nichos" className="hover:text-white">Nichos</a>
          <a href="#planos" className="hover:text-white">Planos</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/login" className="hidden text-sm font-bold text-slate-300 hover:text-white sm:block">
            Entrar
          </Link>
          <Link to="/cadastro" className={buttonStyles('primary', 'min-h-9 px-3 text-xs sm:px-4 sm:text-sm')}>
            Começar
          </Link>
        </div>
      </div>
    </header>

    <main>
      <section className="relative bg-radial-grid bg-[length:100%_100%,46px_46px,46px_46px] px-5 pb-16 pt-16 md:pb-24 md:pt-24">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-neon/25 bg-neon/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-sky-100">
              <ShieldCheck className="h-4 w-4 text-neon" />
              CRM seguro, multi-tenant e pronto para escala
            </div>
            <h1 className="text-4xl font-black leading-tight text-white md:text-6xl">
              Aumente as vendas do seu restaurante e recupere clientes antigos
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
              Organize clientes, automatize reservas, envie campanhas e recupere clientes antigos com uma plataforma
              inteligente feita para restaurantes.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/cadastro" className={buttonStyles('primary', 'px-6')}>
                Começar agora <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/demo/dashboard" className={buttonStyles('secondary', 'px-6')}>
                Ver demonstração
              </Link>
            </div>
          </div>
          <div className="mt-12">
            <DashboardMockup />
          </div>
        </div>
      </section>

      <section id="recursos" className="px-5 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 max-w-2xl">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-neon">Benefícios</p>
            <h2 className="text-3xl font-black md:text-4xl">Clientes voltando. Mesas cheias. Vendas crescendo.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {benefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <Card key={benefit.title} className="min-h-44">
                  <div className="mb-5 grid h-11 w-11 place-items-center rounded-2xl bg-neon/12 text-neon">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-black text-white">{benefit.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">{benefit.text}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-white/[0.025] px-5 py-20">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-neon">Como funciona</p>
            <h2 className="text-3xl font-black md:text-4xl">Da primeira visita à fidelização automática.</h2>
            <p className="mt-4 text-sm leading-7 text-muted">
              Cadastre seus clientes, conecte o WhatsApp, automatize campanhas e acompanhe o resultado com relatórios
              claros para decisão diária.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {['Cadastre seus clientes', 'Conecte o WhatsApp', 'Automatize campanhas', 'Acompanhe resultados'].map(
              (step, index) => (
                <Card key={step}>
                  <span className="mb-5 grid h-10 w-10 place-items-center rounded-full bg-neon text-sm font-black text-ink">
                    {index + 1}
                  </span>
                  <h3 className="text-lg font-black">{step}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">Fluxo guiado, seguro e pronto para a rotina da equipe.</p>
                </Card>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="px-5 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {['CRM', 'Reservas', 'Pedidos', 'Aniversários', 'Campanhas', 'IA', 'Dashboard', 'Automações'].map((item) => (
              <div key={item} className="rounded-2xl border border-line bg-panel/70 p-5 text-sm font-bold text-white">
                <Zap className="mb-4 h-5 w-5 text-neon" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="nichos" className="border-y border-line bg-white/[0.025] px-5 py-20">
        <div className="mx-auto max-w-7xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-neon">Nichos atendidos</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {niches.map((niche) => (
              <div key={niche} className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-4">
                <Check className="h-4 w-4 text-neon" />
                <span className="font-bold text-white">{niche}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="planos" className="px-5 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-neon">Planos</p>
            <h2 className="text-3xl font-black md:text-4xl">Escolha o ritmo de crescimento do restaurante.</h2>
          </div>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            {publicPlans.map((plan) => (
              <Card
                key={plan.name}
                className={
                  plan.founder
                    ? 'border-yellow-300/60 bg-yellow-300/10 shadow-[0_0_34px_rgba(250,204,21,0.16)]'
                    : plan.featured
                      ? 'border-neon/50 shadow-glow'
                      : ''
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-black">{plan.name}</h3>
                    <p className="mt-2 text-sm text-muted">{plan.cadence}</p>
                  </div>
                  {plan.featured ? (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${
                        plan.founder ? 'bg-yellow-300 text-black' : 'bg-neon text-ink'
                      }`}
                    >
                      {plan.badge || 'Popular'}
                    </span>
                  ) : null}
                </div>
                <p className="mt-6 text-3xl font-black">{plan.price}</p>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3 text-sm text-slate-300">
                      <Check className="h-4 w-4 shrink-0 text-neon" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/cadastro"
                  className={buttonStyles(
                    plan.featured ? 'primary' : 'secondary',
                    `mt-7 w-full ${plan.founder ? 'bg-yellow-300 text-black hover:bg-yellow-200' : ''}`,
                  )}
                >
                  Começar agora
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20">
        <div className="mx-auto max-w-5xl rounded-[28px] border border-neon/30 bg-gradient-to-br from-neon/18 to-electric/10 p-8 text-center shadow-glow md:p-12">
          <Workflow className="mx-auto mb-5 h-10 w-10 text-neon" />
          <h2 className="text-3xl font-black md:text-4xl">Comece a fidelizar seus clientes hoje.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-300">
            Automatize reservas, WhatsApp e fidelização com uma experiência premium para sua equipe.
          </p>
          <div className="mt-7">
            <Link to="/cadastro" className={buttonStyles('primary', 'px-7')}>
              Criar minha conta <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  </div>
);
