import { zodResolver } from '@hookform/resolvers/zod';
import {
  Activity,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  MessageSquareText,
  Plus,
  Power,
  Target,
  Workflow,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useDemoMode } from '../hooks/useDemoMode';
import { useAutomations, useCreateAutomation, useUpdateAutomationStatus } from '../hooks/useRestaurantData';
import { AutomationSchema, type AutomationInput } from '../schemas/modules';

type AutomationRecipe = AutomationInput & {
  metric: string;
};

const recipes: AutomationRecipe[] = [
  {
    name: 'Confirmação de reserva',
    trigger_type: 'Quando uma reserva for criada ou confirmada',
    audience: 'Clientes com reserva ativa',
    action: 'Enviar confirmação com data, horário e quantidade de pessoas',
    channel: 'WhatsApp',
    impact: 'Reduz no-show e evita mesa perdida',
    message: 'Olá, {nome}! Sua reserva no {restaurante} está confirmada para {data} às {hora}. Esperamos você!',
    status: 'active',
    metric: 'Reservas confirmadas e no-show',
  },
  {
    name: 'Aniversário do cliente',
    trigger_type: '7 dias antes, no dia e 3 dias depois do aniversário',
    audience: 'Clientes com data de nascimento cadastrada',
    action: 'Enviar presente, cupom ou cortesia automaticamente',
    channel: 'WhatsApp',
    impact: 'Traz o cliente de volta em uma data importante',
    message: 'Feliz aniversário, {nome}! Você ganhou uma sobremesa grátis ou 10% OFF para comemorar com a gente.',
    status: 'active',
    metric: 'Cupons usados e clientes que voltaram',
  },
  {
    name: 'Cliente inativo',
    trigger_type: 'Quando o cliente ficar 30 dias sem pedido ou visita',
    audience: 'Clientes sem retorno nos últimos 30 dias',
    action: 'Enviar uma oferta de recuperação com chamada clara para voltar',
    channel: 'WhatsApp',
    impact: 'Recupera clientes antes que esqueçam o restaurante',
    message: 'Oi, {nome}! Sentimos sua falta. Temos uma oferta especial para seu próximo pedido esta semana.',
    status: 'active',
    metric: 'Clientes recuperados e receita estimada',
  },
  {
    name: 'Pós-venda',
    trigger_type: '2 horas depois de um pedido entregue',
    audience: 'Clientes com pedido entregue hoje',
    action: 'Pedir avaliação e sugerir próxima compra',
    channel: 'WhatsApp',
    impact: 'Aumenta recompra e melhora relacionamento',
    message: 'Oi, {nome}! Como foi seu pedido? Sua opinião ajuda nosso restaurante a melhorar cada dia.',
    status: 'active',
    metric: 'Respostas, avaliações e recompra',
  },
  {
    name: 'Sexta de movimento',
    trigger_type: 'Toda sexta-feira às 11:00',
    audience: 'Clientes ativos e VIP',
    action: 'Enviar campanha de final de semana com reserva ou cupom',
    channel: 'WhatsApp',
    impact: 'Aumenta pedidos e reservas nos dias fortes',
    message: 'Hoje é dia de mesa cheia. Reserve agora ou peça pelo WhatsApp e aproveite a campanha do fim de semana.',
    status: 'active',
    metric: 'Pedidos do fim de semana',
  },
  {
    name: 'Lead novo',
    trigger_type: 'Quando um contato chegar pelo WhatsApp, Instagram ou indicação',
    audience: 'Leads ainda sem pedido',
    action: 'Salvar lead, aplicar tag e enviar primeira mensagem',
    channel: 'WhatsApp',
    impact: 'Transforma conversa solta em cliente cadastrado',
    message: 'Olá, {nome}! Que bom falar com você. Posso te enviar nosso cardápio e as promoções de hoje?',
    status: 'active',
    metric: 'Leads convertidos em pedido',
  },
];

const flow = [
  {
    icon: Clock3,
    title: 'Gatilho',
    text: 'O evento que liga a automação: reserva criada, aniversário, pedido entregue ou cliente inativo.',
  },
  {
    icon: MessageSquareText,
    title: 'Ação',
    text: 'O que o SIOU faz sozinho: envia WhatsApp, cria campanha, aplica tag ou coloca o cliente na fila.',
  },
  {
    icon: Target,
    title: 'Resultado',
    text: 'O número que mostra se valeu a pena: retorno, resposta, cupom usado, reserva confirmada ou receita.',
  },
];

