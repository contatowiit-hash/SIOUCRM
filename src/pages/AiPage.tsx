import { Bot, Clock3, CreditCard, FileText, Save, ShoppingBag, Upload } from 'lucide-react';
import { ChangeEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { useDemoMode } from '../hooks/useDemoMode';
import { api, type AiSettings } from '../lib/api';
import { useAuth } from '../providers/AuthProvider';

const defaultSettings: AiSettings = {
  ai_name: 'Ana',
  avatar_url: null,
  ai_color: '#00AFFF',
  voice_tone: 'casual',
  behavior_instructions: 'Seja simpatica, responda sempre em portugues e ajude o cliente a fazer o pedido.',
  menu_text: '',
  menu_pdf_name: '',
  menu_pdf_data: null,
  greeting_message: 'Oi! Eu sou a Ana, assistente virtual do restaurante. Como posso ajudar?',
  after_hours_message: 'Estamos fora do horario de atendimento. Assim que voltarmos, te respondemos por aqui.',
  active_start_time: '09:00',
  active_end_time: '22:00',
  normal_delivery_time: '30 a 40 min',
  peak_days: [],
  peak_start_time: '18:00',
  peak_end_time: '21:00',
  peak_delivery_time: '50 a 70 min',
  confirm_address: true,
  ask_payment_method: true,
  accepted_payment_methods: ['pix', 'cartao', 'dinheiro'],
  delivery_fee: 'R$5 ate 3km',
  served_neighborhoods: '',
  minimum_order: 0,
  local_pickup: true,
  auto_offer_addons: false,
  upsell_categories: [],
  offer_combos: false,
  upsell_phrase: '',
  active_coupon: '',
  recover_inactive_customer: false,
  post_sale_message: '',
  do_not_invent_products: true,
  do_not_discount_without_permission: true,
  do_not_promise_impossible_delivery: true,
  do_not_reply_outside_restaurant: true,
  max_discount_percent: 0,
  forbidden_words: [],
  whatsapp_status: 'disconnected',
  auto_replies_enabled: true,
  temporarily_paused: false,
  transfer_to_human: false,
};

const planLevel: Record<string, number> = {
  free: 0,
  plus: 1,
  starter: 1,
  pro: 2,
  premium: 3,
  lifetime: 3,
  founder_lifetime: 3,
};

const weekDays = [
  ['seg', 'Seg'],
  ['ter', 'Ter'],
  ['qua', 'Qua'],
  ['qui', 'Qui'],
  ['sex', 'Sex'],
  ['sab', 'Sab'],
  ['dom', 'Dom'],
] as const;

const paymentMethods = [
  ['pix', 'Pix'],
  ['cartao', 'Cartao'],
  ['dinheiro', 'Dinheiro'],
] as const;

const Section = ({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) => (
  <Card className="border-neon/18 bg-[#070B14]/92">
    <h2 className="mb-5 flex items-center gap-3 text-lg font-black text-white">
      <span className="grid h-10 w-10 place-items-center rounded-xl border border-neon/25 bg-neon/10 text-neon">{icon}</span>
      {title}
    </h2>
    <div className="space-y-5">{children}</div>
  </Card>
);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block">
    <span className="mb-2 block text-sm font-bold text-slate-200">{label}</span>
    {children}
  </label>
);

const TextInput = ({ value, onChange, type = 'text', placeholder, disabled = false }: { value: string | number; onChange: (value: string) => void; type?: string; placeholder?: string; disabled?: boolean }) => (
  <input className="form-field h-11 bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-70" type={type} value={value} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
);

const TextArea = ({ value, onChange, placeholder, large = false, disabled = false }: { value: string; onChange: (value: string) => void; placeholder?: string; large?: boolean; disabled?: boolean }) => (
  <textarea
    className={`form-field resize-none bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-70 ${large ? 'h-52' : 'h-28'}`}
    value={value}
    placeholder={placeholder}
    disabled={disabled}
    onChange={(event) => onChange(event.target.value)}
  />
);

const Toggle = ({ checked, onChange, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) => (
  <button
    type="button"
    aria-pressed={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-8 w-14 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60 ${checked ? 'border-neon/40 bg-neon/40' : 'border-white/15 bg-white/[0.08]'}`}
  >
    <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${checked ? 'left-7' : 'left-1'}`} />
  </button>
);

const ToggleRow = ({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) => (
  <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-white/[0.035] p-4">
    <span className="text-sm font-bold text-slate-100">{label}</span>
    <Toggle checked={checked} onChange={onChange} disabled={disabled} />
  </div>
);

const CheckboxPill = ({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`rounded-xl border px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
      checked ? 'border-neon/50 bg-neon/15 text-white' : 'border-line bg-white/[0.035] text-slate-300 hover:bg-white/[0.07]'
    }`}
  >
    {label}
  </button>
);

export const AiPage = () => {
  const { restaurant, apiUser } = useAuth();
  const demoMode = useDemoMode();
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const [settings, setSettings] = useState<AiSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [menuProcessed, setMenuProcessed] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const currentPlan = demoMode ? 'premium' : apiUser?.is_dev ? 'founder_lifetime' : restaurant?.plan || 'free';
  const hasProAccess = (planLevel[currentPlan] ?? 0) >= planLevel.pro;

  useEffect(() => {
    let active = true;

    if (demoMode) {
      setSettings(defaultSettings);
      setLoading(false);
      return;
    }

    if (!hasProAccess) {
      setLoading(false);
      return;
    }

    api
      .aiSettings()
      .then((result) => {
        if (active) {
          setSettings({ ...defaultSettings, ...result.data });
          setMenuProcessed(Boolean(result.menu_pdf_processed || result.data.menu_text.trim()));
        }
      })
      .catch((error) => {
        if (active) setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Nao foi possivel carregar as configuracoes.' });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [demoMode, hasProAccess]);

  const update = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const toggleArray = <T extends string>(key: keyof AiSettings, value: T) => {
    const current = settings[key] as T[];
    update(key as keyof AiSettings, (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]) as never);
  };

  const handlePdfUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setMessage({ type: 'error', text: 'Envie apenas arquivos PDF.' });
      return;
    }
    if (file.size > 6_000_000) {
      setMessage({ type: 'error', text: 'O PDF é muito grande. Envie um arquivo de até 6 MB.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      update('menu_pdf_name', file.name);
      update('menu_pdf_data', String(reader.result));
      setMessage({ type: 'success', text: 'PDF selecionado. Clique em Salvar para o SIOU ler o cardápio.' });
    };
    reader.readAsDataURL(file);
  };

  const saveSettings = async () => {
    if (demoMode) {
      setMessage({ type: 'error', text: 'Demonstração somente para visualização.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const result = await api.saveAiSettings(settings);
      setSettings({ ...defaultSettings, ...result.data });
      setMenuProcessed(Boolean(result.menu_pdf_processed || result.data.menu_text.trim()));
      setMessage({
        type: 'success',
        text: result.menu_pdf_processed
          ? result.menu_pdf_product_count
            ? `Cardápio lido com sucesso. ${result.menu_pdf_product_count} produtos encontrados.`
            : 'Cardápio lido e transformado em texto com sucesso.'
          : 'Configurações salvas com sucesso.',
      });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Nao foi possivel salvar agora.' });
    } finally {
      setSaving(false);
    }
  };

  if (!hasProAccess) {
    return (
      <div>
        <PageHeader title="Configurar minha IA" description="Configure a IA de atendimento a partir do plano Pro." />
        <Card className="border-neon/25 bg-neon/10">
          <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="text-2xl font-black text-white">IA disponivel no Pro</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">Suba para Pro para configurar personalidade, cardapio, horarios e pedidos.</p>
            </div>
            <Link to="/app/planos">
              <Button icon={<CreditCard className="h-4 w-4" />}>Ver planos</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <div className="-mx-4 mb-6 border-b border-line bg-ink/90 px-4 py-4 md:-mx-6 md:px-6">
        <PageHeader
          title="Configurar minha IA"
          description="Essas informacoes viram o contexto que a IA usa para atender clientes no WhatsApp."
          actions={
            <Button icon={<Save className="h-4 w-4" />} onClick={saveSettings} disabled={demoMode || saving || loading}>
              {saving && settings.menu_pdf_data ? 'Lendo PDF...' : saving ? 'Salvando...' : 'Salvar'}
            </Button>
          }
        />
        {message ? (
          <div
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
              message.type === 'success' ? 'border-neon/30 bg-neon/10 text-sky-100' : 'border-rose-400/30 bg-rose-500/10 text-rose-100'
            }`}
          >
            {message.text}
          </div>
        ) : null}
      </div>

      {loading ? (
        <Card>
          <p className="text-sm font-semibold text-muted">Carregando configuracoes...</p>
        </Card>
      ) : (
        <div className="grid gap-5">
          <Section icon={<Bot className="h-5 w-5" />} title="Personalidade da IA">
            <ToggleRow label="Ativar IA no WhatsApp" checked={settings.auto_replies_enabled} onChange={(value) => update('auto_replies_enabled', value)} disabled={demoMode} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome da IA">
                <TextInput value={settings.ai_name} onChange={(value) => update('ai_name', value)} placeholder="Ana" disabled={demoMode} />
              </Field>
              <Field label="Tom de voz">
                <select className="form-field h-11 bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-70" value={settings.voice_tone} disabled={demoMode} onChange={(event) => update('voice_tone', event.target.value as AiSettings['voice_tone'])}>
                  <option value="formal">Formal</option>
                  <option value="casual">Casual</option>
                  <option value="animado">Animado</option>
                </select>
              </Field>
            </div>
            <Field label="Como a IA deve se comportar">
              <TextArea
                large
                value={settings.behavior_instructions}
                onChange={(value) => update('behavior_instructions', value)}
                disabled={demoMode}
                placeholder={'Ex: Seja simpatica, responda sempre em portugues,\nnao prometa entregas em menos de 30 minutos,\nofereca sobremesas quando o cliente pedir pizza...'}
              />
            </Field>
          </Section>

          <Section icon={<FileText className="h-5 w-5" />} title="Cardapio">
            <Field label="Cardapio em texto livre">
              <TextArea
                large
                value={settings.menu_text}
                onChange={(value) => update('menu_text', value)}
                disabled={demoMode}
                placeholder={'Cole aqui seu cardapio completo com produtos e precos.\nEx:\nPizza Margherita - R$35\nPizza Calabresa - R$38\nRefrigerante lata - R$6'}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <input ref={pdfInputRef} className="hidden" type="file" accept="application/pdf,.pdf" disabled={demoMode} onChange={handlePdfUpload} />
              <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => pdfInputRef.current?.click()} disabled={demoMode}>
                Upload PDF do cardapio
              </Button>
              <span className="text-sm font-semibold text-slate-300">
                {settings.menu_pdf_name ? `Arquivo: ${settings.menu_pdf_name}` : 'Nenhum PDF enviado'}
              </span>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              Ao salvar, o SIOU lê o PDF e transforma os produtos e preços em texto para a IA responder no WhatsApp.
            </p>
            {settings.menu_pdf_name ? (
              <p className={`text-sm font-bold ${menuProcessed ? 'text-emerald-300' : 'text-rose-300'}`}>
                {menuProcessed ? 'Cardápio lido e disponível para a IA.' : 'Este PDF ainda não foi lido. Envie o arquivo novamente e clique em Salvar.'}
              </p>
            ) : null}
          </Section>

          <Section icon={<Clock3 className="h-5 w-5" />} title="Horarios">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="IA ativa a partir de">
                <TextInput type="time" value={settings.active_start_time} onChange={(value) => update('active_start_time', value)} disabled={demoMode} />
              </Field>
              <Field label="IA ativa ate">
                <TextInput type="time" value={settings.active_end_time} onChange={(value) => update('active_end_time', value)} disabled={demoMode} />
              </Field>
              <Field label="Tempo de entrega horario normal">
                <TextInput value={settings.normal_delivery_time} onChange={(value) => update('normal_delivery_time', value)} placeholder="30 a 40 min" disabled={demoMode} />
              </Field>
              <Field label="Faixa de tempo no pico">
                <TextInput value={settings.peak_delivery_time} onChange={(value) => update('peak_delivery_time', value)} placeholder="50 a 70 min" disabled={demoMode} />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Dias da semana de pico">
                <div className="flex flex-wrap gap-2">
                  {weekDays.map(([value, label]) => (
                    <CheckboxPill key={value} label={label} checked={settings.peak_days.includes(value)} onChange={() => toggleArray('peak_days', value)} disabled={demoMode} />
                  ))}
                </div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Horario de pico inicio">
                  <TextInput type="time" value={settings.peak_start_time} onChange={(value) => update('peak_start_time', value)} disabled={demoMode} />
                </Field>
                <Field label="Horario de pico fim">
                  <TextInput type="time" value={settings.peak_end_time} onChange={(value) => update('peak_end_time', value)} disabled={demoMode} />
                </Field>
              </div>
            </div>
          </Section>

          <Section icon={<ShoppingBag className="h-5 w-5" />} title="Pedidos">
            <div className="grid gap-3 md:grid-cols-2">
              <ToggleRow label="Confirmar endereco antes de fechar pedido" checked={settings.confirm_address} onChange={(value) => update('confirm_address', value)} disabled={demoMode} />
              <ToggleRow label="Perguntar forma de pagamento" checked={settings.ask_payment_method} onChange={(value) => update('ask_payment_method', value)} disabled={demoMode} />
              <ToggleRow label="Retirada no local" checked={settings.local_pickup} onChange={(value) => update('local_pickup', value)} disabled={demoMode} />
            </div>
            <Field label="Formas de pagamento aceitas">
              <div className="flex flex-wrap gap-2">
                {paymentMethods.map(([value, label]) => (
                  <CheckboxPill key={value} label={label} checked={settings.accepted_payment_methods.includes(value)} onChange={() => toggleArray('accepted_payment_methods', value)} disabled={demoMode} />
                ))}
              </div>
            </Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Taxa de entrega">
                <TextInput value={settings.delivery_fee} onChange={(value) => update('delivery_fee', value)} placeholder="R$5 ate 3km" disabled={demoMode} />
              </Field>
              <Field label="Pedido minimo em R$">
                <TextInput type="number" value={settings.minimum_order} onChange={(value) => update('minimum_order', Number(value))} disabled={demoMode} />
              </Field>
              <Field label="Bairros atendidos">
                <TextInput value={settings.served_neighborhoods} onChange={(value) => update('served_neighborhoods', value)} placeholder="Centro, Savassi, Zona Sul..." disabled={demoMode} />
              </Field>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
};
