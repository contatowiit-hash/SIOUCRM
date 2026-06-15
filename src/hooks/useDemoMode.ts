import { useLocation } from 'react-router-dom';

export const useDemoMode = () => {
  const location = useLocation();
  return location.pathname.startsWith('/demo');
};
