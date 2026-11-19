import React, { useMemo, useState } from 'react';
import { Archive, BarChart2, ChevronDown, ChevronRight } from 'lucide-react';
import { Goal } from '../types/tracker';
import { getGoalPalette, GoalIconBadge, hexToRgba } from '../utils/colorAndIcons';
import {
  addDays,
  calculateGoalProgress,
  diffDays,
  formatQuantity,
  formatShortPermanentCycleLabel,
  formatShortSpanishDate,
  getDayCompletionStats,
  getGoalOriginDateStr,
  getMondayOfWeek,
  getPermanentCycleDays,
  isDateScheduledForGoal,
  isPhaseCompletedPromptNeeded,
  parseLocalDate,
  toLocalDateStr,
} from '../utils/paceEngine';

interface GoalsListViewProps {
  goals: Goal[];
  now: Date;
  onInspectGoal: (goalId: string) => void;
  onOpenHabitStats?: (goal: Goal) => void;
  onUpdateProgress: (
    goalId: string,
    dateStr: string,
    nextValue: number,
    event?: React.MouseEvent
  ) => void;
  onOpenCounterModal: (goalId: string, dateStr: string) => void;
}

const HEATMAP_WEEKS = 16; // 16 weeks x 7 days (L-D), consistent horizontal calendar grid
const WEEKDAY_ROWS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTH_SHORT_CAP = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

