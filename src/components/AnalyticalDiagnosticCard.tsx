import React from 'react';
import { BarChart3, SlidersHorizontal, X } from 'lucide-react';
import { HabitDiagnostic } from '../types/tracker';
import { GoalIconBadge } from '../utils/colorAndIcons';
import { formatQuantity } from '../utils/paceEngine';

interface AnalyticalDiagnosticCardProps {
  diagnostic: HabitDiagnostic;
  onApplyMinimumDose?: (goalId: string, nextTarget: number) => void;
  onInspectHabit?: (goalId: string) => void;
  onDismiss?: (goalId: string) => void;
}

export const AnalyticalDiagnosticCard: React.FC<AnalyticalDiagnosticCardProps> = ({
  diagnostic,
  onApplyMinimumDose,
  onInspectHabit,
  onDismiss,
}) => {
  const { goal, consecutiveSkips, completionRate30d, topObstacle, topBreakPoint, neutralQuestion, suggestedTarget } =
    diagnostic;

  const unitSuffix =
    goal.trackingMode === 'measure' && goal.unit ? ` ${goal.unit}` : '';

  return (
    <section
      aria-label={`Diagnóstico analítico de ${goal.title}`}
      className="bg-white rounded-2xl border border-indigo-200/80 p-4 shadow-2xs space-y-3"
    >
      {/* Calm Analytical Header (never red or punitive) */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <GoalIconBadge
            iconType={goal.iconType || 'icon'}
            iconValue={goal.iconValue || 'activity'}
            colorHex={goal.colorHex || '#3B4DF5'}
            sizeClass="w-10 h-10"
          />
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
              <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Diagnóstico analítico · {consecutiveSkips} días en pausa</span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              {goal.title}
            </h3>
          </div>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={() => onDismiss(goal.id)}
            aria-label="Ocultar diagnóstico"
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Objective Historical Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 rounded-xl p-3 border border-slate-200/70">
        <div>
          <div className="text-[11px] text-slate-500">Cumplimiento (30d)</div>
          <div className="font-mono text-sm font-bold text-slate-900 tabular-nums mt-0.5">
            {completionRate30d}%
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-500">Obstáculo frecuente</div>
          <div className="text-xs font-semibold text-slate-800 mt-0.5 truncate">
            {topObstacle
              ? `${topObstacle.label} (${topObstacle.pct}%)`
              : 'Sin cuestionarios previos'}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-500">Punto de rotura</div>
          <div className="text-xs font-semibold text-slate-800 mt-0.5 truncate">
            {topBreakPoint ? topBreakPoint.label : 'Por identificar'}
          </div>
        </div>
      </div>

      {/* Neutral Adjustment Question */}
      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
        {neutralQuestion}
      </p>

      {/* Neutral Adjustment Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {suggestedTarget !== null && onApplyMinimumDose && (
          <button
            type="button"
            onClick={() => onApplyMinimumDose(goal.id, suggestedTarget)}
            className="px-3.5 h-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
          >
            Reducir meta a {formatQuantity(suggestedTarget)}
            {unitSuffix}
          </button>
        )}

        {onInspectHabit && (
          <button
            type="button"
            onClick={() => onInspectHabit(goal.id)}
            className="px-3.5 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Ajustar hábito</span>
          </button>
        )}

        {onDismiss && (
          <button
            type="button"
            onClick={() => onDismiss(goal.id)}
            className="px-3 h-9 rounded-full text-slate-500 hover:text-slate-800 text-xs font-medium"
          >
            Mantener igual
          </button>
        )}
      </div>
    </section>
  );
};
