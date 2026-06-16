import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clipboard,
  CreditCard,
  KeyRound,
  LoaderCircle,
  Plug,
  ShieldCheck,
  Unplug,
  X,
} from 'lucide-react';
import { api, type PaymentIntegrationStatus, type PdvIntegrationStatus } from '../lib/api';
import { Button } from './ui/Button';

const statusLabel = {
  not_configured: 'Cadastro necessário',
  connected: 'Conectado',
  disconnected: 'Não conectado',
  error: 'Verifique sua credencial',
} as const;

const ownCredentialProviders = ['mercado_pago', 'pagbank', 'cielo', 'getnet'] as const;
type OwnCredentialProvider = (typeof ownCredentialProviders)[number];

type CredentialField = {
  key: string;
  label: string;
  placeholder: string;
};

const credentialGuides: Record<OwnCredentialProvider, { description: string; path: string; fields: CredentialField[] }> = {
  mercado_pago: {
    description: 'Use os códigos da conta Mercado Pago que recebe seus pagamentos.',
    path: 'Mercado Pago Developers → Suas integrações → Credenciais de produção',
    fields: [
      { key: 'access_token', label: 'Código de acesso', placeholder: 'APP_USR-...' },
      { key: 'webhook_secret', label: 'Código de confirmação das notificações', placeholder: 'Cole o código das notificações' },
    ],
  },
  pagbank: {
    description: 'Use o código de integração da conta PagBank do restaurante.',
    path: 'Minha Conta PagBank → Integrações → API',
    fields: [{ key: 'access_token', label: 'Código de integração', placeholder: 'Cole o código do PagBank' }],
  },
  cielo: {
    description: 'Use os dois códigos da conta Cielo do restaurante.',
    path: 'Cielo e-commerce → API → Credenciais',
    fields: [
      { key: 'merchant_id', label: 'Identificação da loja', placeholder: 'MerchantId' },
      { key: 'merchant_key', label: 'Código de acesso', placeholder: 'MerchantKey' },
    ],
  },
  getnet: {
    description: 'Use os códigos disponíveis no painel Getnet do restaurante.',
    path: 'Painel Getnet → Configurações → Identificação da API',
    fields: [
      { key: 'seller_id', label: 'Identificação da loja', placeholder: 'Seller ID' },
      { key: 'client_id', label: 'Identificação da integração', placeholder: 'Client ID' },
      { key: 'client_secret', label: 'Código secreto', placeholder: 'Client Secret' },
    ],
  },
};

const paymentCatalog: PaymentIntegrationStatus[] = [
  { provider: 'mercado_pago', name: 'Mercado Pago', status: 'not_configured', available: false, message: null },
  { provider: 'pagbank', name: 'PagBank', status: 'not_configured', available: false, message: null },
  { provider: 'cielo', name: 'Cielo', status: 'not_configured', available: false, message: null },
  { provider: 'getnet', name: 'Getnet', status: 'not_configured', available: false, message: null },
  { provider: 'infinitepay', name: 'InfinitePay', status: 'disconnected', available: true, message: null },
  { provider: 'stone', name: 'Stone', status: 'not_configured', available: false, message: null },
  { provider: 'rede', name: 'Rede', status: 'not_configured', available: false, message: null },
  { provider: 'ton', name: 'Ton', status: 'not_configured', available: false, message: null },
  { provider: 'safrapay', name: 'SafraPay', status: 'not_configured', available: false, message: null },
];

const pdvCatalog: PdvIntegrationStatus[] = [
  { provider: 'saipos', name: 'Saipos', status: 'disconnected', webhook_url: null },
  { provider: 'goomer', name: 'Goomer', status: 'disconnected', webhook_url: null },
  { provider: 'anotaai', name: 'Anota AI', status: 'disconnected', webhook_url: null },
  { provider: 'sischef', name: 'Sischef', status: 'disconnected', webhook_url: null },
  { provider: 'consumer', name: 'Consumer', status: 'disconnected', webhook_url: null },
];

const isOwnCredentialProvider = (provider: string): provider is OwnCredentialProvider =>
  ownCredentialProviders.includes(provider as OwnCredentialProvider);

