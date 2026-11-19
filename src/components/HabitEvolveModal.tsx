import React, { useState } from 'react';
import { Minus, Plus, Repeat, Sparkles, X } from 'lucide-react';
import { FrequencyType, Goal, HabitFrequency } from '../types/tracker';
import { getGoalPalette, GoalIconBadge } from '../utils/colorAndIcons';
import {
  addDays,
  formatFrequencySummary,
  formatPermanentCycleLabel,
  formatQuantity,
  getPermanentCycleDays,
  toLocalDateStr,
} from '../utils/paceEngine';

export interface EvolveGoalPayload {
  title: string;
  frequency: HabitFrequency;
  dailyTarget: number;
  isPermanent: boolean;
  permanentCycleDays: number;
  deadlineDate: string;
}

interface HabitEvolveModalProps {
  goal: Goal;
  now: Date;
  onClose: () => void;
  onConfirm: (payload: EvolveGoalPayload) => void;
}

const WEEKDAYS_ORDERED = [
  { id: 1, short: 'L' },
  { id: 2, short: 'M' },
  { id: 3, short: 'X' },
  { id: 4, short: 'J' },
  { id: 5, short: 'V' },
  { id: 6, short: 'S' },
  { id: 0, short: 'D' },
];

const FREQ_TYPES: Array<{ type: FrequencyType; label: string }> = [
  { type: 'everyday', label: 'Todos los días' },
  { type: 'specific_days', label: 'Días concretos' },
  { type: 'times_per_week', label: 'Veces/sem' },
  { type: 'every_n_days', label: 'Cada N días' },
];

