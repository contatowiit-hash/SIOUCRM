import { Layers3 } from 'lucide-react';
import { Link } from 'react-router-dom';

export const AppLogo = ({ to = '/' }: { to?: string }) => (
  <Link to={to} className="flex items-center gap-3">
    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-neon to-fuchsia-500 shadow-button">
      <Layers3 className="h-5 w-5 text-white" aria-hidden="true" />
    </span>
    <span className="leading-tight">
      <span className="block text-base font-black text-white">SIOU</span>
      <span className="block text-xs font-semibold text-neon">Food CRM</span>
    </span>
  </Link>
);
