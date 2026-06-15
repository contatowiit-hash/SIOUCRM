// ─────────────────────────────────────────────────────────────────────────────
// ARQUIVO: adicionar no seu frontend React
// Caminho sugerido: src/components/WhatsAppConnect.tsx
// ─────────────────────────────────────────────────────────────────────────────

import { Smartphone, Wifi, WifiOff, Loader2, RefreshCw, LogOut } from "lucide-react";
import { useWhatsAppSession } from "../hooks/useWhatsAppSession"; // ajuste o caminho

interface WhatsAppConnectProps {
  tenantId: string;
  onConnected?: (phoneNumber: string) => void;
}

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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
          <Smartphone className="h-5 w-5 text-green-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">WhatsApp</h3>
          <p className="text-xs text-white/50">Conecte seu número para atender clientes</p>
        </div>

        {/* Badge de status */}
        <div className="ml-auto">
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Conteúdo por estado */}

      {/* Idle — botão para iniciar */}
      {status === "idle" && (
        <div className="flex flex-col items-center gap-4 py-4">
          <p className="text-center text-sm text-white/60">
            Nenhum número conectado. Clique para gerar o QR Code.
          </p>
          <button
            onClick={connect}
            className="flex items-center gap-2 rounded-xl bg-green-500 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-green-400 active:scale-95"
          >
            <Wifi className="h-4 w-4" />
            Conectar WhatsApp
          </button>
        </div>
      )}

      {/* Conectando — spinner */}
      {isLoading && !hasQr && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="h-8 w-8 animate-spin text-green-400" />
          <p className="text-sm text-white/60">Iniciando conexão...</p>
        </div>
      )}

      {/* QR Code pronto para escanear */}
      {hasQr && qrCode && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-center text-sm text-white/70">
            Abra o WhatsApp no celular →{" "}
            <span className="font-medium text-white">Dispositivos conectados</span> → Conectar
            dispositivo
          </p>

          <div className="rounded-2xl bg-white p-3 shadow-lg">
            <img
              src={qrCode}
              alt="QR Code WhatsApp"
              className="h-52 w-52"
            />
          </div>

          <p className="text-xs text-white/40">O QR Code expira em 60 segundos</p>

          <button
            onClick={connect}
            className="flex items-center gap-1.5 text-xs text-white/50 transition-colors hover:text-white"
          >
            <RefreshCw className="h-3 w-3" />
            Gerar novo QR Code
          </button>
        </div>
      )}

      {/* Conectado */}
      {isConnected && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-xl bg-green-500/10 px-4 py-3">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
            <div>
              <p className="text-sm font-medium text-green-400">+{phoneNumber}</p>
              {connectedAt && (
                <p className="text-xs text-white/40">
                  Conectado em {new Date(connectedAt).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={disconnect}
            className="flex items-center justify-center gap-2 rounded-xl border border-red-500/20 px-4 py-2 text-sm text-red-400 transition-all hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" />
            Desconectar
          </button>
        </div>
      )}

      {/* Desconectado / erro */}
      {(status === "disconnected" || status === "error") && (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <WifiOff className="h-4 w-4" />
            {error ?? "Sessão encerrada"}
          </div>
          <button
            onClick={connect}
            className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2 text-sm text-white transition-all hover:bg-white/20"
          >
            <RefreshCw className="h-4 w-4" />
            Reconectar
          </button>
        </div>
      )}
    </div>
  );
}

// ── Badge de status ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; className: string }> = {
    idle:         { label: "Desconectado", className: "bg-white/10 text-white/50" },
    connecting:   { label: "Conectando",   className: "bg-yellow-500/20 text-yellow-400" },
    qr_ready:     { label: "Aguardando scan", className: "bg-blue-500/20 text-blue-400" },
    connected:    { label: "Conectado",    className: "bg-green-500/20 text-green-400" },
    disconnected: { label: "Desconectado", className: "bg-red-500/20 text-red-400" },
    error:        { label: "Erro",         className: "bg-red-500/20 text-red-400" },
  };

  const config = configs[status] ?? configs.idle;

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
