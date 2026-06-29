import { zodResolver } from '@hookform/resolvers/zod';
import { BarChart3, Megaphone, Plus, Send, Target } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useDemoMode } from '../hooks/useDemoMode';
import { useCampaigns, useCreateCampaign, useSendCampaign } from '../hooks/useRestaurantData';
import { CampaignSchema, type CampaignInput } from '../schemas/modules';

const campaignTypes = [
  ['birthday', 'Aniversario'],
  ['inactive_customer', 'Cliente inativo'],
  ['promotion', 'Promocao'],
  ['weekend', 'Final de semana'],
  ['coupon', 'Cupom'],
  ['special_event', 'Evento especial'],
  ['post_sale', 'Pos-venda'],
  ['winback', 'Recuperacao'],
] as const;

const audienceFilters = [
  'Clientes inativos ha 30 dias',
  'Clientes VIP',
  'Clientes que fazem aniversario',
  'Clientes que pediram mais de X vezes',
  'Clientes por tag',
  'Clientes por ticket medio',
  'Clientes por ultima visita',
];

const CampaignModal = ({ onClose }: { onClose: () => void }) => {
  const createCampaign = useCreateCampaign();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CampaignInput>({
    resolver: zodResolver(CampaignSchema),
    defaultValues: {
      type: 'promotion',
      channel: 'whatsapp',
      audience: 'Clientes ativos',
      scheduled_at: '',
    },
  });

  const onSubmit = async (values: CampaignInput) => {
    setFormError(null);
    try {
      await createCampaign.mutateAsync({
        ...values,
        scheduled_at: values.scheduled_at ? new Date(values.scheduled_at).toISOString() : null,
      });
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Nao foi possivel salvar a campanha.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit(onSubmit)} className="glass-panel w-full max-w-2xl rounded-3xl p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-white">Nova campanha</h2>
            <p className="mt-1 text-sm text-muted">Crie a mensagem e depois envie com seguranca pelo WhatsApp.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-slate-300">
            Fechar
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Nome</span>
            <input className="form-field" {...register('name')} />
            {errors.name ? <p className="mt-2 text-xs text-rose-200">{errors.name.message}</p> : null}
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Tipo</span>
            <select className="form-field" {...register('type')}>
              {campaignTypes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Publico</span>
            <input className="form-field" {...register('audience')} />
            {errors.audience ? <p className="mt-2 text-xs text-rose-200">{errors.audience.message}</p> : null}
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Canal</span>
            <select className="form-field" {...register('channel')}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Agendar envio</span>
            <input className="form-field" type="datetime-local" {...register('scheduled_at')} />
          </label>
        </div>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-semibold text-slate-200">Mensagem</span>
          <textarea className="form-field min-h-28 resize-none" {...register('message')} />
          {errors.message ? <p className="mt-2 text-xs text-rose-200">{errors.message.message}</p> : null}
        </label>
        {formError ? <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{formError}</div> : null}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting || createCampaign.isPending}>
            Salvar campanha
          </Button>
        </div>
      </form>
    </div>
  );
};

export const CampaignsPage = () => {
  const demoMode = useDemoMode();
  const { data: campaigns = [] } = useCampaigns();
  const sendCampaign = useSendCampaign();
  const [modalOpen, setModalOpen] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSendCampaign = async (id: string) => {
    setNotice(null);
    try {
      const result = await sendCampaign.mutateAsync(id);
      const details = [result.skipped ? `${result.skipped} pulados por seguranca` : null, result.failed ? `${result.failed} falharam` : null]
        .filter(Boolean)
        .join(' - ');
      setNotice({
        type: 'success',
        message: details ? `Campanha enviada para ${result.sent} cliente(s). ${details}.` : `Campanha enviada para ${result.sent} cliente(s).`,
      });
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Nao foi possivel enviar a campanha agora.' });
    }
  };

  return (
    <div>
      <PageHeader
        title="Campanhas"
        description="Crie campanhas por WhatsApp e acompanhe os resultados."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)} disabled={demoMode}>
            Nova campanha
          </Button>
        }
      />

      {notice ? (
        <div
          className={`mb-4 rounded-2xl border p-4 text-sm font-semibold ${
            notice.type === 'success'
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
              : 'border-rose-400/30 bg-rose-500/10 text-rose-100'
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <div className="space-y-4">
          {campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black text-white">{campaign.name}</h2>
                    <StatusBadge status={campaign.status} />
                  </div>
                  <p className="text-sm leading-6 text-muted">{campaign.audience}</p>
                  <p className="mt-4 rounded-2xl border border-line bg-white/[0.04] p-4 text-sm leading-7 text-slate-200">
                    {campaign.message}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  icon={<Send className="h-4 w-4" />}
                  disabled={demoMode || sendCampaign.isPending || campaign.status === 'sending'}
                  onClick={() => handleSendCampaign(campaign.id)}
                >
                  Enviar agora
                </Button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-5">
                {[
                  ['Enviadas', campaign.sent_count],
                  ['Entregues', campaign.delivered_count],
                  ['Respondidas', campaign.replied_count],
                  ['Convertidas', campaign.converted_count],
                  ['Receita', `R$ ${campaign.estimated_revenue}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-line bg-white/[0.04] p-3">
                    <p className="text-xs text-muted">{label}</p>
                    <p className="mt-2 font-black text-white">{value}</p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
          {!campaigns.length ? (
            <Card>
              <p className="text-sm text-muted">Nenhuma campanha criada ainda.</p>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-4 flex items-center gap-2 font-black text-white">
              <Megaphone className="h-4 w-4 text-neon" />
              Tipos de campanha
            </h2>
            <div className="grid gap-2">
              {campaignTypes.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setModalOpen(true)}
                  disabled={demoMode}
                  className="rounded-xl border border-line bg-white/[0.04] px-3 py-2 text-left text-sm font-semibold text-slate-200 transition hover:border-neon/40 hover:bg-neon/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="mb-4 flex items-center gap-2 font-black text-white">
              <Target className="h-4 w-4 text-neon" />
              Filtros de publico
            </h2>
            <div className="space-y-2">
              {audienceFilters.map((filter) => (
                <label key={filter} className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.04] px-3 py-2 text-sm text-slate-200">
                  <input type="checkbox" className="h-4 w-4 accent-sky-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={demoMode} />
                  {filter}
                </label>
              ))}
            </div>
          </Card>
          <Card className="border-neon/30 bg-neon/10">
            <BarChart3 className="mb-4 h-6 w-6 text-neon" />
            <p className="text-sm leading-7 text-sky-100">
              Para proteger seu numero, o Syntra envia apenas dentro de limites seguros e respeita clientes que pediram para nao receber mensagens.
            </p>
          </Card>
        </div>
      </div>
      {modalOpen ? <CampaignModal onClose={() => setModalOpen(false)} /> : null}
    </div>
  );
};
