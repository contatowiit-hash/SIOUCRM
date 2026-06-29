import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { demoAutomations, demoCampaigns, demoCustomers, demoOrders, demoReservations } from '../data/demo';
import { api } from '../lib/api';
import { sanitizePhone, sanitizeText } from '../lib/security';
import { CreateCustomerSchema, type CreateCustomerInput } from '../schemas/customer';
import type { Automation, Campaign, Customer, Order, Reservation, WhatsAppConversation, WhatsAppSendResult } from '../types/domain';
import { useAuth } from '../providers/AuthProvider';
import { useDemoMode } from './useDemoMode';

const byTenant = <T extends { restaurant_id: string }>(rows: T[], restaurantId: string | null) =>
  restaurantId ? rows.filter((row) => row.restaurant_id === restaurantId) : rows;

const demoReadOnlyError = () => new Error('Demonstração somente para visualização.');

export const useCustomers = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();

  return useQuery({
    queryKey: ['customers', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
    enabled: demoMode || Boolean(accessToken && restaurantId),
    queryFn: async () => {
      if (demoMode) return demoCustomers;
      return (await api.customers()).data;
    },
  });
};

export const useCreateCustomer = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCustomerInput) => {
      const parsed = CreateCustomerSchema.parse(input);
      const payload = {
        restaurant_id: restaurantId || 'demo-restaurant',
        name: sanitizeText(parsed.name, 100),
        phone: sanitizePhone(parsed.phone),
        email: parsed.email || null,
        birth_date: parsed.birth_date || null,
        gender: parsed.gender || null,
        tags: parsed.tags,
        preferences: parsed.preferences ? sanitizeText(parsed.preferences, 1000) : null,
        notes: parsed.notes ? sanitizeText(parsed.notes, 1000) : null,
        last_visit: null,
        total_spent: 0,
        orders_count: 0,
        loyalty_score: parsed.status === 'vip' ? 82 : 45,
        status: parsed.status,
        origin: parsed.origin,
      } satisfies Omit<Customer, 'id' | 'created_at'>;

      if (demoMode) throw demoReadOnlyError();

      return (await api.createCustomer(payload)).data;
    },
    onSuccess: (customer) => {
      queryClient.setQueryData<Customer[]>(
        ['customers', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
        (current) => [customer, ...(current || [])],
      );
    },
  });
};

export const useSoftDeleteCustomer = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customerId: string) => {
      if (demoMode) throw demoReadOnlyError();

      await api.deleteCustomer(customerId);
      return customerId;
    },
    onSuccess: (customerId) => {
      queryClient.setQueryData<Customer[]>(
        ['customers', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
        (current) => (current || []).filter((customer) => customer.id !== customerId),
      );
    },
  });
};

export const useReservations = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();

  return useQuery({
    queryKey: ['reservations', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
    enabled: demoMode || Boolean(accessToken && restaurantId),
    queryFn: async () => {
      if (demoMode) return byTenant(demoReservations, restaurantId);
      return (await api.reservations()).data;
    },
  });
};

export const useCreateReservation = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: unknown) => {
      if (demoMode) throw demoReadOnlyError();
      return (await api.createReservation(input)).data;
    },
    onSuccess: (reservation) => {
      queryClient.setQueryData<Reservation[]>(
        ['reservations', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
        (current) => [reservation, ...(current || [])],
      );
    },
  });
};

export const useUpdateReservationStatus = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Reservation['status'] }) => {
      if (demoMode) throw demoReadOnlyError();
      return (await api.updateReservationStatus(id, status)).data;
    },
    onSuccess: (reservation) => {
      queryClient.setQueryData<Reservation[]>(
        ['reservations', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
        (current) =>
          (current || []).map((item) =>
            item.id === reservation.id ? { ...item, ...reservation } as Reservation : item,
          ),
      );
    },
  });
};

export const useOrders = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();

  return useQuery({
    queryKey: ['orders', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
    enabled: demoMode || Boolean(accessToken && restaurantId),
    queryFn: async () => {
      if (demoMode) return byTenant(demoOrders, restaurantId);
      return (await api.orders()).data;
    },
  });
};

