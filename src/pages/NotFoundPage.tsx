import { Compass, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppLogo } from '../components/ui/AppLogo';
import { buttonStyles } from '../components/ui/Button';

export const NotFoundPage = () => (
  <div className="grid min-h-screen place-items-center bg-radial-grid bg-[length:100%_100%,44px_44px,44px_44px] px-5 text-center">
    <div className="max-w-xl">
      <div className="mb-8 flex justify-center">
        <AppLogo />
      </div>
      <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-[28px] border border-neon/30 bg-neon/10 text-neon shadow-glow">
        <Compass className="h-9 w-9" />
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-neon">404</p>
      <h1 className="mt-3 text-4xl font-black text-white">Página não encontrada.</h1>
      <p className="mt-4 text-sm leading-7 text-muted">
        O recurso pode não existir ou não pertencer ao restaurante logado. Por segurança, não exibimos detalhes sobre dados de outros restaurantes.
      </p>
      <div className="mt-8">
        <Link to="/" className={buttonStyles('primary')}>
          <Home className="h-4 w-4" />
          Voltar ao início
        </Link>
      </div>
    </div>
  </div>
);