export const GoalsListView: React.FC<GoalsListViewProps> = ({
  goals,
  now,
  onInspectGoal,
  onOpenHabitStats,
  onUpdateProgress,
  onOpenCounterModal,
}) => {
  const [selectedArea, setSelectedArea] = useState<string>('Todas');
  const [showArchived, setShowArchived] = useState(false);
  const todayStr = toLocalDateStr(now);

  const activeGoals = useMemo(
    () => goals.filter((g) => !g.isArchived),
    [goals]
  );
  const archivedGoals = useMemo(
    () => goals.filter((g) => Boolean(g.isArchived)),
    [goals]
  );

  // Shared 20-week Lun-Dom columns + minimalist month headers across all cards
  const { weekColumns, monthHeaders } = useMemo(() => {
    const currentWeekMonday = getMondayOfWeek(todayStr);
    const rollingStartMonday = addDays(
      currentWeekMonday,
      -7 * (HEATMAP_WEEKS - 1)
    );

    let earliestOrigin = todayStr;
    for (const g of activeGoals) {
      const origin = getGoalOriginDateStr(g);
      if (origin < earliestOrigin) {
        earliestOrigin = origin;
      }
    }
    const earliestMonday = getMondayOfWeek(earliestOrigin);
    const gridStartMonday =
      earliestMonday >= rollingStartMonday ? earliestMonday : rollingStartMonday;

    const cols: string[][] = [];
    for (let w = 0; w < HEATMAP_WEEKS; w++) {
      const colStart = addDays(gridStartMonday, w * 7);
      cols.push(Array.from({ length: 7 }, (_, d) => addDays(colStart, d)));
    }

    const headers: Array<string | null> = Array(HEATMAP_WEEKS).fill(null);
    let lastPlacedCol = -4;
    let lastPlacedMonth = -1;

    for (let w = 0; w < cols.length; w++) {
      const week = cols[w];
      // Prefer the month of the 1st day inside this week, else the month of the week's Monday
      const firstOfMonthDay = week.find((dStr) => dStr.endsWith('-01'));
      const refDateStr = firstOfMonthDay || week[0];
      const monthIdx = Number(refDateStr.split('-')[1]) - 1;

      if (w === 0 || (monthIdx !== lastPlacedMonth && w - lastPlacedCol >= 3)) {
        headers[w] = MONTH_SHORT_CAP[monthIdx] || '';
        lastPlacedCol = w;
        lastPlacedMonth = monthIdx;
      } else if (monthIdx !== lastPlacedMonth && firstOfMonthDay && w - lastPlacedCol >= 2) {
        headers[w] = MONTH_SHORT_CAP[monthIdx] || '';
        lastPlacedCol = w;
        lastPlacedMonth = monthIdx;
      }
    }

    return { weekColumns: cols, monthHeaders: headers };
  }, [activeGoals, todayStr]);

  const areaStats = useMemo(() => {
    const counts: Record<string, number> = {};
    activeGoals.forEach((g) => {
      const area = g.area || 'Personal';
      counts[area] = (counts[area] || 0) + 1;
    });
    return {
      areas: ['Todas', ...Object.keys(counts)],
      counts,
    };
  }, [activeGoals]);

  const effectiveSelectedArea = areaStats.areas.includes(selectedArea)
    ? selectedArea
    : 'Todas';

  const filteredGoals = useMemo(() => {
    if (effectiveSelectedArea === 'Todas') return activeGoals;
    return activeGoals.filter((g) => (g.area || 'Personal') === effectiveSelectedArea);
  }, [activeGoals, effectiveSelectedArea]);

  const handleHeatmapCellTap = (
    goal: Goal,
    dStr: string,
    event: React.MouseEvent
  ) => {
    event.stopPropagation();
    const stats = getDayCompletionStats(goal, dStr);

    if (goal.trackingMode === 'boolean') {
      onUpdateProgress(goal.id, dStr, stats.isDone ? 0 : 1, event);
      return;
    }

    if (goal.tapAction === 'add_1' && stats.value < stats.target) {
      const nextVal = Number((stats.value + 1).toFixed(2));
      onUpdateProgress(goal.id, dStr, nextVal, event);
      return;
    }

    onOpenCounterModal(goal.id, dStr);
  };

  return (
    <div className="space-y-4">
      {areaStats.areas.length > 2 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {areaStats.areas.map((area) => {
            const active = effectiveSelectedArea === area;
            const count =
              area === 'Todas' ? activeGoals.length : areaStats.counts[area] || 0;
            return (
              <button
                key={area}
                type="button"
                onClick={() => setSelectedArea(area)}
                className={`px-3.5 h-9 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-[#3B4DF5] text-white shadow-2xs'
                    : 'bg-white border border-slate-200/90 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {area} ({count})
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-3">
        {filteredGoals.map((goal) => {
          const palette = getGoalPalette(goal.colorHex);
          const progress = calculateGoalProgress(goal, now);
          const originDate = getGoalOriginDateStr(goal);
          const freqType = goal.frequency?.type || 'everyday';

          return (
            <article
              key={goal.id}
              className="w-full bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs transition-colors"
            >
              {/* Header: Icon + Title + Cierra: Fecha + Stats Symbol + Chevron */}
              <div className="w-full flex items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => onInspectGoal(goal.id)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left group"
                >
                  <GoalIconBadge
                    iconType={goal.iconType || 'icon'}
                    iconValue={goal.iconValue || 'activity'}
                    colorHex={goal.colorHex || '#3B4DF5'}
                    sizeClass="w-10 h-10"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <h2 className="text-base font-bold text-slate-900 truncate group-hover:text-[#3B4DF5] transition-colors">
                        {goal.title}
                      </h2>
                      {isPhaseCompletedPromptNeeded(goal, todayStr) && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200/80 text-[11px] font-semibold text-[#3B4DF5] shrink-0">
                          Etapa finalizada
                        </span>
                      )}
                      {progress.status === 'behind' && !isPhaseCompletedPromptNeeded(goal, todayStr) && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200/80 text-[11px] font-semibold text-rose-700 shrink-0">
                          Atrasado
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                      {goal.phaseNumber && goal.phaseNumber > 1
                        ? `Fase ${goal.phaseNumber} · `
                        : ''}
                      {goal.isPermanent
                        ? `${formatShortPermanentCycleLabel(getPermanentCycleDays(goal))} · `
                        : ''}
                      Cierra: {formatShortSpanishDate(goal.deadlineDate)}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  {onOpenHabitStats && (
                    <button
                      type="button"
                      onClick={() => onOpenHabitStats(goal)}
                      aria-label={`Estadísticas detalladas de ${goal.title}`}
                      title="Estadísticas detalladas"
                      className="w-9 h-9 rounded-full bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-[#3B4DF5] flex items-center justify-center transition-colors shrink-0"
                    >
                      <BarChart2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onInspectGoal(goal.id)}
                    aria-label={`Abrir detalle de ${goal.title}`}
                    className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-800 shrink-0 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Minimalist Horizontal Calendar Heatmap (Full Card Width, Interactive in Range) */}
              <div className="mt-3.5 w-full">
                {/* Minimal Month Headers Row */}
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-3 shrink-0" aria-hidden="true" />
                  <div
                    className="flex-1 min-w-0 grid gap-[3px] sm:gap-1"
                    style={{
                      gridTemplateColumns: `repeat(${HEATMAP_WEEKS}, minmax(0, 1fr))`,
                    }}
                  >
                    {monthHeaders.map((label, idx) => (
                      <div key={idx} className="relative h-3 overflow-visible">
                        {label && (
                          <span className="absolute left-0 top-0 text-[9px] font-medium text-slate-400/90 leading-none whitespace-nowrap">
                            {label}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Minimal Weekday Labels + 20-Week Grid */}
                <div className="flex items-stretch gap-1.5">
                  <div className="w-3 shrink-0 grid grid-rows-7 gap-[3px] sm:gap-1 items-center">
                    {WEEKDAY_ROWS.map((lbl, idx) => (
                      <span
                        key={`${lbl}-${idx}`}
                        className="text-[8.5px] font-medium text-slate-400/80 leading-none text-center select-none"
                      >
                        {lbl}
                      </span>
                    ))}
                  </div>

                  <div
                    className="flex-1 min-w-0 grid gap-[3px] sm:gap-1"
                    style={{
                      gridTemplateColumns: `repeat(${HEATMAP_WEEKS}, minmax(0, 1fr))`,
                    }}
                  >
                    {weekColumns.map((week, wIdx) => (
                      <div key={wIdx} className="grid grid-rows-7 gap-[3px] sm:gap-1 justify-items-center">
                        {week.map((dStr) => {
                          const isFuture = dStr > todayStr;
                          const inPhaseHistory = Boolean(
                            goal.phaseHistory?.some(
                              (rec) => dStr >= rec.startDate && dStr <= rec.deadlineDate
                            )
                          );
                          const inRange = goal.isPermanent
                            ? dStr >= originDate
                            : (dStr >= originDate && dStr <= goal.deadlineDate) ||
                              inPhaseHistory;
                          const stats = getDayCompletionStats(goal, dStr);
                          const hasValue = stats.value > 0;
                          const cellShape =
                            'w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-[3px] sm:rounded-[3.5px] transition-colors';

                          const wasScheduled = (() => {
                            if (!inRange) return false;
                            if (freqType === 'everyday') return true;
                            if (freqType === 'specific_days') {
                              const weekdays =
                                goal.frequency?.weekdays &&
                                goal.frequency.weekdays.length > 0
                                  ? goal.frequency.weekdays
                                  : [1, 2, 3, 4, 5];
                              return weekdays.includes(parseLocalDate(dStr).getDay());
                            }
                            if (freqType === 'every_n_days') {
                              if (goal.isPermanent) {
                                const interval = Math.max(
                                  2,
                                  goal.frequency?.intervalDays || 2
                                );
                                const delta = diffDays(originDate, dStr);
                                return delta >= 0 && delta % interval === 0;
                              }
                              return isDateScheduledForGoal(goal, dStr);
                            }
                            return false;
                          })();

                          const isFlexibleFreq =
                            freqType === 'times_per_week' ||
                            freqType === 'times_per_month';

                          // Days before habit creation / outside period: completely invisible/blank
                          if (!inRange && !hasValue) {
                            return (
                              <span
                                key={dStr}
                                className={`${cellShape} bg-transparent`}
                                aria-hidden="true"
                              />
                            );
                          }

                          // Completed or partial completions ALWAYS render immediately (past, today, or future)
                          if (stats.isDone) {
                            return (
                              <button
                                key={dStr}
                                type="button"
                                onClick={(e) => handleHeatmapCellTap(goal, dStr, e)}
                                title={`${formatShortSpanishDate(dStr)} · Cumplido (100%)`}
                                aria-label={`${goal.title}, ${formatShortSpanishDate(dStr)}: cumplido al 100%`}
                                className={`${cellShape} cursor-pointer hover:opacity-85`}
                                style={{ backgroundColor: palette.fillBg }}
                              />
                            );
                          }

                          if (hasValue) {
                            const ratio = Math.min(1, Math.max(0, stats.value / stats.target));
                            const fillAlpha = Math.max(0.14, Math.min(0.94, ratio));
                            const borderAlpha = Math.max(0.28, Math.min(0.95, ratio + 0.14));
                            return (
                              <button
                                key={dStr}
                                type="button"
                                onClick={(e) => handleHeatmapCellTap(goal, dStr, e)}
                                title={`${formatShortSpanishDate(dStr)} · ${stats.pct}% (${formatQuantity(stats.value)}/${formatQuantity(stats.target)})`}
                                aria-label={`${goal.title}, ${formatShortSpanishDate(dStr)}: ${stats.pct}% completado`}
                                className={`${cellShape} cursor-pointer hover:opacity-90`}
                                style={{
                                  backgroundColor: hexToRgba(goal.colorHex || '#3B4DF5', fillAlpha),
                                  border: `1px solid ${hexToRgba(goal.colorHex || '#3B4DF5', borderAlpha)}`,
                                }}
                              />
                            );
                          }

                          // Future days inside habit range: visible white bordered square if scheduled/flexible, blank if unscheduled
                          if (isFuture) {
                            if (!wasScheduled && !isFlexibleFreq) {
                              return (
                                <span
                                  key={dStr}
                                  className={`${cellShape} bg-transparent`}
                                  aria-hidden="true"
                                />
                              );
                            }
                            return (
                              <span
                                key={dStr}
                                title={`${formatShortSpanishDate(dStr)} · Día por venir`}
                                className={`${cellShape} bg-white border border-slate-300/90`}
                                aria-hidden="true"
                              />
                            );
                          }

                          if (dStr === todayStr && (wasScheduled || isFlexibleFreq)) {
                            return (
                              <button
                                key={dStr}
                                type="button"
                                onClick={(e) => handleHeatmapCellTap(goal, dStr, e)}
                                title={`${formatShortSpanishDate(dStr)} · Hoy pendiente`}
                                aria-label={`${goal.title}, hoy pendiente`}
                                className={`${cellShape} bg-slate-100 border border-slate-300 hover:border-slate-400 cursor-pointer`}
                              />
                            );
                          }

                          // Flexible weekly/monthly past days inside active range: visible white bordered box (not missed rose outline)
                          if (isFlexibleFreq && inRange) {
                            return (
                              <button
                                key={dStr}
                                type="button"
                                onClick={(e) => handleHeatmapCellTap(goal, dStr, e)}
                                title={`${formatShortSpanishDate(dStr)} · Sin registro (tocar para marcar)`}
                                aria-label={`${goal.title}, ${formatShortSpanishDate(dStr)}: sin registro`}
                                className={`${cellShape} bg-white border border-slate-300/90 hover:border-slate-400 cursor-pointer`}
                              />
                            );
                          }

                          // Unscheduled day within active range (past or today): completely blank visually, still clickable to log make-up day
                          if (!wasScheduled) {
                            return (
                              <button
                                key={dStr}
                                type="button"
                                onClick={(e) => handleHeatmapCellTap(goal, dStr, e)}
                                title={`${formatShortSpanishDate(dStr)} · No programado (tocar para registrar)`}
                                aria-label={`${goal.title}, ${formatShortSpanishDate(dStr)}: no programado, tocar para registrar`}
                                className={`${cellShape} bg-transparent border border-transparent hover:border-slate-300 hover:bg-slate-50 cursor-pointer`}
                              />
                            );
                          }

                          return (
                            <button
                              key={dStr}
                              type="button"
                              onClick={(e) => handleHeatmapCellTap(goal, dStr, e)}
                              title={`${formatShortSpanishDate(dStr)} · Sin registro (tocar para marcar)`}
                              aria-label={`${goal.title}, ${formatShortSpanishDate(dStr)}: sin registro`}
                              className={`${cellShape} border-[1.5px] border-rose-400/85 bg-transparent hover:bg-rose-50/40 cursor-pointer`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Progress Line ("1 / 10 días   2%") and Bar with Actual (top) & Esperado (bottom) Pins */}
              <button
                type="button"
                onClick={() => onInspectGoal(goal.id)}
                className="w-full text-left mt-3.5 block"
              >
                <div className="flex items-baseline justify-between gap-2 mb-1.5 tabular-nums">
                  <div className="text-xs sm:text-[13px] text-slate-500">
                    <span className="font-bold text-slate-900">
                      {Math.round(progress.completedDaysEquivalent)}
                    </span>{' '}
                    / {progress.totalScheduledDays} días
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-400">
                    {Math.round(progress.actualPct)}%
                  </span>
                </div>

                {(() => {
                  const actualBarPct = Math.min(100, Math.max(0, progress.actualPct));
                  const expectedBarPct = Math.min(100, Math.max(0, progress.expectedPct));
                  const actualPinPct = Math.min(98, Math.max(2, actualBarPct));
                  const expectedPinPct = Math.min(98, Math.max(2, expectedBarPct));
                  const actualLeftLabelPct = Math.min(92, Math.max(8, actualPinPct));
                  const expectedLeftLabelPct = Math.min(92, Math.max(8, expectedPinPct));

                  return (
                    <div>
                      {/* Top Marker Label ("Actual") with clear gap above the pin circle */}
                      <div className="relative h-4 mb-4 text-[11px] leading-none select-none">
                        <span
                          className="absolute top-0 -translate-x-1/2 font-semibold text-slate-900 whitespace-nowrap"
                          style={{ left: `${actualLeftLabelPct}%` }}
                        >
                          Actual
                        </span>
                      </div>

                      <div className="relative h-2.5 rounded-full bg-slate-100 overflow-visible">
                        {/* Subtle ghost fill up to Expected progress */}
                        {expectedBarPct > 0 && (
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-slate-200/85 transition-[width] duration-200"
                            style={{ width: `${expectedBarPct}%` }}
                            aria-hidden="true"
                          />
                        )}

                        {/* Actual progress fill */}
                        {actualBarPct > 0 && (
                          <div
                            className="relative z-10 h-full rounded-full transition-[width] duration-200"
                            style={{
                              width: `${actualBarPct}%`,
                              backgroundColor: palette.fillBg,
                            }}
                          />
                        )}

                        {/* Esperado Pin */}
                        <div
                          className="absolute -top-1 -bottom-1 w-[2.5px] -translate-x-1/2 rounded-full bg-slate-400 ring-2 ring-white z-20 pointer-events-none"
                          style={{ left: `${expectedPinPct}%` }}
                          title={`Avance esperado hoy: ${Math.round(progress.expectedPct)}%`}
                        >
                          <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-slate-400 ring-2 ring-white" />
                        </div>

                        {/* Actual Pin */}
                        <div
                          className="absolute -top-1 -bottom-1 w-[2.5px] -translate-x-1/2 rounded-full ring-2 ring-white z-30 pointer-events-none"
                          style={{
                            left: `${actualPinPct}%`,
                            backgroundColor: palette.fillBg,
                          }}
                          title={`Avance actual: ${Math.round(progress.actualPct)}%`}
                        >
                          <span
                            className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ring-2 ring-white"
                            style={{ backgroundColor: palette.fillBg }}
                          />
                        </div>
                      </div>

                      {/* Bottom Marker Label ("Esperado") */}
                      <div className="relative h-4 mt-2.5 text-[11px] leading-none select-none">
                        <span
                          className="absolute bottom-0 -translate-x-1/2 font-medium text-slate-400 whitespace-nowrap"
                          style={{ left: `${expectedLeftLabelPct}%` }}
                        >
                          Esperado
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </button>
            </article>
          );
        })}
      </div>

      {/* Discreet Archived Phases Toggle at Bottom */}
      {archivedGoals.length > 0 && (
        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="w-full px-4 py-3 rounded-2xl bg-white/80 border border-slate-200/80 hover:bg-white flex items-center justify-between text-xs font-semibold text-slate-600 transition-colors"
          >
            <span className="inline-flex items-center gap-2">
              <Archive className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <span>Archivados ({archivedGoals.length})</span>
            </span>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform ${
                showArchived ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          {showArchived && (
            <div className="space-y-2">
              {archivedGoals.map((goal) => {
                const progress = calculateGoalProgress(goal, now);
                return (
                  <div
                    key={goal.id}
                    className="w-full bg-white/75 hover:bg-white rounded-2xl border border-slate-200/70 p-3.5 flex items-center justify-between gap-2.5 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onInspectGoal(goal.id)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      <GoalIconBadge
                        iconType={goal.iconType || 'icon'}
                        iconValue={goal.iconValue || 'activity'}
                        colorHex={goal.colorHex || '#3B4DF5'}
                        sizeClass="w-9 h-9"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-700 truncate">
                          {goal.title}
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          Fase {goal.phaseNumber || 1} · {Math.round(progress.actualPct)}% completado
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      {onOpenHabitStats && (
                        <button
                          type="button"
                          onClick={() => onOpenHabitStats(goal)}
                          aria-label={`Estadísticas detalladas de ${goal.title}`}
                          title="Estadísticas detalladas"
                          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-indigo-50 text-slate-500 hover:text-[#3B4DF5] flex items-center justify-center transition-colors"
                        >
                          <BarChart2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onInspectGoal(goal.id)}
                        aria-label={`Abrir detalle de ${goal.title}`}
                        className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
                      >
                        <ChevronRight className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
