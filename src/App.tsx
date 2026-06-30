import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { useDemoMode } from './hooks/useDemoMode';
import { useAuth } from './providers/AuthProvider';
import { LandingPage } from './pages/LandingPage';
import { LoginPage, RegisterPage, ResetPasswordPage, VerifyEmailPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerProfilePage } from './pages/CustomerProfilePage';
import { ReservationsPage } from './pages/ReservationsPage';
import { OrdersPage } from './pages/OrdersPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { PlanPage } from './pages/PlanPage';
import { WhatsAppPage } from './pages/WhatsAppPage';
import { AiPage } from './pages/AiPage';
import { AutomationsPage } from './pages/AutomationsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { BillingPage } from './pages/BillingPage';
import { NotFoundPage } from './pages/NotFoundPage';

const paidPlans = new Set(['plus', 'starter', 'pro', 'premium', 'lifetime', 'founder_lifetime']);

const PublicRoute = ({ children }: { children: ReactNode }) => {
  const { session, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (session) return <Navigate to="/app/planos" replace />;

  return <>{children}</>;
};

const RequirePaidPlan = ({ children }: { children: ReactNode }) => {
  const demoMode = useDemoMode();
  const { restaurant, apiUser } = useAuth();
  const hasAccess = demoMode || apiUser?.is_dev || paidPlans.has(restaurant?.plan || 'free');
  return hasAccess ? <>{children}</> : <Navigate to="/app/planos" replace />;
};

const privateRoutes = (
  <>
    <Route index element={<Navigate to="planos" replace />} />
    <Route path="dashboard" element={<RequirePaidPlan><DashboardPage /></RequirePaidPlan>} />
    <Route path="clientes" element={<RequirePaidPlan><CustomersPage /></RequirePaidPlan>} />
    <Route path="clientes/:customerId" element={<RequirePaidPlan><CustomerProfilePage /></RequirePaidPlan>} />
    <Route path="reservas" element={<RequirePaidPlan><ReservationsPage /></RequirePaidPlan>} />
    <Route path="pedidos" element={<RequirePaidPlan><OrdersPage /></RequirePaidPlan>} />
    <Route path="campanhas" element={<RequirePaidPlan><CampaignsPage /></RequirePaidPlan>} />
    <Route path="aniversarios" element={<Navigate to="../meu-plano" replace />} />
    <Route path="meu-plano" element={<PlanPage />} />
    <Route path="whatsapp" element={<RequirePaidPlan><WhatsAppPage /></RequirePaidPlan>} />
    <Route path="ia" element={<RequirePaidPlan><AiPage /></RequirePaidPlan>} />
    <Route path="automacoes" element={<RequirePaidPlan><AutomationsPage /></RequirePaidPlan>} />
    <Route path="relatorios" element={<RequirePaidPlan><ReportsPage /></RequirePaidPlan>} />
    <Route path="configuracoes" element={<RequirePaidPlan><SettingsPage /></RequirePaidPlan>} />
    <Route path="planos" element={<BillingPage />} />
  </>
);

function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/cadastro" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/recuperar-senha" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
      <Route path="/verificar-email" element={<PublicRoute><VerifyEmailPage /></PublicRoute>} />
      <Route path="/dashboard" element={<Navigate to="/app/planos" replace />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        {privateRoutes}
      </Route>
      <Route path="/demo" element={<DashboardLayout />}>
        {privateRoutes}
      </Route>
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