export const HabitEvolveModal: React.FC<HabitEvolveModalProps> = ({
  goal,
  now,
  onClose,
  onConfirm,
}) => {
  const todayStr = toLocalDateStr(now);
  const palette = getGoalPalette(goal.colorHex);
  const nextPhaseNumber = (goal.phaseNumber || 1) + 1;

  const [title, setTitle] = useState(goal.title);
  const [isPermanent, setIsPermanent] = useState(Boolean(goal.isPermanent));
  const [permanentCycleDays, setPermanentCycleDays] = useState<number>(() =>
    getPermanentCycleDays(goal)
  );
  const [deadlineDate, setDeadlineDate] = useState(() => addDays(todayStr, 20));
  const [dailyTarget, setDailyTarget] = useState<number>(goal.dailyTarget || 1);
  const [frequency, setFrequency] = useState<HabitFrequency>(
    goal.frequency || {
      type: 'everyday',
      weekdays: [1, 2, 3, 4, 5],
      count: 3,
      intervalDays: 2,
    }
  );
  const [error, setError] = useState<string | null>(null);

  const toggleWeekday = (dayId: number) => {
    setFrequency((prev) => {
      const current = prev.weekdays || [1, 2, 3, 4, 5];
      const exists = current.includes(dayId);
      const next = exists
        ? current.length > 1
          ? current.filter((d) => d !== dayId)
          : current
        : [...current, dayId];
      return { ...prev, type: 'specific_days', weekdays: next };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Escribe un nombre para la siguiente fase.');
      return;
    }
    const safeCycleDays = Math.max(
      1,
      Math.min(365, Math.round(Number(permanentCycleDays) || 30))
    );
    const finalDeadline = isPermanent
      ? addDays(todayStr, safeCycleDays - 1)
      : deadlineDate;
    if (!isPermanent && finalDeadline < todayStr) {
      setError('La fecha límite debe ser igual o posterior a hoy.');
      return;
    }

    onConfirm({
      title: cleanTitle,
      frequency,
      dailyTarget:
        goal.trackingMode === 'boolean' ? 1 : Math.max(0.1, Number(dailyTarget) || 1),
      isPermanent,
      permanentCycleDays: safeCycleDays,
      deadlineDate: finalDeadline,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="evolve-modal-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-[#F7F7FA] sm:bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <GoalIconBadge
              iconType={goal.iconType || 'icon'}
              iconValue={goal.iconValue || 'activity'}
              colorHex={goal.colorHex || '#3B4DF5'}
              sizeClass="w-10 h-10"
            />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Fase {goal.phaseNumber || 1} → Fase {nextPhaseNumber}
              </div>
              <h2
                id="evolve-modal-title"
                className="font-display text-base font-bold text-slate-900 truncate"
              >
                Evolucionar hábito
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="rounded-xl bg-slate-100/80 border border-slate-200/70 px-3.5 py-2.5 text-xs text-slate-600">
            Se guardará <strong className="text-slate-900">{goal.title}</strong> ({formatFrequencySummary(goal.frequency)}) en tu ruta de progreso antes de iniciar la nueva etapa.
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          {/* Next Phase Title */}
          <div>
            <label
              htmlFor="evolve-phase-title"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Nombre de la Fase {nextPhaseNumber}
            </label>
            <input
              id="evolve-phase-title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Ej. Gym constante"
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-2 focus:outline-blue-600"
            />
          </div>

          {/* Phase Type: Temporary vs Permanent */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-1.5">
              Duración de esta etapa
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsPermanent(false)}
                className={`p-3 rounded-xl border text-left transition-colors ${
                  !isPermanent
                    ? 'border-[#3B4DF5] bg-blue-50/70 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-[#3B4DF5]" aria-hidden="true" />
                  <span>Etapa temporal</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Con fecha límite definida
                </div>
              </button>

              <button
                type="button"
                onClick={() => setIsPermanent(true)}
                className={`p-3 rounded-xl border text-left transition-colors ${
                  isPermanent
                    ? 'border-[#3B4DF5] bg-blue-50/70 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <Repeat className="w-3.5 h-3.5 text-[#3B4DF5]" aria-hidden="true" />
                  <span>Permanente</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Ciclos de evaluación continuos
                </div>
              </button>
            </div>

            {isPermanent ? (
              <div className="mt-2.5 bg-white rounded-xl border border-slate-200 p-3 space-y-2.5">
                <span className="block text-[11px] font-medium text-slate-600">
                  Frecuencia de evaluación (ciclos)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    { days: 7, label: 'Semanal (7d)' },
                    { days: 14, label: 'Quincenal (14d)' },
                    { days: 15, label: '15 días' },
                    { days: 30, label: 'Mensual (30d)' },
                  ].map((opt) => {
                    const selected = permanentCycleDays === opt.days;
                    return (
                      <button
                        key={opt.days}
                        type="button"
                        onClick={() => setPermanentCycleDays(opt.days)}
                        className={`h-8 px-2 rounded-lg border text-[11px] font-semibold transition-colors ${
                          selected
                            ? 'text-white border-transparent'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                        style={selected ? { backgroundColor: palette.fillBg } : undefined}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-[11px] text-slate-500">
                    {formatPermanentCycleLabel(permanentCycleDays)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setPermanentCycleDays((d) => Math.max(1, d - 1))
                      }
                      aria-label="Disminuir días del ciclo"
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                    >
                      <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={permanentCycleDays}
                      onChange={(e) =>
                        setPermanentCycleDays(
                          Math.max(1, Math.min(365, Math.round(Number(e.target.value) || 1)))
                        )
                      }
                      aria-label="Días por ciclo"
                      className="w-14 h-8 text-center rounded-lg border border-slate-200 font-mono text-xs font-bold text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPermanentCycleDays((d) => Math.min(365, d + 1))
                      }
                      aria-label="Aumentar días del ciclo"
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-2.5 bg-white rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-600">
                    Fecha límite
                  </span>
                  <div className="flex items-center gap-1">
                    {[7, 14, 21, 30].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDeadlineDate(addDays(todayStr, d - 1))}
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-mono text-[11px] text-slate-700"
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="date"
                  value={deadlineDate}
                  min={todayStr}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 font-mono text-xs text-slate-900"
                />
              </div>
            )}
          </div>

          {/* Frequency Selector */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 space-y-2.5">
            <span className="block text-xs font-semibold text-slate-700">
              Frecuencia
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {FREQ_TYPES.map((ft) => {
                const active = frequency.type === ft.type;
                return (
                  <button
                    key={ft.type}
                    type="button"
                    onClick={() =>
                      setFrequency((prev) => ({
                        ...prev,
                        type: ft.type,
                        weekdays: prev.weekdays || [1, 2, 3, 4, 5],
                        count: prev.count || 3,
                        intervalDays: prev.intervalDays || 2,
                      }))
                    }
                    className={`px-2 py-2 rounded-xl border text-[11px] font-semibold transition-colors ${
                      active
                        ? 'text-white border-transparent'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                    style={active ? { backgroundColor: palette.fillBg } : undefined}
                  >
                    {ft.label}
                  </button>
                );
              })}
            </div>

            {frequency.type === 'specific_days' && (
              <div className="grid grid-cols-7 gap-1 pt-1">
                {WEEKDAYS_ORDERED.map((wd) => {
                  const selected = (frequency.weekdays || []).includes(wd.id);
                  return (
                    <button
                      key={wd.id}
                      type="button"
                      onClick={() => toggleWeekday(wd.id)}
                      className={`h-9 rounded-lg text-xs font-bold border transition-colors ${
                        selected
                          ? 'text-white border-transparent'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                      style={selected ? { backgroundColor: palette.fillBg } : undefined}
                    >
                      {wd.short}
                    </button>
                  );
                })}
              </div>
            )}

            {frequency.type === 'times_per_week' && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-600">Días por semana</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setFrequency((p) => ({
                        ...p,
                        count: Math.max(1, (p.count || 3) - 1),
                      }))
                    }
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                  >
                    <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <span className="font-mono text-sm font-bold w-6 text-center tabular-nums">
                    {frequency.count || 3}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFrequency((p) => ({
                        ...p,
                        count: Math.min(7, (p.count || 3) + 1),
                      }))
                    }
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}

            {frequency.type === 'every_n_days' && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-600">Repetir cada</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setFrequency((p) => ({
                        ...p,
                        intervalDays: Math.max(2, (p.intervalDays || 2) - 1),
                      }))
                    }
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                  >
                    <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <span className="font-mono text-xs font-bold tabular-nums">
                    {frequency.intervalDays || 2} días
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFrequency((p) => ({
                        ...p,
                        intervalDays: Math.min(30, (p.intervalDays || 2) + 1),
                      }))
                    }
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Daily Target (for counter/measure habits) */}
          {goal.trackingMode !== 'boolean' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-800">
                  Meta diaria
                </div>
                <div className="text-[11px] text-slate-500">
                  {goal.trackingMode === 'measure' && goal.unit
                    ? `En ${goal.unit}`
                    : goal.stepLabel || 'Unidades'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDailyTarget((v) =>
                      Math.max(goal.trackingMode === 'measure' ? 0.5 : 1, v - (goal.trackingMode === 'measure' ? 0.5 : 1))
                    )
                  }
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                >
                  <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <span className="font-mono text-sm font-bold min-w-[2.5rem] text-center tabular-nums">
                  {formatQuantity(dailyTarget)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDailyTarget(
                      (v) => v + (goal.trackingMode === 'measure' ? 0.5 : 1)
                    )
                  }
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-white border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-11 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="retro-press flex-1 h-11 rounded-full text-white text-sm font-semibold"
            style={{ backgroundColor: palette.fillBg }}
          >
            Iniciar Fase {nextPhaseNumber}
          </button>
        </div>
      </form>
    </div>
  );
};
