import { AppLogo } from './AppLogo';

export const LoadingScreen = () => (
  <div className="grid min-h-screen place-items-center bg-ink px-6">
    <div className="flex flex-col items-center gap-5">
      <AppLogo />
      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-neon shadow-button" />
      </div>
      <p className="text-sm text-muted">Carregando ambiente seguro...</p>
    </div>
  </div>
);
