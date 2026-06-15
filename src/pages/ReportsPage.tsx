import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Download, FileText, TrendingUp } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { useCampaigns, useCustomers, useOrders } from '../hooks/useRestaurantData';
import { useDemoMode } from '../hooks/useDemoMode';

const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];

const formatMoney = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

const monthIndexFromDate = (value?: string | null) => {
  if (!value) return -1;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return -1;
  return date.getMonth();
};

export const ReportsPage = () => {
  const demoMode = useDemoMode();
  const { data: customers = [] } = useCustomers();
  const { data: orders = [] } = useOrders();
  const { data: campaigns = [] } = useCampaigns();

  const totalRevenue = orders.reduce((total, order) => total + order.total_amount, 0);
  const averageTicket = orders.length ? totalRevenue / orders.length : 0;
  const returningCustomers = customers.filter((customer) => customer.orders_count > 1 || customer.status === 'vip').length;
  const returnRate = customers.length ? Math.round((returningCustomers / customers.length) * 100) : 0;
  const bestConversion = campaigns.reduce((best, campaign) => {
    const conversion = campaign.sent_count ? Math.round((campaign.converted_count / campaign.sent_count) * 100) : 0;
    return Math.max(best, conversion);
  }, 0);

  const retentionChart = useMemo(
    () =>
      months.map((month, index) => {
        const customersUntilMonth = customers.filter((customer) => {
          const monthIndex = monthIndexFromDate(customer.created_at);
          return monthIndex >= 0 && monthIndex <= index;
        });
        const repeatCustomers = customersUntilMonth.filter((customer) => customer.orders_count > 1 || customer.status === 'vip').length;
        const monthOrders = orders.filter((order) => monthIndexFromDate(order.order_date) === index);
        const monthRevenue = monthOrders.reduce((total, order) => total + order.total_amount, 0);

        return {
          month,
          retorno: customersUntilMonth.length ? Math.round((repeatCustomers / customersUntilMonth.length) * 100) : 0,
          ticket: monthOrders.length ? Math.round(monthRevenue / monthOrders.length) : 0,
        };
      }),
    [customers, orders],
  );

  const campaignChart = useMemo(() => {
    const labels = [
      { key: 'birthday', name: 'Aniversário' },
      { key: 'inactive_customer', name: 'Inativos' },
      { key: 'weekend', name: 'Final semana' },
      { key: 'post_sale', name: 'Pós-venda' },
    ];

    return labels.map((label) => {
      const items = campaigns.filter((campaign) => campaign.type === label.key);
      const sent = items.reduce((total, campaign) => total + campaign.sent_count, 0);
      const converted = items.reduce((total, campaign) => total + campaign.converted_count, 0);
      const createdCustomers = customers.filter((customer) => {
        const origin = customer.origin === 'whatsapp' && label.key !== 'post_sale';
        return origin || (label.key === 'birthday' && Boolean(customer.birth_date));
      }).length;

      return {
        name: label.name,
        conversao: sent ? Math.round((converted / sent) * 100) : 0,
        clientes: createdCustomers,
      };
    });
  }, [campaigns, customers]);

  const hasRealData = customers.length > 0 || orders.length > 0 || campaigns.length > 0;

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description={
          demoMode
            ? 'Demonstração pública com dados fictícios. No painel logado, esta página usa os dados reais do restaurante.'
            : 'Relatórios reais do restaurante logado: clientes, retenção, ticket médio, campanhas e receita estimada.'
        }
        actions={
          <>
            <Button variant="secondary" icon={<FileText className="h-4 w-4" />} disabled={demoMode}>PDF</Button>
            <Button icon={<Download className="h-4 w-4" />} disabled={demoMode}>Exportar CSV</Button>
          </>
        }
      />

      {!demoMode && !hasRealData ? (
        <div className="mb-4 rounded-2xl border border-neon/25 bg-neon/10 p-4 text-sm text-sky-100">
          Sem dados reais suficientes ainda. Cadastre clientes, pedidos e campanhas para preencher estes relatórios.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <TrendingUp className="h-6 w-6 text-neon" />
          <p className="mt-4 text-3xl font-black text-white">{returnRate}%</p>
          <p className="text-sm text-muted">Taxa de retorno</p>
        </Card>
        <Card>
          <BarChart3 className="h-6 w-6 text-neon" />
          <p className="mt-4 text-3xl font-black text-white">{formatMoney(averageTicket)}</p>
          <p className="text-sm text-muted">Ticket médio</p>
        </Card>
        <Card>
          <FileText className="h-6 w-6 text-neon" />
          <p className="mt-4 text-3xl font-black text-white">{bestConversion}%</p>
          <p className="text-sm text-muted">Melhor conversão</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-black text-white">Clientes e retenção</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={retentionChart}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="month" stroke="#94A3B8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94A3B8" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#0B1020', border: '1px solid rgba(0,175,255,0.18)', borderRadius: 14 }} />
                <Line type="monotone" dataKey="retorno" stroke="#00AFFF" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="ticket" stroke="#C026D3" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-black text-white">Campanhas e clientes novos</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={campaignChart}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="name" stroke="#94A3B8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94A3B8" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#0B1020', border: '1px solid rgba(0,175,255,0.18)', borderRadius: 14 }} />
                <Bar dataKey="conversao" fill="#00AFFF" radius={[8, 8, 0, 0]} />
                <Bar dataKey="clientes" fill="#2563EB" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};