const CopyWebhook = ({ url }: { url: string }) => (
  <button
    type="button"
    className="flex w-full items-center gap-2 rounded-lg border border-line bg-black/20 px-3 py-2 text-left text-xs text-slate-300 hover:border-neon/40"
    onClick={() => navigator.clipboard.writeText(url)}
    title="Copiar link de confirmação"
  >
    <Clipboard className="h-4 w-4 shrink-0 text-neon" />
    <span className="truncate">Copiar link de confirmação</span>
  </button>
);

const CredentialModal = ({
  payment,
  busy,
  onClose,
  onSave,
}: {
  payment: PaymentIntegrationStatus;
  busy: boolean;
  onClose: () => void;
  onSave: (values: Record<string, string>) => Promise<void>;
}) => {
  const provider = payment.provider as OwnCredentialProvider;
  const guide = credentialGuides[provider];
  const [values, setValues] = useState<Record<string, string>>({});
  const complete = guide.fields.every((field) => (values[field.key]?.trim().length ?? 0) >= 4);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-[#07101e] p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-neon">Pagamento automático</p>
            <h3 className="mt-1 text-xl font-black text-white">Conectar {payment.name}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{guide.description}</p>
          </div>
          <Button variant="ghost" icon={<X className="h-4 w-4" />} onClick={onClose} aria-label="Fechar" />
        </div>

        <div className="my-5 rounded-lg border border-sky-300/20 bg-sky-400/10 px-4 py-3">
          <p className="text-xs font-bold uppercase text-sky-200">Onde encontrar</p>
          <p className="mt-1 text-sm text-sky-100">{guide.path}</p>
        </div>

        <div className="space-y-4">
          {guide.fields.map((field) => (
            <label key={field.key} className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-200">{field.label}</span>
              <input
                className="form-field"
                type="password"
                autoComplete="new-password"
                placeholder={field.placeholder}
                value={values[field.key] ?? ''}
                onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
              />
            </label>
          ))}
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Os códigos ficam protegidos e não voltam a aparecer depois de salvar.</p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            icon={busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            disabled={busy || !complete}
            onClick={() => onSave(values)}
          >
            Salvar conexão
          </Button>
        </div>
      </div>
    </div>
  );
};

export const IntegrationsPanel = ({ canManage, disabled }: { canManage: boolean; disabled: boolean }) => {
  const [payments, setPayments] = useState<PaymentIntegrationStatus[]>(paymentCatalog);
  const [pdvs, setPdvs] = useState<PdvIntegrationStatus[]>(pdvCatalog);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [goomerCredentials, setGoomerCredentials] = useState<Record<string, string>>({});
  const [paymentInputs, setPaymentInputs] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<PaymentIntegrationStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (disabled) return;
    const [paymentResult, pdvResult] = await Promise.all([api.paymentIntegrations(), api.pdvIntegrations()]);
    setPayments(paymentResult.data.length ? paymentResult.data : paymentCatalog);
    setPdvs(pdvResult.data.length ? pdvResult.data : pdvCatalog);
  }, [disabled]);

  useEffect(() => {
    load().catch(() => setMessage('Não foi possível carregar as conexões agora.'));
  }, [load]);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir.');
    } finally {
      setBusy(null);
    }
  };

  const primaryPayments = payments.filter((payment) => isOwnCredentialProvider(payment.provider) || payment.provider === 'infinitepay');
  const futurePayments = payments.filter((payment) => !primaryPayments.includes(payment));
  const goomerReady =
    (goomerCredentials.client_id?.trim().length ?? 0) >= 2 &&
    (goomerCredentials.client_secret?.trim().length ?? 0) >= 8;

  return (
    <div className="space-y-7">
      {message ? <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{message}</div> : null}

      <section>
        <div className="mb-4">
          <h3 className="font-black text-white">Receber pagamentos</h3>
          <p className="mt-1 text-sm text-muted">Conecte a conta que seu restaurante já usa. O dinheiro vai direto para ela.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {primaryPayments.map((payment) => (
            <div key={payment.provider} className="rounded-lg border border-line bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-400/10 text-neon">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-white">{payment.name}</p>
                    <p className={`text-xs ${payment.status === 'connected' ? 'text-emerald-300' : payment.status === 'error' ? 'text-amber-200' : 'text-muted'}`}>
                      {statusLabel[payment.status]}
                    </p>
                  </div>
                </div>
                {payment.status === 'connected' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" /> : null}
              </div>

              <p className="mt-3 min-h-10 text-xs leading-5 text-muted">
                {payment.message ?? (isOwnCredentialProvider(payment.provider) ? credentialGuides[payment.provider].description : 'Receba por link de pagamento da sua conta.')}
              </p>

              {payment.webhook_url ? <div className="mt-3"><CopyWebhook url={payment.webhook_url} /></div> : null}

              {canManage && !disabled ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {isOwnCredentialProvider(payment.provider) ? (
                    <>
                      <Button
                        className="flex-1"
                        variant={payment.status === 'connected' ? 'secondary' : 'primary'}
                        icon={<KeyRound className="h-4 w-4" />}
                        disabled={Boolean(busy) || !payment.available}
                        onClick={() => setEditing(payment)}
                      >
                        {payment.status === 'connected' ? 'Trocar códigos' : 'Configurar'}
                      </Button>
                      {payment.status === 'connected' || payment.status === 'error' ? (
                        <Button
                          variant="secondary"
                          disabled={Boolean(busy)}
                          icon={busy === `${payment.provider}-test` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                          onClick={() => run(`${payment.provider}-test`, async () => {
                            await api.testPayment(payment.provider);
                            setMessage(`${payment.name} confirmada com sucesso.`);
                          })}
                        >
                          Testar
                        </Button>
                      ) : null}
                      {payment.status === 'connected' ? (
                        <Button
                          variant="secondary"
                          disabled={Boolean(busy)}
                          icon={busy === `${payment.provider}-receipt` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          onClick={() => run(`${payment.provider}-receipt`, async () => {
                            const result = await api.testPaymentReceipt(payment.provider);
                            setMessage(`Recebimento testado: ${result.data.checks.join(', ')}.`);
                          })}
                        >
                          Testar recebimento
                        </Button>
                      ) : null}
                    </>
                  ) : payment.status === 'connected' ? null : (
                    <div className="w-full space-y-2">
                      <input
                        className="form-field"
                        value={paymentInputs[payment.provider] ?? ''}
                        onChange={(event) => setPaymentInputs((current) => ({ ...current, [payment.provider]: event.target.value }))}
                        placeholder="Identificador da sua InfinitePay"
                        autoComplete="off"
                      />
                      <Button
                        className="w-full"
                        disabled={Boolean(busy) || (paymentInputs[payment.provider]?.trim().length ?? 0) < 2}
                        onClick={() => run(payment.provider, async () => {
                          await api.connectPayment(payment.provider, { handle: paymentInputs[payment.provider] });
                          setPaymentInputs((current) => ({ ...current, [payment.provider]: '' }));
                          setMessage('InfinitePay conectada.');
                        })}
                      >
                        Conectar
                      </Button>
                    </div>
                  )}

                  {payment.status === 'connected' ? (
                    <Button
                      variant="danger"
                      icon={<Unplug className="h-4 w-4" />}
                      disabled={Boolean(busy)}
                      onClick={() => run(`${payment.provider}-disconnect`, async () => {
                        await api.disconnectPayment(payment.provider);
                        setMessage(`${payment.name} desconectado.`);
                      })}
                    >
                      Desconectar
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <details className="mt-4 rounded-lg border border-line bg-white/[0.02] p-4">
          <summary className="cursor-pointer text-sm font-bold text-slate-200">Outras opções de pagamento</summary>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {futurePayments.map((payment) => (
              <div key={payment.provider} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-black/20 px-3 py-3">
                <div>
                  <p className="text-sm font-bold text-white">{payment.name}</p>
                  <p className="text-xs text-muted">{payment.message ?? statusLabel[payment.status]}</p>
                </div>
                <Button variant="secondary" disabled>Em breve</Button>
              </div>
            ))}
          </div>
        </details>
      </section>

      <section>
        <div className="mb-3">
          <h3 className="font-black text-white">Sistema de caixa</h3>
          <p className="mt-1 text-sm text-muted">Traga as vendas do seu caixa para o Syntra automaticamente.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {pdvs.map((pdv) => (
            <div key={pdv.provider} className="rounded-lg border border-line bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-white">{pdv.name}</p>
                  <p className="text-xs text-muted">{statusLabel[pdv.status]}</p>
                </div>
                {pdv.status === 'connected' ? <Check className="h-5 w-5 text-emerald-400" /> : null}
              </div>

              {pdv.webhook_url ? <div className="mb-3"><CopyWebhook url={pdv.webhook_url} /></div> : null}

              {canManage && !disabled ? (
                pdv.status === 'connected' ? (
                  <div className="flex flex-wrap gap-2">
                    {pdv.provider === 'goomer' ? (
                      <Button
                        className="flex-1"
                        variant="secondary"
                        disabled={Boolean(busy)}
                        icon={busy === `${pdv.provider}-test` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                        onClick={() => run(`${pdv.provider}-test`, async () => {
                          await api.testPdv(pdv.provider);
                          setMessage('Goomer confirmada com sucesso.');
                        })}
                      >
                        Testar conexao
                      </Button>
                    ) : null}
                    <Button
                      className="flex-1"
                      variant="danger"
                      disabled={Boolean(busy)}
                      onClick={() => run(pdv.provider, async () => { await api.disconnectPdv(pdv.provider); setMessage(`${pdv.name} desconectado.`); })}
                    >
                      Desconectar
                    </Button>
                  </div>
                ) : pdv.provider === 'goomer' ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-xs leading-5 text-sky-100">
                        Encontre esses dados na Goomer: Configuracoes &gt; Apps e Integracoes &gt; Adicionar integracao &gt; Open Delivery &gt; Gerar chave.
                    </div>
                    <input
                      className="form-field"
                      autoComplete="off"
                      placeholder="Client Id da Goomer"
                      value={goomerCredentials.client_id ?? ''}
                      onChange={(event) => setGoomerCredentials((current) => ({ ...current, client_id: event.target.value }))}
                    />
                    <input
                      className="form-field"
                      type="password"
                      autoComplete="new-password"
                      placeholder="Client Secret da Goomer"
                      value={goomerCredentials.client_secret ?? ''}
                      onChange={(event) => setGoomerCredentials((current) => ({ ...current, client_secret: event.target.value }))}
                    />
                    <Button
                      className="w-full"
                      disabled={Boolean(busy) || !goomerReady}
                      onClick={() => run(pdv.provider, async () => {
                        await api.connectPdv(pdv.provider, {
                          client_id: goomerCredentials.client_id,
                          client_secret: goomerCredentials.client_secret,
                        });
                        setGoomerCredentials({});
                        setMessage(`${pdv.name} conectado. Copie o link e cadastre na Goomer.`);
                      })}
                    >
                      Conectar Goomer
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      className="form-field"
                      type="password"
                      autoComplete="off"
                      placeholder={`Código enviado pelo suporte do ${pdv.name}`}
                      value={tokens[pdv.provider] ?? ''}
                      onChange={(event) => setTokens((current) => ({ ...current, [pdv.provider]: event.target.value }))}
                    />
                    <Button
                      className="w-full"
                      disabled={Boolean(busy) || (tokens[pdv.provider]?.trim().length ?? 0) < 8}
                      onClick={() => run(pdv.provider, async () => {
                        await api.connectPdv(pdv.provider, tokens[pdv.provider]);
                        setTokens((current) => ({ ...current, [pdv.provider]: '' }));
                        setMessage(`${pdv.name} conectado. Copie o link e envie ao suporte do seu caixa.`);
                      })}
                    >
                      Conectar
                    </Button>
                  </div>
                )
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {editing ? (
        <CredentialModal
          payment={editing}
          busy={busy === `${editing.provider}-save`}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            await run(`${editing.provider}-save`, async () => {
              await api.connectPayment(editing.provider, values);
              setMessage(`${editing.name} conectada. Agora use o botão Testar.`);
              setEditing(null);
            });
          }}
        />
      ) : null}
    </div>
  );
};
