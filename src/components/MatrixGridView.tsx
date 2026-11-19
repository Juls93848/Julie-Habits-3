import React, { useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Goal, GridDaysMode } from '../types/tracker';
import { getGoalPalette, GoalIconBadge } from '../utils/colorAndIcons';
import {
  addDays,
  formatQuantity,
  formatShortSpanishDate,
  formatUpperSpanishDate,
  getDayCompletionStats,
  getMondayOfWeek,
  getSpanishWeekday2,
  isDateScheduledForGoal,
  isDateWithinGoal,
  toLocalDateStr,
} from '../utils/paceEngine';

interface MatrixGridViewProps {
  goals: Goal[];
  now: Date;
  gridDaysMode: GridDaysMode;
  windowEndDate: string;
  onChangeWindowEnd: (nextEndDate: string) => void;
  onUpdateProgress: (
    goalId: string,
    dateStr: string,
    nextValue: number,
    event?: React.MouseEvent
  ) => void;
  onInspectGoal: (goalId: string) => void;
  onOpenCounterModal: (goalId: string, dateStr: string) => void;
}

export const MatrixGridView: React.FC<MatrixGridViewProps> = ({
  goals,
  now,
  gridDaysMode,
  windowEndDate,
  onChangeWindowEnd,
  onUpdateProgress,
  onInspectGoal,
  onOpenCounterModal,
}) => {
  const todayStr = toLocalDateStr(now);

  const visibleDays = useMemo(() => {
    if (gridDaysMode === 'week_monday') {
      const monday = getMondayOfWeek(windowEndDate);
      return [0, 1, 2, 3, 4, 5, 6].map((offset) => addDays(monday, offset));
    }
    if (gridDaysMode === 'last_7') {
      return [-6, -5, -4, -3, -2, -1, 0].map((offset) => addDays(windowEndDate, offset));
    }
    return [-4, -3, -2, -1, 0].map((offset) => addDays(windowEndDate, offset));
  }, [gridDaysMode, windowEndDate]);

  const isSevenCols = visibleDays.length === 7;
  const stepDays = gridDaysMode === 'week_monday' ? 7 : 1;

  const isCurrentWindow = useMemo(() => {
    if (gridDaysMode === 'week_monday') {
      return getMondayOfWeek(windowEndDate) === getMondayOfWeek(todayStr);
    }
    return windowEndDate === todayStr;
  }, [gridDaysMode, windowEndDate, todayStr]);

  const windowLabel = useMemo(() => {
    if (!isCurrentWindow) {
      return gridDaysMode === 'week_monday' ? 'Esta semana' : 'Volver a hoy';
    }
    if (gridDaysMode === 'week_monday') return 'Esta semana';
    if (gridDaysMode === 'last_7') return 'Últimos 7 días';
    return 'Últimos 5 días';
  }, [gridDaysMode, isCurrentWindow]);

  const handleCellClick = (
    goal: Goal,
    dateStr: string,
    event: React.MouseEvent
  ) => {
    const inPhaseHistory = Boolean(
      goal.phaseHistory?.some(
        (rec) => dateStr >= rec.startDate && dateStr <= rec.deadlineDate
      )
    );
    if (!isDateWithinGoal(goal, dateStr) && !inPhaseHistory) return;

    const stats = getDayCompletionStats(goal, dateStr);

    if (goal.trackingMode === 'boolean') {
      onUpdateProgress(goal.id, dateStr, stats.isDone ? 0 : 1, event);
      return;
    }

    if (goal.tapAction === 'add_1' && stats.value < stats.target) {
      const nextVal = Number((stats.value + 1).toFixed(2));
      onUpdateProgress(goal.id, dateStr, nextVal, event);
      return;
    }

    onOpenCounterModal(goal.id, dateStr);
  };

  return (
    <div className="space-y-4">
      {/* Date Window Strip */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => onChangeWindowEnd(addDays(windowEndDate, -stepDays))}
            aria-label="Periodo anterior"
            className="w-10 h-10 rounded-full bg-white border border-slate-200/90 hover:bg-slate-50 flex items-center justify-center text-slate-700 shadow-2xs shrink-0"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => onChangeWindowEnd(todayStr)}
            className="px-3.5 sm:px-4 h-10 rounded-full bg-white border border-slate-200/90 hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-900 shadow-2xs whitespace-nowrap"
          >
            {windowLabel}
          </button>

          <button
            type="button"
            onClick={() => onChangeWindowEnd(addDays(windowEndDate, stepDays))}
            aria-label="Periodo siguiente"
            className="w-10 h-10 rounded-full bg-white border border-slate-200/90 hover:bg-slate-50 flex items-center justify-center text-slate-700 shadow-2xs shrink-0"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="font-mono text-[11px] sm:text-xs text-slate-500 tracking-wide tabular-nums whitespace-nowrap">
          {formatUpperSpanishDate(visibleDays[0])} –{' '}
          {formatUpperSpanishDate(visibleDays[visibleDays.length - 1])}
        </div>
      </div>

      {/* Ultra-Clean Minimalist Matrix Card */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-3.5 sm:px-5 pt-4 pb-2.5 flex items-end justify-between gap-2 sm:gap-3 border-b border-slate-100">
          <span className="font-mono text-[11px] font-semibold tracking-wider text-slate-400 uppercase truncate">
            {goals.length} {goals.length === 1 ? 'HÁBITO' : 'HÁBITOS'}
          </span>

          <div
            className={`grid shrink-0 ${
              isSevenCols
                ? 'grid-cols-7 gap-1 sm:gap-1.5'
                : 'grid-cols-5 gap-1.5 sm:gap-2.5'
            }`}
          >
            {visibleDays.map((dStr) => {
              const isToday = dStr === todayStr;
              const dayNum = Number(dStr.split('-')[2]);
              return (
                <div
                  key={dStr}
                  className={`${
                    isSevenCols ? 'w-7 sm:w-9' : 'w-10 sm:w-11'
                  } text-center leading-tight tabular-nums`}
                >
                  <div
                    className={`text-[10px] sm:text-[11px] ${
                      isToday ? 'font-semibold text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {getSpanishWeekday2(dStr)}
                  </div>
                  <div
                    className={`text-xs sm:text-sm mt-0.5 ${
                      isToday ? 'font-bold text-slate-900' : 'font-medium text-slate-500'
                    }`}
                  >
                    {dayNum}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {goals.map((goal) => {
            const palette = getGoalPalette(goal.colorHex);
            const isCounterLike = goal.trackingMode !== 'boolean';

            return (
              <div key={goal.id} className="px-3.5 sm:px-5 py-3 flex items-center justify-between gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => onInspectGoal(goal.id)}
                  className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 text-left group"
                >
                  <GoalIconBadge
                    iconType={goal.iconType || 'icon'}
                    iconValue={goal.iconValue || 'activity'}
                    colorHex={goal.colorHex || '#3B4DF5'}
                    sizeClass={isSevenCols ? 'w-9 h-9 sm:w-10 sm:h-10' : 'w-10 h-10'}
                  />

                  <span className="text-xs sm:text-[15px] font-medium text-slate-900 truncate group-hover:text-[#3B4DF5] transition-colors">
                    {goal.title}
                  </span>
                </button>

                <div
                  className={`grid shrink-0 ${
                    isSevenCols
                      ? 'grid-cols-7 gap-1 sm:gap-1.5'
                      : 'grid-cols-5 gap-1.5 sm:gap-2.5'
                  }`}
                >
                  {visibleDays.map((dStr) => {
                    const inPhaseHistory = Boolean(
                      goal.phaseHistory?.some(
                        (rec) => dStr >= rec.startDate && dStr <= rec.deadlineDate
                      )
                    );
                    const inRange = isDateWithinGoal(goal, dStr) || inPhaseHistory;
                    const isScheduled =
                      isDateScheduledForGoal(goal, dStr) || inPhaseHistory;
                    const stats = getDayCompletionStats(goal, dStr);
                    const isPartial = stats.value > 0 && !stats.isDone;

                    const shapeClass = stats.isDone
                      ? isSevenCols
                        ? 'rounded-lg sm:rounded-xl'
                        : 'rounded-xl'
                      : isCounterLike
                      ? 'rounded-full'
                      : isSevenCols
                      ? 'rounded-lg sm:rounded-xl'
                      : 'rounded-xl';

                    const cellSize = isSevenCols
                      ? `w-7 h-7 sm:w-9 sm:h-9 ${shapeClass}`
                      : `w-10 h-10 sm:w-11 sm:h-11 ${shapeClass}`;

                    const blankShapeClass = isSevenCols
                      ? 'rounded-lg sm:rounded-xl'
                      : 'rounded-xl';
                    const blankCellSize = isSevenCols
                      ? `w-7 h-7 sm:w-9 sm:h-9 ${blankShapeClass}`
                      : `w-10 h-10 sm:w-11 sm:h-11 ${blankShapeClass}`;

                    if (!inRange && stats.value === 0) {
                      return (
                        <div
                          key={dStr}
                          className={`${blankCellSize} bg-transparent select-none`}
                          aria-hidden="true"
                        />
                      );
                    }

                    const isUnscheduledEmpty =
                      !isScheduled && !stats.isDone && !isPartial;

                    const cellBackground = isUnscheduledEmpty
                      ? 'transparent'
                      : stats.isDone
                      ? palette.fillBg
                      : isCounterLike
                      ? isPartial
                        ? palette.softBg
                        : 'transparent'
                      : palette.softBg;

                    const cellBorder = isUnscheduledEmpty
                      ? '1px solid transparent'
                      : stats.isDone
                      ? 'none'
                      : isCounterLike
                      ? `3px solid ${palette.border}`
                      : 'none';

                    return (
                      <button
                        key={dStr}
                        type="button"
                        onClick={(e) => handleCellClick(goal, dStr, e)}
                        aria-label={`${goal.title}, ${formatShortSpanishDate(dStr)}: ${formatQuantity(stats.value)} de ${formatQuantity(stats.target)} (${stats.pct}%)`}
                        aria-pressed={stats.isDone}
                        className={`retro-press relative overflow-hidden ${
                          isUnscheduledEmpty ? blankCellSize : cellSize
                        } flex items-center justify-center transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                          isUnscheduledEmpty ? 'hover:bg-slate-100/75 hover:border-slate-200' : ''
                        }`}
                        style={{
                          backgroundColor: cellBackground,
                          border: cellBorder,
                        }}
                      >
                        {!stats.isDone && isPartial && (
                          <span
                            className="absolute inset-x-0 bottom-0 transition-[height] duration-200"
                            style={{
                              height: `${stats.pct}%`,
                              backgroundColor: palette.fillBg,
                            }}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