const AutomationModal = ({
  initial,
  onClose,
}: {
  initial?: Partial<AutomationInput>;
  onClose: () => void;
}) => {
  const createAutomation = useCreateAutomation();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AutomationInput>({
    resolver: zodResolver(AutomationSchema),
    defaultValues: {
      name: initial?.name || '',
      trigger_type: initial?.trigger_type || '',
      audience: initial?.audience || '',
      action: initial?.action || '',
      channel: initial?.channel || 'WhatsApp',
      impact: initial?.impact || '',
      message: initial?.message || '',
      status: initial?.status || 'active',
    },
  });
  const preview = watch();

  const onSubmit = async (values: AutomationInput) => {
    setFormError(null);
    try {
      await createAutomation.mutateAsync({
        ...values,
        impact: values.impact || null,
        message: values.message || null,
      });
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível salvar a automação.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit(onSubmit)} className="glass-panel max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-white">Nova automação</h2>
            <p className="mt-1 text-sm text-muted">Defina quando dispara, quem recebe e qual ação acontece.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-slate-300">
            Fechar
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Nome da automação</span>
            <input className="form-field" {...register('name')} />
            {errors.name ? <p className="mt-2 text-xs text-rose-200">{errors.name.message}</p> : null}
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Canal</span>
            <select className="form-field" {...register('channel')}>
              <option>WhatsApp</option>
              <option>Email</option>
              <option>SMS</option>
              <option>Interno</option>
            </select>
            {errors.channel ? <p className="mt-2 text-xs text-rose-200">{errors.channel.message}</p> : null}
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Gatilho</span>
            <input className="form-field" placeholder="Ex: 30 dias sem pedido" {...register('trigger_type')} />
            {errors.trigger_type ? <p className="mt-2 text-xs text-rose-200">{errors.trigger_type.message}</p> : null}
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Público</span>
            <input className="form-field" placeholder="Ex: Clientes VIP, inativos ou aniversariantes" {...register('audience')} />
            {errors.audience ? <p className="mt-2 text-xs text-rose-200">{errors.audience.message}</p> : null}
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Ação</span>
            <input className="form-field" placeholder="Ex: Enviar cupom pelo WhatsApp" {...register('action')} />
            {errors.action ? <p className="mt-2 text-xs text-rose-200">{errors.action.message}</p> : null}
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Mensagem</span>
            <textarea className="form-field min-h-28 resize-none" {...register('message')} />
            {errors.message ? <p className="mt-2 text-xs text-rose-200">{errors.message.message}</p> : null}
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Resultado esperado</span>
            <input className="form-field" placeholder="Ex: recuperar clientes e aumentar pedidos" {...register('impact')} />
          </label>
        </div>

        <div className="mt-5 rounded-2xl border border-neon/20 bg-neon/10 p-4">
          <p className="text-xs font-bold uppercase text-sky-100">Resumo do fluxo</p>
          <div className="mt-3 grid gap-3 text-sm text-slate-200 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
            <span>{preview.trigger_type || 'Gatilho'}</span>
            <ArrowRight className="hidden h-4 w-4 text-neon md:block" />
            <span>{preview.action || 'Ação'}</span>
            <ArrowRight className="hidden h-4 w-4 text-neon md:block" />
            <span>{preview.impact || 'Resultado'}</span>
          </div>
        </div>

        {formError ? <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{formError}</div> : null}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSubmitting || createAutomation.isPending}>Salvar automação</Button>
        </div>
      </form>
    </div>
  );
};

