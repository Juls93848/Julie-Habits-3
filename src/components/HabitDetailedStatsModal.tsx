import React, { useMemo, useState } from 'react';
import {
  Award,
  BarChart2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Link2,
  Lock,
  PieChart,
  Star,
  Trophy,
  X,
} from 'lucide-react';
import { Goal } from '../types/tracker';
import { getGoalPalette, GoalIconBadge, hexToRgba } from '../utils/colorAndIcons';
import {
  computeHabitDetailedStats,
  formatStatValue,
  getHabitPeriodBars,
  getMonthlyDailyBars,
  STREAK_MILESTONES,
} from '../utils/habitStats';
import { formatFrequencySummary, toLocalDateStr } from '../utils/paceEngine';

interface HabitDetailedStatsModalProps {
  goal: Goal;
  now: Date;
  onClose: () => void;
  onInspectGoal?: (goalId: string, dateStr?: string) => void;
}

const MONTH_NAMES_CAP = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

interface HabitDetailedStatsContentProps {
  goal: Goal;
  now: Date;
}

export const HabitDetailedStatsContent: React.FC<HabitDetailedStatsContentProps> = ({
  goal,
  now,
}) => {
  const todayStr = toLocalDateStr(now);
  const palette = getGoalPalette(goal.colorHex);
  const accentColor = goal.colorHex || '#3B4DF5';

  const stats = useMemo(() => computeHabitDetailedStats(goal, now), [goal, now]);

  // Card 5: Daily month bar chart state
  const [dailyMonthCursor, setDailyMonthCursor] = useState<{
    year: number;
    month: number;
  }>(() => ({
    year: now.getFullYear(),
    month: now.getMonth(),
  }));

  // Card 6: Period comparison bar chart state
  const [periodGranularity, setPeriodGranularity] = useState<'week' | 'month' | 'year'>(
    'month'
  );
  const [periodMetric, setPeriodMetric] = useState<'total' | 'avg'>('total');
  const [periodYearCursor, setPeriodYearCursor] = useState<number>(() =>
    now.getFullYear()
  );

  const dailyBars = useMemo(
    () =>
      getMonthlyDailyBars(
        goal,
        dailyMonthCursor.year,
        dailyMonthCursor.month,
        todayStr
      ),
    [goal, dailyMonthCursor, todayStr]
  );

  const maxDailyBarVal = useMemo(() => {
    const vals = dailyBars.map((b) => b.value);
    return Math.max(goal.trackingMode === 'boolean' ? 1 : goal.dailyTarget || 1, ...vals, 1);
  }, [dailyBars, goal.trackingMode, goal.dailyTarget]);

  const periodData = useMemo(
    () =>
      getHabitPeriodBars(
        goal,
        periodGranularity,
        periodYearCursor,
        todayStr
      ),
    [goal, periodGranularity, periodYearCursor, todayStr]
  );

  const maxPeriodBarVal = useMemo(() => {
    const vals = periodData.bars.map((b) =>
      periodMetric === 'total' ? b.totalValue : b.avgValue
    );
    return Math.max(1, ...vals);
  }, [periodData.bars, periodMetric]);

  const shiftDailyMonth = (delta: number) => {
    const dt = new Date(dailyMonthCursor.year, dailyMonthCursor.month + delta, 1);
    setDailyMonthCursor({ year: dt.getFullYear(), month: dt.getMonth() });
  };

  // Ring geometry for Score (Puntaje del hábito)
  const ringRadius = 46;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const scoreStrokeOffset =
    ringCircumference - (Math.min(100, Math.max(0, stats.score)) / 100) * ringCircumference;

  // Donut geometry for Logrado / Fallido
  const donutRadius = 40;
  const donutStroke = 20;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const totalOutcomes = stats.donutAchieved + stats.donutFailed;
  const achievedLen =
    totalOutcomes > 0
      ? (stats.donutAchieved / totalOutcomes) * donutCircumference
      : 0;
  const failedLen =
    totalOutcomes > 0
      ? (stats.donutFailed / totalOutcomes) * donutCircumference
      : 0;

  const unitLabel =
    goal.trackingMode === 'measure' && goal.unit
      ? ` ${goal.unit}`
      : goal.trackingMode === 'counter' && goal.stepLabel
      ? ` ${goal.stepLabel}`
      : '';

  const totalsCardTitle =
    goal.trackingMode === 'boolean'
      ? `${formatStatValue(stats.totals.allTime)} totales`
      : `${formatStatValue(stats.totals.allTime)}${unitLabel} totales`;

  return (
    <div className="space-y-3.5">
      {/* 1. Puntaje del hábito */}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-3">
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: palette.softBg,
                  color: palette.iconFg,
                }}
              >
                <Trophy className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                Puntaje del hábito
              </span>
              <span className="w-8" aria-hidden="true" />
            </div>

            <div className="relative w-32 h-32 flex items-center justify-center my-1">
              <svg viewBox="0 0 112 112" className="w-full h-full -rotate-90">
                <circle
                  cx="56"
                  cy="56"
                  r={ringRadius}
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth="10"
                />
                <circle
                  cx="56"
                  cy="56"
                  r={ringRadius}
                  fill="none"
                  stroke={accentColor}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={scoreStrokeOffset}
                  className="transition-[stroke-dashoffset] duration-300"
                />
              </svg>
              <span className="absolute font-display text-3xl font-extrabold text-slate-900 tabular-nums">
                {stats.score}
              </span>
            </div>
          </section>

          {/* 2. Racha */}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-3.5">
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: palette.softBg,
                  color: palette.iconFg,
                }}
              >
                <Link2 className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                Racha
              </span>
              <span className="w-8" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-2 divide-x divide-slate-100 text-center">
              <div className="px-2">
                <div className="text-xs font-medium text-slate-500">Actual</div>
                <div
                  className="mt-1 font-display text-lg font-extrabold tabular-nums uppercase"
                  style={{ color: accentColor }}
                >
                  {stats.currentStreak}{' '}
                  {stats.currentStreak === 1 ? 'día' : 'días'}
                </div>
              </div>
              <div className="px-2">
                <div className="text-xs font-medium text-slate-500">Mejor</div>
                <div
                  className="mt-1 font-display text-lg font-extrabold tabular-nums uppercase"
                  style={{ color: accentColor }}
                >
                  {stats.bestStreak} {stats.bestStreak === 1 ? 'día' : 'días'}
                </div>
              </div>
            </div>
          </section>

          {/* 3. Totales */}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: palette.softBg,
                  color: palette.iconFg,
                }}
              >
                <BarChart2 className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                {totalsCardTitle}
              </span>
              <span className="w-8" aria-hidden="true" />
            </div>

            <div className="divide-y divide-slate-100 text-sm">
              {[
                { label: 'Esta semana', val: stats.totals.week },
                { label: 'Este mes', val: stats.totals.month },
                { label: 'Este año', val: stats.totals.year },
                { label: 'Total', val: stats.totals.allTime },
              ].map((row) => (
                <div
                  key={row.label}
                  className="py-2 flex items-center justify-between gap-2"
                >
                  <span className="text-xs sm:text-sm text-slate-600 font-medium">
                    {row.label}
                  </span>
                  <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                    {formatStatValue(row.val)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 4. Veces logrado */}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: palette.softBg,
                  color: palette.iconFg,
                }}
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                Veces logrado
              </span>
              <span className="w-8" aria-hidden="true" />
            </div>

            <div className="divide-y divide-slate-100 text-sm">
              {[
                { label: 'Esta semana', val: stats.achieved.week },
                { label: 'Este mes', val: stats.achieved.month },
                { label: 'Este año', val: stats.achieved.year },
                { label: 'Total', val: stats.achieved.allTime },
              ].map((row) => (
                <div
                  key={row.label}
                  className="py-2 flex items-center justify-between gap-2"
                >
                  <span className="text-xs sm:text-sm text-slate-600 font-medium">
                    {row.label}
                  </span>
                  <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                    {row.val}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 5. Gráfica diaria del mes */}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => shiftDailyMonth(-1)}
                aria-label="Mes anterior"
                className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
                style={{ color: accentColor }}
              >
                <ChevronLeft className="w-5 h-5" aria-hidden="true" />
              </button>

              <div className="text-center">
                <div className="font-display text-sm font-bold text-slate-900">
                  {MONTH_NAMES_CAP[dailyMonthCursor.month]}
                </div>
                <div className="text-xs text-slate-400 tabular-nums">
                  {dailyMonthCursor.year}
                </div>
              </div>

              <button
                type="button"
                onClick={() => shiftDailyMonth(1)}
                aria-label="Mes siguiente"
                className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
                style={{ color: accentColor }}
              >
                <ChevronRight className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="overflow-x-auto pb-1">
              <div className="min-w-[560px] h-40 flex items-end justify-between gap-1 pt-6 px-1">
                {dailyBars.map((bar) => {
                  const heightPct =
                    bar.value > 0
                      ? Math.max(12, Math.round((bar.value / maxDailyBarVal) * 100))
                      : 0;
                  return (
                    <div
                      key={bar.day}
                      className="flex-1 flex flex-col items-center justify-end h-full gap-1.5"
                      title={`${bar.dateStr}: ${formatStatValue(bar.value)}`}
                    >
                      <div className="flex-1 w-full flex flex-col items-center justify-end">
                        {bar.value > 0 ? (
                          <>
                            <span className="text-[9px] font-mono font-semibold text-slate-700 leading-none mb-1 tabular-nums">
                              {formatStatValue(bar.value)}
                            </span>
                            <div
                              className="w-2.5 sm:w-3 rounded-t-full transition-all duration-200"
                              style={{
                                height: `${heightPct}%`,
                                backgroundColor: bar.isDone
                                  ? '#16A34A'
                                  : accentColor,
                              }}
                            />
                          </>
                        ) : (
                          <span
                            className={`w-1 h-1 rounded-full mb-0.5 ${
                              bar.isFuture
                                ? 'bg-slate-200'
                                : bar.isScheduled
                                ? 'bg-slate-300'
                                : 'bg-slate-200/60'
                            }`}
                          />
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-mono tabular-nums ${
                          bar.dateStr === todayStr
                            ? 'font-bold text-slate-900'
                            : 'text-slate-400'
                        }`}
                      >
                        {bar.day}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 6. Gráfica anual / semanal / mensual con Total vs Promedio diario */}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setPeriodYearCursor((y) => y - 1)}
                aria-label="Año anterior"
                className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
                style={{ color: accentColor }}
              >
                <ChevronLeft className="w-5 h-5" aria-hidden="true" />
              </button>

              <div className="text-center">
                <div className="font-display text-sm font-bold text-slate-900 tabular-nums">
                  {periodData.title}
                </div>
                <div className="text-xs text-slate-500 tabular-nums">
                  {formatStatValue(periodData.totalForPeriod)} totales
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPeriodYearCursor((y) => y + 1)}
                aria-label="Año siguiente"
                className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
                style={{ color: accentColor }}
              >
                <ChevronRight className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="h-36 flex items-end justify-between gap-1.5 pt-6 px-1">
              {periodData.bars.map((bar) => {
                const metricVal =
                  periodMetric === 'total' ? bar.totalValue : bar.avgValue;
                const heightPct =
                  metricVal > 0
                    ? Math.max(10, Math.round((metricVal / maxPeriodBarVal) * 100))
                    : 0;
                return (
                  <div
                    key={bar.key}
                    className="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-1.5"
                    title={`${bar.fullLabel}: ${formatStatValue(metricVal)}`}
                  >
                    <div className="flex-1 w-full flex flex-col items-center justify-end">
                      {metricVal > 0 ? (
                        <>
                          <span className="text-[9px] font-mono font-semibold text-slate-700 leading-none mb-1 tabular-nums">
                            {formatStatValue(metricVal)}
                          </span>
                          <div
                            className="w-3 sm:w-4 rounded-t-full transition-all duration-200"
                            style={{
                              height: `${heightPct}%`,
                              backgroundColor: accentColor,
                            }}
                          />
                        </>
                      ) : (
                        <span className="w-1 h-1 rounded-full bg-slate-200 mb-0.5" />
                      )}
                    </div>
                    <span className="text-[10px] font-medium text-slate-500 truncate max-w-full">
                      {bar.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Dual segmented controls (Semana|Mes|Año + Total|Promedio diario) */}
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100">
                {(
                  [
                    { id: 'week', label: 'Semana' },
                    { id: 'month', label: 'Mes' },
                    { id: 'year', label: 'Año' },
                  ] as const
                ).map((opt) => {
                  const active = periodGranularity === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPeriodGranularity(opt.id)}
                      className={`h-9 rounded-lg text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      style={active ? { color: accentColor } : undefined}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100">
                {(
                  [
                    { id: 'total', label: 'Total' },
                    { id: 'avg', label: 'Promedio diario' },
                  ] as const
                ).map((opt) => {
                  const active = periodMetric === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPeriodMetric(opt.id)}
                      className={`h-9 rounded-lg text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      style={active ? { color: accentColor } : undefined}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 7. Logrado / Fallido */}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: palette.softBg,
                  color: palette.iconFg,
                }}
              >
                <PieChart className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                Logrado / Fallido
              </span>
              <span className="w-8" aria-hidden="true" />
            </div>

            <div className="flex flex-col items-center py-2">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg viewBox="0 0 112 112" className="w-full h-full -rotate-90">
                  <circle
                    cx="56"
                    cy="56"
                    r={donutRadius}
                    fill="none"
                    stroke="#E2E8F0"
                    strokeWidth={donutStroke}
                  />
                  {totalOutcomes > 0 && achievedLen > 0 && (
                    <circle
                      cx="56"
                      cy="56"
                      r={donutRadius}
                      fill="none"
                      stroke="#16A34A"
                      strokeWidth={donutStroke}
                      strokeDasharray={`${achievedLen} ${donutCircumference}`}
                    />
                  )}
                  {totalOutcomes > 0 && failedLen > 0 && (
                    <circle
                      cx="56"
                      cy="56"
                      r={donutRadius}
                      fill="none"
                      stroke="#E11D48"
                      strokeWidth={donutStroke}
                      strokeDasharray={`${failedLen} ${donutCircumference}`}
                      strokeDashoffset={-achievedLen}
                    />
                  )}
                </svg>
                <div className="absolute flex flex-col items-center text-center tabular-nums">
                  <span className="font-display text-xl font-extrabold text-slate-900">
                    {stats.donutAchieved}
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">
                    {totalOutcomes > 0
                      ? `${Math.round((stats.donutAchieved / totalOutcomes) * 100)}%`
                      : '0%'}
                  </span>
                </div>
              </div>

              <div className="w-full flex items-center justify-center gap-5 pt-2 text-xs font-medium text-slate-700 tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                  <span>Logrado ({stats.donutAchieved})</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
                  <span>Fallido ({stats.donutFailed})</span>
                </span>
              </div>
            </div>
          </section>

          {/* 8. Desafío de racha */}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: palette.softBg,
                  color: palette.iconFg,
                }}
              >
                <Award className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                Desafío de racha
              </span>
              <span className="w-8" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
              {STREAK_MILESTONES.map((milestone) => {
                const unlocked = stats.bestStreak >= milestone;
                return (
                  <div
                    key={milestone}
                    className={`rounded-xl border p-2.5 flex flex-col items-center justify-center text-center gap-1.5 transition-colors ${
                      unlocked
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-slate-50/50 border-slate-100 opacity-60'
                    }`}
                    style={
                      unlocked
                        ? {
                            backgroundColor: hexToRgba(accentColor, 0.08),
                            borderColor: hexToRgba(accentColor, 0.25),
                          }
                        : undefined
                    }
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        unlocked
                          ? 'bg-amber-400/20 text-amber-600'
                          : 'bg-slate-200/70 text-slate-400'
                      }`}
                    >
                      {unlocked ? (
                        <Star className="w-4 h-4 fill-amber-500 text-amber-500" aria-hidden="true" />
                      ) : (
                        <Lock className="w-4 h-4" aria-hidden="true" />
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-slate-800 tabular-nums">
                      {milestone} {milestone === 1 ? 'día' : 'días'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
    </div>
  );
};

export const HabitDetailedStatsModal: React.FC<HabitDetailedStatsModalProps> = ({
  goal,
  now,
  onClose,
  onInspectGoal,
}) => {
  const accentColor = goal.colorHex || '#3B4DF5';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="habit-stats-modal-title"
    >
      <div className="w-full max-w-lg h-[92vh] sm:h-auto sm:max-h-[90vh] bg-[#F7F7FA] rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
        {/* Sticky Modal Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-white border-b border-slate-200/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <GoalIconBadge
              iconType={goal.iconType || 'icon'}
              iconValue={goal.iconValue || 'activity'}
              colorHex={accentColor}
              sizeClass="w-10 h-10"
            />
            <div className="min-w-0">
              <h2
                id="habit-stats-modal-title"
                className="font-display text-base font-bold text-slate-900 truncate"
              >
                {goal.title}
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {goal.area || 'Personal'} · {formatFrequencySummary(goal.frequency)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onInspectGoal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onInspectGoal(goal.id);
                }}
                aria-label="Abrir calendario del hábito"
                title="Calendario y notas"
                className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors"
              >
                <Calendar className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar estadísticas"
              className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Scrollable Cards Stack (Photo 1 Anatomy in Ritmo Light Theme) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <HabitDetailedStatsContent goal={goal} now={now} />
        </div>
      </div>
    </div>
  );
};
