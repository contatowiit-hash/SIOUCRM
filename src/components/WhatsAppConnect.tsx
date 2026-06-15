import { Loader2, LogOut, RefreshCw, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { useWhatsAppSession } from '../hooks/useWhatsAppSession';
import { cn } from '../lib/cn';

interface WhatsAppConnectProps {
  tenantId: string;
  onConnected?: (phoneNumber: string) => void;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  idle: { label: 'Desconectado', className: 'bg-white/10 text-white/60' },
  connecting: { label: 'Conectando', className: 'bg-amber-300/15 text-amber-100' },
  qr_ready: { label: 'Aguardando QR', className: 'bg-sky-400/15 text-sky-100' },
  connected: { label: 'Conectado', className: 'bg-emerald-400/15 text-emerald-100' },
  disconnected: { label: 'Desconectado', className: 'bg-rose-500/15 text-rose-100' },
  error: { label: 'Erro', className: 'bg-rose-500/15 text-rose-100' },
};

const GatewayStatusBadge = ({ status }: { status: string }) => {
  const config = statusLabels[status] ?? statusLabels.idle;
  return <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', config.className)}>{config.label}</span>;
};

export function WhatsAppConnect({ tenantId, onConnected }: WhatsAppConnectProps) {
  const {
    status,
    qrCode,
    phoneNumber,
    connectedAt,
    error,
    connect,
    disconnect,
    isConnected,
    isLoading,
    hasQr,
  } = useWhatsAppSession({ tenantId, onConnected });

  return (
    <div className="rounded-2xl border border-line bg-white/[0.04] p-4">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-200">
          <Smartphone className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-black text-white">WhatsApp Gateway</h3>
          <p className="text-sm text-muted">Conecte o número pelo QR Code do gateway.</p>
        </div>
        <div className="ml-auto">
          <GatewayStatusBadge status={status} />
        </div>
      </div>

      {status === 'idle' ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-black/15 p-5">
          <p className="text-center text-sm text-muted">Nenhum número conectado para este restaurante.</p>
          <button
            onClick={() => void connect()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-black text-white transition hover:bg-emerald-400"
          >
            <Wifi className="h-4 w-4" />
            Conectar WhatsApp
          </button>
        </div>
      ) : null}

      {isLoading && !hasQr ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-black/15 p-6">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-300" />
          <p className="text-sm text-muted">Iniciando conexao...</p>
        </div>
      ) : null}

      {hasQr && qrCode ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-center text-sm leading-6 text-slate-300">
            Abra o WhatsApp no celular, entre em dispositivos conectados e escaneie este QR Code.
          </p>
          <div className="rounded-2xl bg-white p-3 shadow-lg shadow-neon/10">
            <img src={qrCode} alt="QR Code WhatsApp" className="h-52 w-52" />
          </div>
          <button
            onClick={() => void connect()}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-300 transition hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Gerar novo QR Code
          </button>
        </div>
      ) : null}

      {isConnected ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4">
            <p className="text-sm font-black text-emerald-100">+{phoneNumber}</p>
            {connectedAt ? <p className="mt-1 text-xs text-emerald-100/70">Conectado em {new Date(connectedAt).toLocaleString('pt-BR')}</p> : null}
          </div>
          <button
            onClick={() => void disconnect()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/25 px-4 py-2 text-sm font-bold text-rose-100 transition hover:bg-rose-500/10"
          >
            <LogOut className="h-4 w-4" />
            Desconectar
          </button>
        </div>
      ) : null}

      {status === 'disconnected' || status === 'error' ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 p-5">
          <div className="flex max-w-2xl flex-col items-center gap-2 text-center">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-rose-100">
              <WifiOff className="h-4 w-4" />
              Gateway do WhatsApp offline
            </div>
            <p className="text-sm leading-6 text-rose-100/75">
              {error ?? 'Abra o serviço WhatsApp Gateway para gerar o QR Code.'}
            </p>
            <p className="text-xs leading-5 text-slate-400">
              O CRM continua funcionando. So a conexao com WhatsApp precisa do gateway aberto na porta 3001.
            </p>
          </div>
          <button
            onClick={() => void connect()}
            className="inline-flex items-center gap-2 rounded-xl border border-line px-5 py-2 text-sm font-bold text-white transition hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
        </div>
      ) : null}
    </div>
  );
}