export const AutomationsPage = () => {
  const demoMode = useDemoMode();
  const { data: automations = [] } = useAutomations();
  const updateStatus = useUpdateAutomationStatus();
  const [modalOpen, setModalOpen] = useState(false);
  const [template, setTemplate] = useState<Partial<AutomationInput> | undefined>();

  const openTemplate = (item: Partial<AutomationInput>) => {
    if (demoMode) return;
    setTemplate(item);
    setModalOpen(true);
  };

  const activeCount = automations.filter((automation) => automation.status === 'active').length;
  const pausedCount = automations.filter((automation) => automation.status === 'paused').length;

  return (
    <div>
      <PageHeader
        title="Automações"
        description="Aqui ficam as tarefas repetitivas do restaurante: confirmar reservas, lembrar aniversários, recuperar clientes inativos e responder leads sem depender de ação manual toda vez."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => openTemplate({})} disabled={demoMode}>Nova automação</Button>}
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        {flow.map((item, index) => {
          const Icon = item.icon;
          return (
            <Card key={item.title}>
              <div className="mb-4 flex items-center justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-neon/10 text-neon">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-black text-neon">0{index + 1}</span>
              </div>
              <h2 className="font-black text-white">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{item.text}</p>
            </Card>
          );
        })}
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Card>
          <Workflow className="h-5 w-5 text-neon" />
          <p className="mt-4 text-3xl font-black text-white">{automations.length}</p>
          <p className="text-sm text-muted">Automações criadas</p>
        </Card>
        <Card>
          <CheckCircle2 className="h-5 w-5 text-neon" />
          <p className="mt-4 text-3xl font-black text-white">{activeCount}</p>
          <p className="text-sm text-muted">Rodando agora</p>
        </Card>
        <Card>
          <BellRing className="h-5 w-5 text-neon" />
          <p className="mt-4 text-3xl font-black text-white">{pausedCount}</p>
          <p className="text-sm text-muted">Pausadas</p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-black text-white">Automações do restaurante</h2>
                <p className="mt-1 text-sm text-muted">Cada card mostra o disparo, o público, a ação e o resultado esperado.</p>
              </div>
            </div>
            <div className="space-y-3">
              {automations.map((automation) => (
                <div key={automation.id} className="rounded-2xl border border-line bg-white/[0.04] p-4">
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="font-black text-white">{automation.title}</h3>
                        <StatusBadge status={automation.status} />
                      </div>
                      <p className="text-sm leading-6 text-muted">{automation.impact}</p>
                    </div>
                    <Button
                      variant="secondary"
                      icon={<Power className="h-4 w-4" />}
                      disabled={demoMode || updateStatus.isPending}
                      onClick={() =>
                        updateStatus.mutate({
                          id: automation.id,
                          status: automation.status === 'active' ? 'paused' : 'active',
                        })
                      }
                    >
                      {automation.status === 'active' ? 'Pausar' : 'Ativar'}
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-line bg-black/20 p-3">
                      <p className="text-xs font-bold uppercase text-muted">Quando dispara</p>
                      <p className="mt-2 text-sm font-semibold text-slate-100">{automation.trigger}</p>
                    </div>
                    <div className="rounded-2xl border border-line bg-black/20 p-3">
                      <p className="text-xs font-bold uppercase text-muted">Quem recebe</p>
                      <p className="mt-2 text-sm font-semibold text-slate-100">{automation.audience || 'Público configurado'}</p>
                    </div>
                    <div className="rounded-2xl border border-line bg-black/20 p-3">
                      <p className="text-xs font-bold uppercase text-muted">O que faz</p>
                      <p className="mt-2 text-sm font-semibold text-slate-100">{automation.action || `Envia pelo canal ${automation.channel}`}</p>
                    </div>
                  </div>
                  {automation.message ? (
                    <div className="mt-3 rounded-2xl border border-neon/20 bg-neon/10 p-3">
                      <p className="text-xs font-bold uppercase text-sky-100">Mensagem</p>
                      <p className="mt-2 text-sm leading-6 text-slate-100">{automation.message}</p>
                    </div>
                  ) : null}
                </div>
              ))}
              {!automations.length ? (
                <div className="rounded-2xl border border-dashed border-neon/30 bg-neon/10 p-5">
                  <p className="font-black text-white">Nenhuma automação criada ainda.</p>
                  <p className="mt-2 text-sm leading-6 text-sky-100">
                    Escolha uma receita pronta ao lado. Depois ela aparece aqui com botão para pausar ou ativar.
                  </p>
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        <Card>
          <div className="mb-4">
            <h2 className="font-black text-white">Receitas prontas</h2>
            <p className="mt-1 text-sm text-muted">Modelos de automação usados no dia a dia de restaurante.</p>
          </div>
          <div className="space-y-3">
            {recipes.map((item) => (
              <div key={item.name} className="rounded-2xl border border-line bg-white/[0.04] p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-white">{item.name}</h3>
                    <p className="mt-1 text-sm text-muted">{item.impact}</p>
                  </div>
                  <Activity className="h-5 w-5 shrink-0 text-neon" />
                </div>
                <div className="space-y-2 text-sm">
                  <p className="text-slate-300"><span className="font-bold text-white">Dispara:</span> {item.trigger_type}</p>
                  <p className="text-slate-300"><span className="font-bold text-white">Faz:</span> {item.action}</p>
                  <p className="text-slate-300"><span className="font-bold text-white">Mede:</span> {item.metric}</p>
                </div>
                <Button className="mt-4 w-full" variant="secondary" onClick={() => openTemplate(item)} disabled={demoMode}>
                  Usar receita
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {modalOpen ? <AutomationModal initial={template} onClose={() => setModalOpen(false)} /> : null}
    </div>
  );
};
