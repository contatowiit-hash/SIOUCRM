import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarDays, Clock, MessageSquareText, Plus, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useDemoMode } from '../hooks/useDemoMode';
import { useCreateReservation, useReservations, useUpdateReservationStatus } from '../hooks/useRestaurantData';
import { ReservationSchema, type ReservationInput } from '../schemas/modules';
import type { Reservation, ReservationStatus } from '../types/domain';

const statusFlow: ReservationStatus[] = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];

const nextStatus = (status: ReservationStatus): ReservationStatus =>
  status === 'pending' ? 'confirmed' : status === 'confirmed' ? 'completed' : status === 'cancelled' ? 'pending' : 'pending';

const statusActions: Record<ReservationStatus, string> = {
  pending: 'Confirmar reserva',
  confirmed: 'Concluir',
  cancelled: 'Reativar',
  completed: 'Reabrir',
  no_show: 'Reagendar',
};

const createWeek = (selectedDate: string) => {
  const base = new Date(`${selectedDate}T00:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(base);
    day.setDate(base.getDate() - 2 + index);
    return day.toISOString().slice(0, 10);
  });
};

const ReservationModal = ({ onClose }: { onClose: () => void }) => {
  const createReservation = useCreateReservation();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ReservationInput>({
    resolver: zodResolver(ReservationSchema),
    defaultValues: {
      reservation_date: new Date().toISOString().slice(0, 10),
      reservation_time: '19:30',
      party_size: 2,
      table_label: '',
      notes: '',
    },
  });

  const onSubmit = async (values: ReservationInput) => {
    setFormError(null);
    try {
      await createReservation.mutateAsync({
        ...values,
        table_label: values.table_label || null,
        notes: values.notes || null,
      });
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível salvar a reserva.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit(onSubmit)} className="glass-panel w-full max-w-2xl rounded-3xl p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-white">Criar reserva</h2>
            <p className="mt-1 text-sm text-muted">A reserva fica salva no restaurante logado.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-slate-300">
            Fechar
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Cliente</span>
            <input className="form-field" {...register('customer_name')} />
            {errors.customer_name ? <p className="mt-2 text-xs text-rose-200">{errors.customer_name.message}</p> : null}
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Telefone</span>
            <input className="form-field" placeholder="+55 11 99999-9999" {...register('phone')} />
            {errors.phone ? <p className="mt-2 text-xs text-rose-200">{errors.phone.message}</p> : null}
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Data</span>
            <input className="form-field" type="date" {...register('reservation_date')} />
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Horario</span>
            <input className="form-field" type="time" {...register('reservation_time')} />
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Pessoas</span>
            <input className="form-field" type="number" min={1} max={80} {...register('party_size')} />
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-200">Mesa</span>
            <input className="form-field" placeholder="Mesa 8" {...register('table_label')} />
          </label>
        </div>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-semibold text-slate-200">Observações</span>
          <textarea className="form-field min-h-24 resize-none" {...register('notes')} />
        </label>
        {formError ? <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{formError}</div> : null}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSubmitting || createReservation.isPending}>Salvar reserva</Button>
        </div>
      </form>
    </div>
  );
};

export const ReservationsPage = () => {
  const demoMode = useDemoMode();
  const { data: reservations = [] } = useReservations();
  const updateStatus = useUpdateReservationStatus();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<ReservationStatus | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(
    () =>
      reservations.filter(
        (reservation) => reservation.reservation_date === date && (status === 'all' || reservation.status === status),
      ),
    [date, reservations, status],
  );

  const week = createWeek(date);
  const changeStatus = (reservation: Reservation) =>
    updateStatus.mutate({ id: reservation.id, status: nextStatus(reservation.status) });

  return (
    <div>
      <PageHeader
        title="Reservas"
        description="Calendário, lista do dia, status, mesa, horário, confirmação e lembrete por WhatsApp."
        actions={
          <>
            <Button variant="secondary" icon={<MessageSquareText className="h-4 w-4" />} disabled={demoMode}>
              Lembretes prontos
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)} disabled={demoMode}>
              Criar reserva
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-black text-white">
              <CalendarDays className="h-5 w-5 text-neon" />
              Calendário
            </h2>
            <input className="form-field w-auto" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="grid grid-cols-7 gap-2">
            {week.map((day) => {
              const count = reservations.filter((reservation) => reservation.reservation_date === day).length;
              return (
                <button
                  key={day}
                  onClick={() => setDate(day)}
                  className={`rounded-2xl border p-3 text-center transition ${day === date ? 'border-neon/60 bg-neon/15' : 'border-line bg-white/[0.04] hover:bg-white/[0.07]'}`}
                >
                  <p className="text-xs font-bold text-muted">{new Date(`${day}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' })}</p>
                  <p className="mt-2 text-lg font-black text-white">{day.slice(-2)}</p>
                  <p className="mt-1 text-xs text-neon">{count} reservas</p>
                </button>
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-line bg-white/[0.04] p-4">
            <h3 className="mb-3 font-black text-white">Mensagem automatica</h3>
            <p className="text-sm leading-7 text-slate-300">
              Olá, {'{nome}'}! Sua reserva está confirmada para {'{data}'} às {'{hora}'}. Esperamos você!
            </p>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <h2 className="font-black text-white">Reservas do dia</h2>
            <select className="form-field md:w-48" value={status} onChange={(event) => setStatus(event.target.value as ReservationStatus | 'all')}>
              <option value="all">Todos os status</option>
              {statusFlow.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-3">
            {filtered.map((reservation) => (
              <div key={reservation.id} className="rounded-2xl border border-line bg-white/[0.04] p-4">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div className="flex gap-4">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-neon/10 text-neon">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black text-white">{reservation.customer_name}</h3>
                        <StatusBadge status={reservation.status} />
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {reservation.reservation_time} - {reservation.table_label || 'sem mesa'} - {reservation.phone}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-bold text-slate-200">
                      <UsersRound className="h-4 w-4 text-neon" />
                      {reservation.party_size}
                    </span>
                    <Button variant="secondary" onClick={() => changeStatus(reservation)} disabled={demoMode || updateStatus.isPending}>
                      {statusActions[reservation.status]}
                    </Button>
                  </div>
                </div>
                {reservation.notes ? <p className="mt-4 text-sm leading-6 text-slate-300">{reservation.notes}</p> : null}
              </div>
            ))}
            {!filtered.length ? <p className="rounded-2xl border border-line bg-white/[0.04] p-5 text-sm text-muted">Nenhuma reserva real para esse filtro.</p> : null}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        {statusFlow.map((item) => (
          <Card key={item} className="p-4">
            <StatusBadge status={item} />
            <p className="mt-4 text-2xl font-black text-white">{reservations.filter((reservation) => reservation.status === item).length}</p>
          </Card>
        ))}
      </div>
      {modalOpen ? <ReservationModal onClose={() => setModalOpen(false)} /> : null}
    </div>
  );
};
