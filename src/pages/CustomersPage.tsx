import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarPlus, Download, Eye, Filter, MessageSquareText, Plus, Search, Tags, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useDemoMode } from '../hooks/useDemoMode';
import { useCreateCustomer, useCustomers, useSoftDeleteCustomer } from '../hooks/useRestaurantData';
import { CreateCustomerSchema } from '../schemas/customer';
import type { CustomerStatus } from '../types/domain';

const statusOptions: Array<{ value: CustomerStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
  { value: 'vip', label: 'VIP' },
  { value: 'new', label: 'Novos' },
];

const CustomerFormSchema = CreateCustomerSchema.omit({ tags: true }).extend({
  tagsText: z.string().max(300).optional().default(''),
});

type CustomerFormValues = z.infer<typeof CustomerFormSchema>;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const CustomerModal = ({ onClose }: { onClose: () => void }) => {
  const createCustomer = useCreateCustomer();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(CustomerFormSchema),
    defaultValues: {
      status: 'new',
      origin: 'whatsapp',
      tagsText: '',
    },
  });

  const onSubmit = async (values: CustomerFormValues) => {
    setFormError(null);
    const tags = (values.tagsText ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 10);

    const parsed = CreateCustomerSchema.safeParse({
      ...values,
      tags,
    });

    if (!parsed.success) {
      setFormError('Revise os campos antes de salvar.');
      return;
    }

    try {
      await createCustomer.mutateAsync(parsed.data);
      reset();
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível salvar o cliente agora.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit(onSubmit)} className="glass-panel max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-white">Adicionar cliente</h2>
            <p className="mt-1 text-sm text-muted">Dados serão salvos com isolamento por restaurante e validação Zod.</p>
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
            <span className="mb-2 block text-sm font-semibold text-slate-200">Telefone</span>
            <input className="form-field" placeholder="+551199999999" {...register('phone')} />
            {errors.phone ? <p className="mt-2 text-xs text-rose-200">{errors.phone.message}</p> : null}
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Email</span>
            <input className="form-field" type="email" {...register('email')} />
            {errors.email ? <p className="mt-2 text-xs text-rose-200">{errors.email.message}</p> : null}
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Data de nascimento</span>
            <input className="form-field" type="date" {...register('birth_date')} />
            {errors.birth_date ? <p className="mt-2 text-xs text-rose-200">{errors.birth_date.message}</p> : null}
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Status</span>
            <select className="form-field" {...register('status')}>
              <option value="new">Novo</option>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="vip">VIP</option>
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Origem</span>
            <select className="form-field" {...register('origin')}>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="referral">Indicação</option>
              <option value="delivery">Delivery</option>
              <option value="in_person">Presencial</option>
            </select>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-semibold text-slate-200">Tags</span>
          <input className="form-field" placeholder="VIP, pizza, família" {...register('tagsText')} />
        </label>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-semibold text-slate-200">Preferências</span>
          <textarea className="form-field min-h-24 resize-none" {...register('preferences')} />
        </label>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-semibold text-slate-200">Observações internas</span>
          <textarea className="form-field min-h-24 resize-none" {...register('notes')} />
        </label>

        {formError ? <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{formError}</div> : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting || createCustomer.isPending}>
            Salvar cliente
          </Button>
        </div>
      </form>
    </div>
  );
};