export const useCreateOrder = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: unknown) => {
      if (demoMode) throw demoReadOnlyError();
      return (await api.createOrder(input)).data;
    },
    onSuccess: (order) => {
      queryClient.setQueryData<Order[]>(
        ['orders', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
        (current) => [order, ...(current || [])],
      );
    },
  });
};

export const useCampaigns = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();

  return useQuery({
    queryKey: ['campaigns', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
    enabled: demoMode || Boolean(accessToken && restaurantId),
    queryFn: async () => {
      if (demoMode) return byTenant(demoCampaigns, restaurantId);
      return (await api.campaigns()).data;
    },
  });
};

export const useCreateCampaign = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: unknown) => {
      if (demoMode) throw demoReadOnlyError();
      return (await api.createCampaign(input)).data;
    },
    onSuccess: (campaign) => {
      queryClient.setQueryData<Campaign[]>(
        ['campaigns', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
        (current) => [campaign, ...(current || [])],
      );
    },
  });
};

export const useSendCampaign = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (demoMode) throw demoReadOnlyError();
      return api.sendCampaign(id);
    },
    onSuccess: (result) => {
      queryClient.setQueryData<Campaign[]>(
        ['campaigns', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
        (current) => (current || []).map((campaign) => (campaign.id === result.data.id ? result.data : campaign)),
      );
    },
  });
};

export const useAutomations = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();

  return useQuery({
    queryKey: ['automations', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
    enabled: demoMode || Boolean(accessToken && restaurantId),
    queryFn: async () => {
      if (demoMode) return demoAutomations;
      return (await api.automations()).data;
    },
  });
};

export const useCreateAutomation = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: unknown) => {
      if (demoMode) throw demoReadOnlyError();
      return (await api.createAutomation(input)).data;
    },
    onSuccess: (automation) => {
      queryClient.setQueryData<Automation[]>(
        ['automations', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
        (current) => [automation, ...(current || [])],
      );
    },
  });
};

export const useUpdateAutomation = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: unknown }) => {
      if (demoMode) throw demoReadOnlyError();
      return (await api.updateAutomation(id, input)).data;
    },
    onSuccess: (automation) => {
      queryClient.setQueryData<Automation[]>(
        ['automations', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
        (current) =>
          (current || []).map((item) =>
            item.id === automation.id ? { ...item, ...automation } as Automation : item,
          ),
      );
    },
  });
};

export const useUpdateAutomationStatus = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Automation['status'] }) => {
      if (demoMode) throw demoReadOnlyError();
      return (await api.updateAutomationStatus(id, status)).data;
    },
    onSuccess: (automation) => {
      queryClient.setQueryData<Automation[]>(
        ['automations', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
        (current) =>
          (current || []).map((item) =>
            item.id === automation.id ? { ...item, ...automation } as Automation : item,
          ),
      );
    },
  });
};

export const useSendWhatsAppMessage = () => {
  const demoMode = useDemoMode();

  return useMutation({
    mutationFn: async (input: unknown): Promise<WhatsAppSendResult> => {
      if (demoMode) throw demoReadOnlyError();
      return api.sendWhatsApp(input);
    },
  });
};

export const useWhatsAppConversations = () => {
  const { accessToken, restaurantId } = useAuth();
  const demoMode = useDemoMode();

  return useQuery({
    queryKey: ['whatsapp-conversations', demoMode ? 'demo' : restaurantId, accessToken ? 'api' : 'local'],
    enabled: !demoMode && Boolean(accessToken && restaurantId),
    refetchInterval: 4000,
    queryFn: async (): Promise<WhatsAppConversation[]> => {
      if (demoMode) return [];
      return (await api.whatsappConversations()).data;
    },
  });
};

export const useSendWhatsAppGatewayMessage = () => {
  const demoMode = useDemoMode();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { phone: string; message: string }): Promise<WhatsAppSendResult> => {
      if (demoMode) throw demoReadOnlyError();
      const result = await api.sendWhatsAppGatewayText({
        to: sanitizePhone(input.phone),
        message: sanitizeText(input.message, 4096),
      });

      return { success: true, message_id: result.messageId || crypto.randomUUID(), queued: false };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
    },
  });
};

export const useDeleteWhatsAppMessage = () => {
  const demoMode = useDemoMode();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string): Promise<{ success: true }> => {
      if (demoMode) throw demoReadOnlyError();
      return api.deleteWhatsAppMessage(messageId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
    },
  });
};
