import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './providers/AuthProvider';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;
const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();
const MaybeGoogleOAuthProvider = ({ children }: { children: React.ReactNode }) =>
  googleClientId ? <GoogleOAuthProvider clientId={googleClientId}>{children}</GoogleOAuthProvider> : <>{children}</>;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MaybeGoogleOAuthProvider>
        <Router>
          <AuthProvider>
            <App />
          </AuthProvider>
        </Router>
      </MaybeGoogleOAuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);