export const CustomersPage = () => {
  const demoMode = useDemoMode();
  const { data: customers = [], isLoading } = useCustomers();
  const deleteCustomer = useSoftDeleteCustomer();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CustomerStatus | 'all'>('all');
  const [frequency, setFrequency] = useState('all');
  const [birthday, setBirthday] = useState('all');
  const [lastVisit, setLastVisit] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query);

  const filtered = useMemo(
    () =>
      customers.filter((customer) => {
        const normalized = debouncedQuery.toLowerCase();
        const matchesSearch =
          !normalized ||
          customer.name.toLowerCase().includes(normalized) ||
          customer.phone.includes(normalized) ||
          customer.email?.toLowerCase().includes(normalized);
        const matchesStatus = status === 'all' || customer.status === status;
        const matchesFrequency =
          frequency === 'all' ||
          (frequency === 'high' && customer.orders_count >= 15) ||
          (frequency === 'medium' && customer.orders_count >= 5 && customer.orders_count < 15) ||
          (frequency === 'low' && customer.orders_count < 5);
        const matchesBirthday = birthday === 'all' || customer.birth_date?.slice(5, 7) === birthday;
        const matchesLastVisit =
          lastVisit === 'all' ||
          (lastVisit === '30' && customer.last_visit && new Date(customer.last_visit) < new Date('2026-04-28')) ||
          (lastVisit === '7' && customer.last_visit && new Date(customer.last_visit) >= new Date('2026-05-21'));
        return matchesSearch && matchesStatus && matchesFrequency && matchesBirthday && matchesLastVisit;
      }),
    [birthday, customers, debouncedQuery, frequency, lastVisit, status],
  );

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Base completa com busca, filtros, tags, histórico e ações rápidas para WhatsApp, reservas e pedidos."
        actions={
          <>
            <Button variant="secondary" icon={<Upload className="h-4 w-4" />} disabled={demoMode}>
              Importar clientes
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setIsModalOpen(true)} disabled={demoMode}>
              Adicionar cliente
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-[1.2fr_repeat(4,0.8fr)]">
          <label className="flex items-center gap-2 rounded-2xl border border-line bg-white/[0.05] px-3 py-2">
            <Search className="h-4 w-4 text-neon" />
            <input
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              placeholder="Buscar por nome, telefone ou email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select className="form-field" value={status} onChange={(event) => setStatus(event.target.value as CustomerStatus | 'all')}>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select className="form-field" value={frequency} onChange={(event) => setFrequency(event.target.value)}>
            <option value="all">Frequência</option>
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
          </select>
          <select className="form-field" value={birthday} onChange={(event) => setBirthday(event.target.value)}>
            <option value="all">Aniversário</option>
            <option value="05">Maio</option>
            <option value="06">Junho</option>
            <option value="12">Dezembro</option>
          </select>
          <select className="form-field" value={lastVisit} onChange={(event) => setLastVisit(event.target.value)}>
            <option value="all">Última visita</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Mais de 30 dias</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-line p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-neon" />
            <p className="text-sm font-bold text-white">{filtered.length} clientes encontrados</p>
          </div>
          <Button variant="ghost" icon={<Download className="h-4 w-4" />} disabled={demoMode}>
            Exportar
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.16em] text-muted">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Última visita</th>
                <th className="px-4 py-3">Total gasto</th>
                <th className="px-4 py-3">Pedidos</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer.id} className="border-t border-line transition hover:bg-white/[0.035]">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-neon to-fuchsia-500 text-xs font-black text-white">
                        {customer.name
                          .split(' ')
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join('')}
                      </div>
                      <div>
                        <Link to={`../clientes/${customer.id}`} className="font-black text-white hover:text-neon">
                          {customer.name}
                        </Link>
                        <div className="mt-1 flex gap-1">
                          {customer.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded-full bg-neon/10 px-2 py-0.5 text-[11px] font-semibold text-sky-100">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-300">{customer.phone}</td>
                  <td className="px-4 py-4">
                    <StatusBadge status={customer.status} />
                  </td>
                  <td className="px-4 py-4 capitalize text-slate-300">{customer.origin.replace('_', ' ')}</td>
                  <td className="px-4 py-4 text-slate-300">{customer.last_visit || '-'}</td>
                  <td className="px-4 py-4 font-bold text-white">{formatCurrency(customer.total_spent)}</td>
                  <td className="px-4 py-4 text-slate-300">{customer.orders_count}</td>
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <Link to={`../clientes/${customer.id}`} className="rounded-xl border border-line p-2 text-slate-200 hover:bg-white/[0.06]" title="Ver perfil">
                        <Eye className="h-4 w-4" />
                      </Link>
                      <button className="rounded-xl border border-line p-2 text-slate-200 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50" title="Enviar WhatsApp" disabled={demoMode}>
                        <MessageSquareText className="h-4 w-4" />
                      </button>
                      <button className="rounded-xl border border-line p-2 text-slate-200 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50" title="Criar reserva" disabled={demoMode}>
                        <CalendarPlus className="h-4 w-4" />
                      </button>
                      <button className="rounded-xl border border-line p-2 text-slate-200 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50" title="Adicionar tag" disabled={demoMode}>
                        <Tags className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded-xl border border-rose-400/30 p-2 text-rose-100 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Excluir"
                        disabled={demoMode}
                        onClick={() => void deleteCustomer.mutate(customer.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isLoading ? <p className="p-5 text-sm text-muted">Carregando clientes...</p> : null}
      </Card>

      {isModalOpen ? <CustomerModal onClose={() => setIsModalOpen(false)} /> : null}
    </div>
  );
};
