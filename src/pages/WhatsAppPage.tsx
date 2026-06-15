import {
  Bot,
  CalendarPlus,
  CheckCheck,
  MessageCircle,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  ShoppingBag,
  Smile,
  Sparkles,
  Trash2,
  UserPlus,
  Video,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { useDemoMode } from '../hooks/useDemoMode';
import { useCustomers, useDeleteWhatsAppMessage, useSendWhatsAppGatewayMessage, useWhatsAppConversations } from '../hooks/useRestaurantData';
import type { WhatsAppMessage } from '../types/domain';

type ChatContact = {
  id: string;
  customerId?: string | null;
  name: string;
  phone: string;
  avatarUrl?: string;
  tags: string[];
  lastVisit?: string | null;
  ordersCount: number;
  messages: WhatsAppMessage[];
};

const now = Date.now();

const demoContacts: ChatContact[] = [
  {
    id: 'demo:cliente-01',
    customerId: 'demo-cliente-01',
    name: 'Cliente Demo 01',
    phone: '5500000000001',
    tags: ['WhatsApp', 'Pizza'],
    lastVisit: '2026-06-01',
    ordersCount: 4,
    messages: [
      {
        id: 'demo-msg-1',
        customer_id: 'demo-cliente-01',
        phone: '5500000000001',
        body: 'Oi, voces entregam pizza hoje?',
        direction: 'inbound',
        provider: 'demo',
        created_at: new Date(now - 12 * 60_000).toISOString(),
      },
      {
        id: 'demo-msg-2',
        customer_id: 'demo-cliente-01',
        phone: '5500000000001',
        body: 'Entregamos sim. Quer ver as pizzas mais pedidas do cardapio?',
        direction: 'outbound',
        provider: 'groq_ai',
        created_at: new Date(now - 10 * 60_000).toISOString(),
      },
    ],
  },
  {
    id: 'demo:cliente-02',
    customerId: 'demo-cliente-02',
    name: 'Cliente Demo 02',
    phone: '5500000000002',
    tags: ['WhatsApp'],
    lastVisit: null,
    ordersCount: 0,
    messages: [
      {
        id: 'demo-msg-3',
        customer_id: 'demo-cliente-02',
        phone: '5500000000002',
        body: 'Qual o tempo de entrega para o Centro?',
        direction: 'inbound',
        provider: 'demo',
        created_at: new Date(now - 46 * 60_000).toISOString(),
      },
    ],
  },
  {
    id: 'demo:cliente-03',
    customerId: 'demo-cliente-03',
    name: 'Cliente Demo 03',
    phone: '5500000000003',
    tags: ['WhatsApp', 'Novo'],
    lastVisit: null,
    ordersCount: 1,
    messages: [
      {
        id: 'demo-msg-4',
        customer_id: 'demo-cliente-03',
        phone: '5500000000003',
        body: 'Tem refrigerante lata?',
        direction: 'inbound',
        provider: 'demo',
        created_at: new Date(now - 78 * 60_000).toISOString(),
      },
    ],
  },
  {
    id: 'demo:cliente-04',
    customerId: 'demo-cliente-04',
    name: 'Cliente Demo 04',
    phone: '5500000000004',
    tags: ['WhatsApp'],
    lastVisit: '2026-05-28',
    ordersCount: 2,
    messages: [
      {
        id: 'demo-msg-5',
        customer_id: 'demo-cliente-04',
        phone: '5500000000004',
        body: 'Quero retirar no local.',
        direction: 'inbound',
        provider: 'demo',
        created_at: new Date(now - 2 * 60 * 60_000).toISOString(),
      },
    ],
  },
];

const phoneKey = (value: string) => value.replace(/\D/g, '');

const formatTime = (value?: string) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const lastMessageOf = (contact: ChatContact) => contact.messages[contact.messages.length - 1];

const fallbackAvatar =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="%23202c33"/><circle cx="48" cy="35" r="18" fill="%23cbd5e1"/><path d="M18 86c5-22 22-33 30-33s25 11 30 33" fill="%23cbd5e1"/></svg>';

const Avatar = ({ contact, size = 'md' }: { contact?: ChatContact; size?: 'md' | 'lg' }) => {
  const dimension = size === 'lg' ? 'h-16 w-16' : 'h-12 w-12';
  return (
    <img
      src={contact?.avatarUrl || fallbackAvatar}
      alt={contact ? `Foto de ${contact.name}` : 'Foto do contato'}
      className={`${dimension} shrink-0 rounded-full border border-white/10 object-cover`}
      referrerPolicy="no-referrer"
    />
  );
};

export const WhatsAppPage = () => {
  const navigate = useNavigate();
  const demoMode = useDemoMode();
  const { data: customers = [] } = useCustomers();
  const { data: conversations = [], isLoading: conversationsLoading } = useWhatsAppConversations();
  const sendWhatsApp = useSendWhatsAppGatewayMessage();
  const deleteWhatsAppMessage = useDeleteWhatsAppMessage();
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [deletedMessageIds] = useState<string[]>([]);
  const readOnlyMessage = 'Demonstração somente para visualização.';

  const contacts = useMemo<ChatContact[]>(() => {
    if (demoMode) {
      return demoContacts.map((contact) => ({
        ...contact,
        messages: contact.messages.filter((item) => !deletedMessageIds.includes(item.id)),
      }));
    }

    const phonesWithConversation = new Set(conversations.map((conversation) => phoneKey(conversation.phone)));
    const realConversations = conversations.map((conversation) => ({
      id: conversation.id,
      customerId: conversation.customer_id,
      name: conversation.customer_name,
      phone: conversation.phone,
      avatarUrl: conversation.avatar_url ?? undefined,
      tags: conversation.tags,
      lastVisit: conversation.last_visit,
      ordersCount: conversation.orders_count,
      messages: conversation.messages,
    }));
    const customerContacts = customers
      .filter((customer) => !phonesWithConversation.has(phoneKey(customer.phone)))
      .map((customer) => ({
        id: `customer:${customer.id}`,
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        avatarUrl: customer.avatar_url ?? undefined,
        tags: customer.tags,
        lastVisit: customer.last_visit,
        ordersCount: customer.orders_count,
        messages: [],
      }));

    return [...realConversations, ...customerContacts];
  }, [conversations, customers, demoMode, deletedMessageIds]);

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((contact) => `${contact.name} ${contact.phone}`.toLowerCase().includes(term));
  }, [contacts, search]);

  useEffect(() => {
    if (!filteredContacts.length) {
      setSelectedContactId(null);
      return;
    }
    if (!selectedContactId || !filteredContacts.some((contact) => contact.id === selectedContactId)) {
      setSelectedContactId(filteredContacts[0].id);
    }
  }, [filteredContacts, selectedContactId]);

  const activeContact = filteredContacts.find((contact) => contact.id === selectedContactId) || filteredContacts[0];
  const activeMessages = activeContact?.messages ?? [];

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!activeContact || !message.trim()) return;
    if (demoMode) {
      setStatus(readOnlyMessage);
      return;
    }
    const body = message.trim();
    setStatus(null);
    try {
      const result = await sendWhatsApp.mutateAsync({
        phone: activeContact.phone,
        message: body,
      });
      setMessage('');
      setStatus(result.queued ? 'Mensagem salva na fila manual.' : 'Mensagem enviada pelo WhatsApp conectado.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Nao foi possivel enviar.';
      setStatus(
        errorMessage.includes('Sess') || errorMessage.includes('conectada')
          ? 'WhatsApp ainda nao conectado. Va em Configuracoes > Integracoes, conecte o WhatsApp e escaneie o QR Code.'
          : errorMessage,
      );
    }
  };

  const generateAiReply = () => {
    if (!activeContact) return;
    if (demoMode) {
      setStatus(readOnlyMessage);
      return;
    }
    const lastMessage = lastMessageOf(activeContact)?.body;
    setMessage(
      lastMessage
        ? `Oi, ${activeContact.name}! Vi sua mensagem. Posso te ajudar com pedido, reserva ou tirar uma duvida do cardapio agora.`
        : `Oi, ${activeContact.name}! Como posso te ajudar hoje?`,
    );
  };

  const deleteMessage = async (messageId: string) => {
    if (demoMode) {
      setStatus(readOnlyMessage);
      return;
    }
    const confirmed = window.confirm('Apagar esta mensagem do historico do SIOU?');
    if (!confirmed) return;

    setStatus(null);
    try {
      await deleteWhatsAppMessage.mutateAsync(messageId);
      setStatus('Mensagem apagada do historico.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Nao foi possivel apagar a mensagem.');
    }
  };

  return (
    <div className="h-[calc(100vh-96px)] min-h-[640px] overflow-hidden rounded-2xl border border-line bg-[#0b0f10] text-slate-100 shadow-2xl shadow-black/30">
      <div className="grid h-full min-h-0 grid-cols-[76px_minmax(300px,390px)_1fr]">
        <aside className="flex flex-col items-center border-r border-white/10 bg-[#1f2322] py-4">
          <button className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white">
            <MessageCircle className="h-6 w-6" />
          </button>
          <div className="mt-6 flex flex-1 flex-col items-center gap-5 text-slate-300">
            <button className="relative grid h-11 w-11 place-items-center rounded-full bg-[#0b2f24] text-emerald-300">
              <MessageCircle className="h-5 w-5" />
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </button>
            <button className="grid h-11 w-11 place-items-center rounded-full text-fuchsia-300 hover:bg-white/10">
              <Sparkles className="h-5 w-5" />
            </button>
          </div>
          <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-neon to-fuchsia-500 text-xs font-black text-white">SY</div>
        </aside>

        <aside className="flex min-h-0 min-w-0 flex-col border-r border-white/10 bg-[#111716]">
          <div className="flex items-center justify-between px-5 py-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-neon">SIOU</p>
              <h1 className="text-2xl font-black text-white">WhatsApp</h1>
            </div>
            <div className="flex gap-2">
              <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => navigate('/app/clientes')} disabled={demoMode}>
                <Plus className="h-5 w-5" />
              </button>
              <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10">
                <MoreVertical className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="px-5 pb-3">
            <label className="flex h-12 items-center gap-3 rounded-full bg-[#2b302f] px-4 text-slate-300">
              <Search className="h-5 w-5" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                placeholder="Pesquisar ou comecar uma nova conversa"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredContacts.map((contact) => {
              const lastMessage = lastMessageOf(contact);
              const selected = activeContact?.id === contact.id;
              return (
                <button
                  key={contact.id}
                  onClick={() => setSelectedContactId(contact.id)}
                  className={`flex w-full items-center gap-3 border-b border-white/[0.06] px-4 py-4 text-left transition hover:bg-white/[0.04] ${
                    selected ? 'bg-[#0b2d29]' : ''
                  }`}
                >
                  <Avatar contact={contact} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-base font-black text-white">{contact.name}</p>
                      <span className="text-xs text-slate-400">{formatTime(lastMessage?.created_at)}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-300">
                      {lastMessage?.direction === 'outbound' ? 'Voce: ' : ''}
                      {lastMessage?.body || 'Sem mensagens ainda'}
                    </p>
                  </div>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400" />
                </button>
              );
            })}
            {!filteredContacts.length ? (
              <p className="p-5 text-sm text-slate-400">
                {conversationsLoading ? 'Carregando conversas...' : 'Nenhuma conversa encontrada.'}
              </p>
            ) : null}
          </div>
        </aside>

        <main className="grid min-h-0 min-w-0 grid-cols-[1fr_310px] bg-[#0b0f10]">
          <section className="flex min-h-0 min-w-0 flex-col">
            <header className="flex h-20 items-center justify-between border-b border-white/10 bg-[#1f2322] px-5">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar contact={activeContact} />
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-black text-white">{activeContact?.name || 'Selecione uma conversa'}</h2>
                  <p className="truncate text-sm text-slate-300">
                    {activeContact ? `${activeContact.phone} · atendimento com apoio da IA` : 'WhatsApp Gateway'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-slate-200">
                <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10">
                  <Video className="h-5 w-5" />
                </button>
                <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10">
                  <Search className="h-5 w-5" />
                </button>
                <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10">
                  <MoreVertical className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div
              className="min-h-0 flex-1 overflow-y-auto px-8 py-6"
              style={{
                backgroundColor: '#111412',
                backgroundImage:
                  'radial-gradient(circle at 12px 12px, rgba(255,255,255,0.045) 1px, transparent 1px), radial-gradient(circle at 36px 36px, rgba(255,255,255,0.035) 1px, transparent 1px)',
                backgroundSize: '48px 48px',
              }}
            >
              <div className="mx-auto mb-6 w-fit rounded-lg bg-black/35 px-4 py-2 text-center text-xs font-bold text-slate-300">
                As mensagens aparecem aqui conforme chegam pelo WhatsApp Gateway.
              </div>

              <div className="space-y-3">
                {activeMessages.map((chat) => {
                  const outbound = chat.direction === 'outbound';
                  return (
                    <div key={chat.id} className={`group flex items-center gap-2 ${outbound ? 'justify-end' : 'justify-start'}`}>
                      {outbound ? (
                        <button
                          type="button"
                          aria-label="Apagar mensagem"
                          onClick={() => deleteMessage(chat.id)}
                          disabled={demoMode || deleteWhatsAppMessage.isPending}
                          className="grid h-8 w-8 place-items-center rounded-full bg-black/35 text-slate-300 opacity-60 transition hover:bg-rose-500/20 hover:text-rose-100 hover:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                      <div
                        className={`max-w-[72%] rounded-2xl px-4 py-2 text-sm leading-6 shadow-lg ${
                          outbound ? 'rounded-tr-sm bg-[#005c4b] text-white' : 'rounded-tl-sm bg-[#202c33] text-slate-50'
                        }`}
                      >
                        <p>{chat.body}</p>
                        <div className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${outbound ? 'text-emerald-100/70' : 'text-slate-400'}`}>
                          <span>{formatTime(chat.created_at)}</span>
                          {outbound ? <CheckCheck className="h-3.5 w-3.5 text-sky-300" /> : null}
                        </div>
                      </div>
                      {!outbound ? (
                        <button
                          type="button"
                          aria-label="Apagar mensagem"
                          onClick={() => deleteMessage(chat.id)}
                          disabled={demoMode || deleteWhatsAppMessage.isPending}
                          className="grid h-8 w-8 place-items-center rounded-full bg-black/35 text-slate-300 opacity-60 transition hover:bg-rose-500/20 hover:text-rose-100 hover:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {!activeMessages.length ? (
                  <div className="mx-auto max-w-sm rounded-2xl bg-black/35 p-5 text-center text-sm leading-6 text-slate-300">
                    Nenhuma mensagem real nesta conversa ainda. Quando o cliente chamar no WhatsApp, aparece aqui.
                  </div>
                ) : null}
              </div>
            </div>

            <footer className="border-t border-white/10 bg-[#1f2322] p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <Button variant="secondary" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => navigate('/app/reservas')} disabled={demoMode}>
                  Reserva
                </Button>
                <Button variant="secondary" icon={<ShoppingBag className="h-4 w-4" />} onClick={() => navigate('/app/pedidos')} disabled={demoMode}>
                  Pedido
                </Button>
                <Button variant="secondary" icon={<UserPlus className="h-4 w-4" />} onClick={() => navigate('/app/clientes')} disabled={demoMode}>
                  Cliente
                </Button>
                <Button variant="secondary" icon={<Bot className="h-4 w-4" />} onClick={generateAiReply} disabled={demoMode || !activeContact}>
                  Apoio da IA
                </Button>
              </div>
              <form className="flex items-end gap-3" onSubmit={sendMessage}>
                <button type="button" className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-slate-300 hover:bg-white/10">
                  <Smile className="h-6 w-6" />
                </button>
                <button type="button" className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-slate-300 hover:bg-white/10">
                  <Paperclip className="h-6 w-6" />
                </button>
                <textarea
                  className="min-h-12 flex-1 resize-none rounded-2xl border border-white/10 bg-[#2a2f2e] px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-400 focus:border-emerald-400/50"
                  placeholder="Digite uma mensagem"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  disabled={demoMode || !activeContact}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) sendMessage(event);
                  }}
                />
                <button
                  type="submit"
                  disabled={demoMode || !activeContact || !message.trim() || sendWhatsApp.isPending}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {message.trim() ? <Send className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
              </form>
              {status ? <p className="mt-3 text-xs font-semibold text-emerald-100">{status}</p> : null}
            </footer>
          </section>

          <aside className="hidden border-l border-white/10 bg-[#101415] p-5 xl:block">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mx-auto w-fit">
                <Avatar contact={activeContact} size="lg" />
              </div>
              <h2 className="mt-4 text-center text-lg font-black text-white">{activeContact?.name || 'Cliente'}</h2>
              <p className="mt-1 text-center text-sm text-slate-400">{activeContact?.phone || '-'}</p>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-300">
                <button className="rounded-xl bg-white/[0.06] p-3">
                  <Phone className="mx-auto mb-1 h-4 w-4 text-emerald-300" />
                  Ligar
                </button>
                <button className="rounded-xl bg-white/[0.06] p-3">
                  <Search className="mx-auto mb-1 h-4 w-4 text-sky-300" />
                  Buscar
                </button>
                <button className="rounded-xl bg-white/[0.06] p-3">
                  <Bot className="mx-auto mb-1 h-4 w-4 text-fuchsia-300" />
                  IA
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-4">
              <div className="flex items-center gap-2 text-fuchsia-100">
                <Sparkles className="h-5 w-5" />
                <h3 className="font-black text-white">Apoio da IA</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                A Groq usa o contexto salvo na pagina de IA: cardapio, horarios, regras de pedido e historico recente da conversa.
              </p>
              <Button className="mt-4 w-full" variant="secondary" icon={<Bot className="h-4 w-4" />} onClick={generateAiReply} disabled={demoMode || !activeContact}>
                Sugerir resposta
              </Button>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <h3 className="font-black text-white">Historico do cliente</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <p>Ultima visita: {activeContact?.lastVisit || '-'}</p>
                <p>Pedidos: {activeContact?.ordersCount || 0}</p>
                <div className="flex flex-wrap gap-2">
                  {activeContact?.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-bold text-emerald-100">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};
