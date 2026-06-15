import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export const buttonStyles = (variant: ButtonVariant = 'primary', className?: string) =>
  cn(
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[14px] px-4 py-2 text-sm font-semibold transition duration-200 focus:outline-none focus:ring-4 focus:ring-neon/20 disabled:opacity-60',
    variant === 'primary' &&
      'bg-neon text-ink shadow-button hover:bg-sky-300 hover:shadow-[0_0_30px_rgba(0,175,255,0.38)]',
    variant === 'secondary' &&
      'border border-line bg-white/[0.06] text-slate-100 hover:border-neon/50 hover:bg-neon/10',
    variant === 'ghost' && 'text-slate-200 hover:bg-white/[0.07]',
    variant === 'danger' && 'border border-rose-400/30 bg-rose-500/12 text-rose-100 hover:bg-rose-500/20',
    className,
  );

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

export const Button = ({ className, variant = 'primary', icon, children, ...props }: ButtonProps) => (
  <button className={buttonStyles(variant, className)} {...props}>
    {icon}
    {children}
  </button>
);
