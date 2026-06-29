import { Bell, Building2, Link2, Save, ShieldCheck, Upload } from 'lucide-react';
import { IntegrationsPanel } from '../components/IntegrationsPanel';
import { WhatsAppConnect } from '../components/WhatsAppConnect';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { useDemoMode } from '../hooks/useDemoMode';
import { useAuth } from '../providers/AuthProvider';

const checklist = [
  'Dados separados por restaurante',
  'Códigos protegidos no backend',
  'Webhooks com assinatura segura',
  'Headers de segurança configurados',
  'Logs sem senhas, tokens ou cartão',
  'CRM bloqueado até o plano estar ativo',
];

export const SettingsPage = () => {
  const demoMode = useDemoMode();
  const { restaurant, restaurantId, apiUser } = useAuth();

  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Dados do restaurante, WhatsApp, pagamentos, segurança e preferências."
        actions={
          <Button icon={<Save className="h-4 w-4" />} disabled={demoMode}>
            Salvar alterações
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <div className="space-y-4">
          <Card>
            <h2 className="mb-4 flex items-center gap-2 font-black text-white">
              <Building2 className="h-4 w-4 text-neon" />
              Restaurante
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-2 block text-sm font-semibold text-slate-200">Nome do restaurante</span>
                <input className="form-field disabled:cursor-not-allowed disabled:opacity-70" defaultValue={restaurant?.name || ''} disabled={demoMode} />
              </label>
              <label>
                <span className="mb-2 block text-sm font-semibold text-slate-200">Telefone</span>
                <input className="form-field disabled:cursor-not-allowed disabled:opacity-70" defaultValue="" disabled={demoMode} />
              </label>
              <label>
                <span className="mb-2 block text-sm font-semibold text-slate-200">Categoria</span>
                <select className="form-field disabled:cursor-not-allowed disabled:opacity-70" defaultValue="restaurante" disabled={demoMode}>
                  <option value="restaurante">Restaurante</option>
                  <option value="pizzaria">Pizzaria</option>
                  <option value="hamburgueria">Hamburgueria</option>
                  <option value="bar">Bar</option>
                  <option value="cafe">Cafeteria</option>
                </select>
              </label>
              <label>
                <span className="mb-2 block text-sm font-semibold text-slate-200">ID do restaurante</span>
                <input className="form-field font-mono text-sm" value={restaurantId || ''} readOnly />
              </label>
              <label>
                <span className="mb-2 block text-sm font-semibold text-slate-200">Logo</span>
                <button className="form-field flex items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-70" disabled={demoMode}>
                  <Upload className="h-4 w-4 text-neon" />
                  Upload seguro até 5 MB
                </button>
              </label>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 flex items-center gap-2 font-black text-white">
              <Link2 className="h-4 w-4 text-neon" />
              Integrações
            </h2>
            <div className="mb-4">
              {demoMode ? (
                <div className="rounded-2xl border border-line bg-white/[0.04] p-4 text-sm text-muted">
                  Demonstração somente para visualização. Entre em uma conta real para conectar o WhatsApp.
                </div>
              ) : restaurantId ? (
                <WhatsAppConnect tenantId={restaurantId} />
              ) : (
                <div className="rounded-2xl border border-line bg-white/[0.04] p-4 text-sm text-muted">
                  Entre em uma conta real para conectar o WhatsApp do restaurante.
                </div>
              )}
            </div>
            <div className="border-t border-line pt-5">
              <IntegrationsPanel canManage={apiUser?.role === 'owner'} disabled={demoMode} />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-neon/30 bg-neon/10">
            <h2 className="mb-4 flex items-center gap-2 font-black text-white">
              <ShieldCheck className="h-4 w-4 text-neon" />
              Segurança de produção
            </h2>
            <div className="space-y-3">
              {checklist.map((item) => (
                <label key={item} className="flex items-center gap-3 rounded-xl border border-neon/20 bg-black/15 px-3 py-2 text-sm text-sky-100">
                  <input type="checkbox" checked readOnly className="h-4 w-4 accent-sky-400" />
                  {item}
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 flex items-center gap-2 font-black text-white">
              <Bell className="h-4 w-4 text-neon" />
              Notificações
            </h2>
            <div className="space-y-3">
              {['Reservas novas', 'Campanhas concluídas', 'Clientes inativos', 'Falhas de webhook'].map((item) => (
                <label key={item} className="flex items-center justify-between rounded-2xl border border-line bg-white/[0.04] p-4">
                  <span className="font-semibold text-white">{item}</span>
                  <input type="checkbox" defaultChecked disabled={demoMode} className="h-5 w-5 accent-sky-400 disabled:cursor-not-allowed disabled:opacity-50" />
                </label>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
