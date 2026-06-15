import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

type SessionStatus = 'idle' | 'connecting' | 'qr_ready' | 'connected' | 'disconnected' | 'error';

interface SessionState {
  status: SessionStatus;
  qrCode: string | null;
  phoneNumber: string | null;
  connectedAt: string | null;
  error: string | null;
}

interface UseWhatsAppSessionOptions {
  tenantId: string;
  pollingInterval?: number;
  onConnected?: (phoneNumber: string) => void;
}

export function useWhatsAppSession({
  tenantId,
  pollingInterval = 3_000,
  onConnected,
}: UseWhatsAppSessionOptions) {
  const [state, setState] = useState<SessionState>({
    status: 'idle',
    qrCode: null,
    phoneNumber: null,
    connectedAt: null,
    error: null,
  });

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPolling = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    isPolling.current = false;
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.whatsappGatewaySession();
      setState({
        status: data.status ?? 'idle',
        qrCode: data.qrCode ?? null,
        phoneNumber: data.phoneNumber ?? null,
        connectedAt: data.connectedAt ?? null,
        error: null,
      });

      if (data.status === 'connected') {
        stopPolling();
        if (data.phoneNumber) onConnected?.(data.phoneNumber);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gateway offline';
      setState((current) => ({ ...current, status: 'error', error: message }));
    }
  }, [onConnected, stopPolling]);

  const startPolling = useCallback(() => {
    if (isPolling.current) return;
    isPolling.current = true;
    pollingRef.current = setInterval(fetchStatus, pollingInterval);
  }, [fetchStatus, pollingInterval]);

  const connect = useCallback(async () => {
    setState({ status: 'connecting', qrCode: null, phoneNumber: null, connectedAt: null, error: null });

    try {
      await api.startWhatsAppGatewaySession();
      await fetchStatus();
      startPolling();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível iniciar a sessão';
      setState((current) => ({ ...current, status: 'error', error: message }));
    }
  }, [fetchStatus, startPolling]);

  const disconnect = useCallback(async () => {
    stopPolling();
    try {
      await api.stopWhatsAppGatewaySession();
      setState({ status: 'idle', qrCode: null, phoneNumber: null, connectedAt: null, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao desconectar';
      setState((current) => ({ ...current, error: message }));
    }
  }, [stopPolling]);

  const sendText = useCallback(
    async (to: string, message: string): Promise<{ messageId: string }> => {
      return api.sendWhatsAppGatewayText({ to, message });
    },
    [],
  );

  useEffect(() => {
    if (tenantId) void fetchStatus();
    return () => stopPolling();
  }, [fetchStatus, stopPolling, tenantId]);

  useEffect(() => {
    if (state.status !== 'error') return undefined;

    const retry = setInterval(() => {
      void fetchStatus();
    }, 5_000);

    return () => clearInterval(retry);
  }, [fetchStatus, state.status]);

  return {
    ...state,
    connect,
    disconnect,
    sendText,
    isConnected: state.status === 'connected',
    isLoading: state.status === 'connecting',
    hasQr: state.status === 'qr_ready' && Boolean(state.qrCode),
  };
}
