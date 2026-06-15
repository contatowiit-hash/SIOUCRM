import type { ReactNode } from 'react';

export const PageHeader = ({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) => (
  <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-neon">SIOU</p>
      <h1 className="text-2xl font-black text-white md:text-3xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>
    </div>
    {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
  </div>
);
