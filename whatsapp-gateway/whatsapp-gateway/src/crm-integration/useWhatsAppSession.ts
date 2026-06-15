// ─────────────────────────────────────────────────────────────────────────────
// ARQUIVO: adicionar no seu frontend React
// Caminho sugerido: src/hooks/useWhatsAppSession.ts
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";

type SessionStatus = "idle" | "connecting" | "qr_ready" | "connected" | "disconnected" | "error";

interface SessionState {
  status: SessionStatus;
  qrCode: string | null;       // base64 — coloca direto no <img src={qrCode} />
  phoneNumber: string | null;
  connectedAt: string | null;
  error: string | null;
}

interface UseWhatsAppSessionOptions {
  tenantId: string;
  gatewayUrl?: string;          // URL do gateway (ex: http://localhost:3001)

  pollingInterval?: number;     // ms entre polls de status (padrão: 3000)
  onConnected?: (phoneNumber: string) => void;
  onMessage?: (message: unknown) => void;
}

export function useWhatsAppSession({
  tenantId,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:3001",

  pollingInterval = 3_000,
  onConnected,
}: UseWhatsAppSessionOptions) {
  const [state, setState] = useState<SessionState>({
    status: "idle",
    qrCode: null,
    phoneNumber: null,
    connectedAt: null,
    error: null,
  });

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPolling = useRef(false);

  const headers = {
    "Content-Type": "application/json",

  };

  // ── Busca status atual da sessão ─────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${gatewayUrl}/sessions/${tenantId}`, { headers });

      if (res.status === 404) {
        setState((s) => ({ ...s, status: "idle" }));
        return;
      }

      const data = await res.json();

      setState({
        status: data.status,
        qrCode: data.qrCode,
        phoneNumber: data.phoneNumber,
        connectedAt: data.connectedAt,
        error: null,
      });

      // Para o polling quando conectar
      if (data.status === "connected") {
        stopPolling();
        onConnected?.(data.phoneNumber);
      }
    } catch {
      setState((s) => ({ ...s, error: "Erro ao buscar status da sessão" }));
    }
  }, [tenantId, gatewayUrl]);

  // ── Polling ──────────────────────────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (isPolling.current) return;
    isPolling.current = true;
    pollingRef.current = setInterval(fetchStatus, pollingInterval);
  }, [fetchStatus, pollingInterval]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    isPolling.current = false;
  }, []);

  // ── Conectar WhatsApp ────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    setState({ status: "connecting", qrCode: null, phoneNumber: null, connectedAt: null, error: null });

    try {
      await fetch(`${gatewayUrl}/sessions/${tenantId}`, {
        method: "POST",
        headers,
      });

      // Começa polling para acompanhar o QR Code e a conexão
      startPolling();
    } catch {
      setState((s) => ({ ...s, status: "error", error: "Não foi possível iniciar a sessão" }));
    }
  }, [tenantId, gatewayUrl]);

  // ── Desconectar ──────────────────────────────────────────────────────────

  const disconnect = useCallback(async () => {
    stopPolling();
    try {
      await fetch(`${gatewayUrl}/sessions/${tenantId}`, {
        method: "DELETE",
        headers,
      });
      setState({ status: "idle", qrCode: null, phoneNumber: null, connectedAt: null, error: null });
    } catch {
      setState((s) => ({ ...s, error: "Erro ao desconectar" }));
    }
  }, [tenantId, gatewayUrl]);

  // ── Enviar mensagem de texto ─────────────────────────────────────────────

  const sendText = useCallback(
    async (to: string, message: string): Promise<{ messageId: string }> => {
      const res = await fetch(`${gatewayUrl}/messages/text`, {
        method: "POST",
        headers,
        body: JSON.stringify({ tenantId, to, message }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erro ao enviar mensagem");
      }

      return res.json();
    },
    [tenantId, gatewayUrl]
  );

  // ── Busca status inicial ao montar ───────────────────────────────────────

  useEffect(() => {
    fetchStatus();
    return () => stopPolling();
  }, [tenantId]);

  return {
    ...state,
    connect,
    disconnect,
    sendText,
    isConnected: state.status === "connected",
    isLoading: state.status === "connecting",
    hasQr: state.status === "qr_ready" && !!state.qrCode,
  };
}
