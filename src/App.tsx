import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
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

const privateRoutes = (
  <>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<DashboardPage />} />
    <Route path="clientes" element={<CustomersPage />} />
    <Route path="clientes/:customerId" element={<CustomerProfilePage />} />
    <Route path="reservas" element={<ReservationsPage />} />
    <Route path="pedidos" element={<OrdersPage />} />
    <Route path="campanhas" element={<CampaignsPage />} />
    <Route path="aniversarios" element={<Navigate to="../meu-plano" replace />} />
    <Route path="meu-plano" element={<PlanPage />} />
    <Route path="whatsapp" element={<WhatsAppPage />} />
    <Route path="ia" element={<AiPage />} />
    <Route path="automacoes" element={<AutomationsPage />} />
    <Route path="relatorios" element={<ReportsPage />} />
    <Route path="configuracoes" element={<SettingsPage />} />
    <Route path="planos" element={<BillingPage />} />
  </>
);

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/cadastro" element={<RegisterPage />} />
      <Route path="/recuperar-senha" element={<ResetPasswordPage />} />
      <Route path="/verificar-email" element={<VerifyEmailPage />} />
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
