import { Link } from 'react-router-dom';
import siouLogo from '../../assets/siou-logo.png';

export const AppLogo = ({ to = '/' }: { to?: string }) => (
  <Link to={to} className="flex items-center gap-3">
    <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl border border-neon/25 bg-[#111827] shadow-button">
      <img src={siouLogo} alt="" className="h-full w-full object-contain" aria-hidden="true" />
    </span>
    <span className="leading-tight">
      <span className="block text-base font-black text-white">SIOU</span>
      <span className="block text-xs font-semibold text-neon">Food CRM</span>
    </span>
  </Link>
);
