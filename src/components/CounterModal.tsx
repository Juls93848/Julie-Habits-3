import React, { useState } from 'react';
import { Minus, Plus, RotateCcw, SquarePen, Target, X } from 'lucide-react';
import { Goal } from '../types/tracker';
import { getGoalPalette, GoalIconBadge } from '../utils/colorAndIcons';
import {
  formatQuantity,
  formatShortSpanishDate,
  getEffectiveTarget,
  getSpanishWeekdayShort,
  toLocalDateStr,
} from '../utils/paceEngine';

interface CounterModalProps {
  goal: Goal;
  dateStr: string;
  now: Date;
  onClose: () => void;
  onSave: (nextValue: number) => void;
  onOpenNote?: () => void;
}

export const CounterModal: React.FC<CounterModalProps> = ({
  goal,
  dateStr,
  now,
  onClose,
  onSave,
  onOpenNote,
}) => {
  const palette = getGoalPalette(goal.colorHex);
  const target = getEffectiveTarget(goal);
  const initialVal = Number(goal.completions[dateStr] || 0);
  const [value, setValue] = useState<number>(initialVal);
  const [inputDraft, setInputDraft] = useState<string>(String(initialVal));

  const todayStr = toLocalDateStr(now);
  const pct = Math.min(100, Math.round((value / target) * 100));
  const step = goal.trackingMode === 'measure' && target <= 3 ? 0.5 : 1;
  const quickAdd1 = target >= 30 ? 5 : step;
  const quickAdd2 =
    goal.trackingMode === 'measure' && target <= 3
      ? 1
      : target >= 30
      ? 25
      : 5;
  const unitLabel = goal.trackingMode === 'measure' && goal.unit ? ` ${goal.unit}` : '';

  const updateBoth = (nextVal: number) => {
    const clean = Math.max(0, Number(nextVal.toFixed(2)));
    setValue(clean);
    setInputDraft(String(clean));
  };

  const adjust = (delta: number) => {
    updateBoth(value + delta);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(inputDraft.replace(',', '.'));
    const finalVal = Number.isFinite(parsed) ? Math.max(0, parsed) : value;
    onSave(finalVal);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="counter-modal-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl p-5 space-y-4"
      >
        {/* Grab handle on mobile */}
        <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto sm:hidden" aria-hidden="true" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <GoalIconBadge
              iconType={goal.iconType || 'icon'}
              iconValue={goal.iconValue || 'activity'}
              colorHex={goal.colorHex || '#3B4DF5'}
              sizeClass="w-11 h-11"
            />
            <div className="min-w-0">
              <h2
                id="counter-modal-title"
                className="font-display text-base font-bold text-slate-900 truncate"
              >
                {goal.title}
              </h2>
              <p className="text-xs text-slate-500 tabular-nums">
                {dateStr === todayStr ? 'Hoy · ' : ''}
                {getSpanishWeekdayShort(dateStr).toLowerCase()}{' '}
                {formatShortSpanishDate(dateStr)}
              </p>
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

        {/* Big Stepper Row */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => adjust(-step)}
            disabled={value <= 0}
            aria-label="Disminuir"
            className="retro-press w-16 h-16 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-700 disabled:opacity-35 shrink-0"
          >
            <Minus className="w-5 h-5" aria-hidden="true" />
          </button>

          <div className="flex-1 h-16 rounded-2xl bg-slate-100/90 flex items-center justify-center px-3">
            <input
              type="number"
              step={goal.trackingMode === 'measure' ? 'any' : '1'}
              min={0}
              inputMode={goal.trackingMode === 'measure' ? 'decimal' : 'numeric'}
              value={inputDraft}
              onChange={(e) => {
                const raw = e.target.value;
                setInputDraft(raw);
                const parsed = Number(raw.replace(',', '.'));
                if (Number.isFinite(parsed) && parsed >= 0) {
                  setValue(parsed);
                }
              }}
              onBlur={() => updateBoth(value)}
              aria-label="Cantidad registrada"
              className="w-full text-center font-mono text-2xl font-bold text-slate-900 bg-transparent focus:outline-none tabular-nums"
            />
          </div>

          <button
            type="button"
            onClick={() => adjust(step)}
            aria-label="Aumentar"
            className="retro-press w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor: palette.softBg,
              color: palette.iconFg,
            }}
          >
            <Plus className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
          </button>
        </div>

        {/* Progress Bar & Meta */}
        <div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-2">
            <div
              className="h-full rounded-full transition-[width] duration-150"
              style={{
                width: `${pct}%`,
                backgroundColor: palette.fillBg,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs font-mono tabular-nums">
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <Target
                className="w-3.5 h-3.5"
                style={{ color: palette.iconFg }}
                aria-hidden="true"
              />
              <span>
                Meta {formatQuantity(target)}
                {unitLabel}
              </span>
            </span>
            <span className="font-bold" style={{ color: palette.iconFg }}>
              {pct}%
            </span>
          </div>
        </div>

        {/* Quick Preset Chips */}
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => adjust(quickAdd1)}
            className="retro-press h-10 rounded-full border border-slate-200 bg-white hover:bg-slate-50 font-mono text-xs font-semibold text-slate-800"
          >
            +{formatQuantity(quickAdd1)}
          </button>
          <button
            type="button"
            onClick={() => adjust(quickAdd2)}
            className="retro-press h-10 rounded-full border border-slate-200 bg-white hover:bg-slate-50 font-mono text-xs font-semibold text-slate-800"
          >
            +{formatQuantity(quickAdd2)}
          </button>
          <button
            type="button"
            onClick={() => updateBoth(target)}
            className="retro-press h-10 rounded-full font-mono text-xs font-bold inline-flex items-center justify-center gap-1"
            style={{
              backgroundColor: palette.softBg,
              color: palette.iconFg,
            }}
          >
            <Target className="w-3 h-3" aria-hidden="true" />
            <span>{formatQuantity(target)}</span>
          </button>
          <button
            type="button"
            onClick={() => updateBoth(0)}
            aria-label="Reiniciar a cero"
            className="retro-press h-10 rounded-full border border-slate-200 bg-white hover:bg-slate-50 font-mono text-xs font-semibold text-slate-600 inline-flex items-center justify-center gap-1"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span>0</span>
          </button>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center gap-2.5 pt-1">
          {onOpenNote && (
            <button
              type="button"
              onClick={onOpenNote}
              title="Entrar al hábito y escribir nota"
              aria-label="Entrar al hábito y escribir nota"
              className="retro-press w-12 h-12 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 shrink-0"
            >
              <SquarePen className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="submit"
            className="retro-press flex-1 h-12 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-sm font-semibold shadow-xs"
          >
            Guardar {formatQuantity(value)}
            {unitLabel}
          </button>
        </div>
      </form>
    </div>
  );
};
