import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../providers/AuthProvider';
import { LoadingScreen } from '../ui/LoadingScreen';

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { session, loading, restaurantId, user } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  const loginPath = `/login?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
  if (!session) return <Navigate to={loginPath} replace state={{ from: location }} />;
  if (!restaurantId) return <Navigate to="/404" replace />;

  return <>{children}</>;
};
