import type { ReactNode } from 'react';
import { Card } from './Card';

export const MetricCard = ({
  label,
  value,
  delta,
  icon,
}: {
  label: string;
  value: ReactNode;
  delta: string;
  icon: ReactNode;
}) => (
  <Card className="group relative overflow-hidden p-4">
    <div className="absolute right-3 top-3 rounded-xl bg-neon/10 p-2 text-neon transition group-hover:bg-neon/20">
      {icon}
    </div>
    <p className="max-w-[8rem] text-sm font-medium text-sky-100">{label}</p>
    <p className="mt-4 text-2xl font-black text-white">{value}</p>
    <p className="mt-1 text-xs font-medium text-neon">{delta}</p>
  </Card>
);
