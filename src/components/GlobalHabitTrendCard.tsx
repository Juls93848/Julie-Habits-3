import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarRange, Check, ChevronDown, TrendingDown, TrendingUp } from 'lucide-react';
import { DailyQuizResponse, Goal, WeeklyStatsMode } from '../types/tracker';
import { hexToRgba } from '../utils/colorAndIcons';
import {
  addDays,
  diffDays,
  formatShortSpanishDate,
  getDayCompletionStats,
  getGoalOriginDateStr,
  getMondayOfWeek,
  isDateScheduledForGoal,
  parseLocalDate,
  toLocalDateStr,
} from '../utils/paceEngine';

export type TrendPeriodMode = 'week' | 'month' | 'custom';

interface GlobalHabitTrendCardProps {
  goals: Goal[];
  todayStr: string;
  dailyQuizLogs: Record<string, DailyQuizResponse>;
  anchorMonth?: { year: number; month: number };
  weeklyStatsMode?: WeeklyStatsMode;
  onChangeWeeklyStatsMode?: (mode: WeeklyStatsMode) => void;
  selectedSeriesGoalId?: string | null;
  onChangeSeriesGoalId?: (goalId: string | null) => void;
  embedded?: boolean;
}

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

function getGoalInRangeOnDate(goal: Goal, dStr: string): boolean {
  const origin = getGoalOriginDateStr(goal);
  if (goal.isPermanent) {
    return dStr >= origin;
  }
  if (dStr >= origin && dStr <= goal.deadlineDate) return true;
  if (
    goal.phaseHistory?.some(
      (rec) => dStr >= rec.startDate && dStr <= rec.deadlineDate
    )
  ) {
    return true;
  }
  return false;
}

function isGoalScheduledForTrend(goal: Goal, dStr: string): boolean {
  const freq = goal.frequency || { type: 'everyday' };
  const origin = getGoalOriginDateStr(goal);
  if (dStr < origin) return false;
  if (!goal.isPermanent && dStr > goal.deadlineDate) return false;

  if (freq.type === 'everyday') return true;
  if (freq.type === 'specific_days') {
    const weekdays =
      freq.weekdays && freq.weekdays.length > 0 ? freq.weekdays : [1, 2, 3, 4, 5];
    return weekdays.includes(parseLocalDate(dStr).getDay());
  }
  if (freq.type === 'every_n_days') {
    const interval = Math.max(2, freq.intervalDays || 2);
    const delta = diffDays(origin, dStr);
    return delta >= 0 && delta % interval === 0;
  }
  return isDateScheduledForGoal(goal, dStr);
}

/**
 * Generates a smooth Catmull-Rom cubic Bezier curve clamped to [minY, maxY]
 * so spline hills never overshoot below 0% or above 100%.
 */
function buildClampedSmoothSpline(
  points: Array<{ x: number; y: number }>,
  minY: number,
  maxY: number
): { linePath: string; areaPath: string } {
  if (points.length === 0) return { linePath: '', areaPath: '' };
  if (points.length === 1) {
    const p = points[0];
    return {
      linePath: `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      areaPath: '',
    };
  }

  const clampY = (val: number) => Math.max(minY, Math.min(maxY, val));
  const parts: string[] = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = clampY(p2.y - (p3.y - p1.y) / 6);

    parts.push(
      `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(
        1
      )}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
    );
  }

  const linePath = parts.join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = `${linePath} L ${last.x.toFixed(1)} ${maxY.toFixed(
    1
  )} L ${first.x.toFixed(1)} ${maxY.toFixed(1)} Z`;

  return { linePath, areaPath };
}

export const GlobalHabitTrendCard: React.FC<GlobalHabitTrendCardProps> = ({
  goals,
  todayStr,
  dailyQuizLogs,
  anchorMonth,
  weeklyStatsMode = 'full_week',
  onChangeWeeklyStatsMode,
  selectedSeriesGoalId: controlledSeriesGoalId,
  onChangeSeriesGoalId,
  embedded = false,
}) => {
  const gradId = useId().replace(/:/g, '');
  const activeGoals = useMemo(
    () => goals.filter((g) => !g.isArchived),
    [goals]
  );

  // Always preselected to Monthly ('month') as requested
  const [periodMode, setPeriodMode] = useState<TrendPeriodMode>('month');
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [customStart, setCustomStart] = useState<string>(() =>
    addDays(todayStr, -29)
  );
  const [customEnd, setCustomEnd] = useState<string>(todayStr);

  // null = Promedio global, otherwise goal.id for single habit spline
  const [internalSeriesGoalId, setInternalSeriesGoalId] = useState<string | null>(
    null
  );
  const selectedSeriesGoalId =
    controlledSeriesGoalId !== undefined
      ? controlledSeriesGoalId
      : internalSeriesGoalId;
  const updateSeriesGoalId = (nextId: string | null) => {
    setInternalSeriesGoalId(nextId);
    onChangeSeriesGoalId?.(nextId);
  };
  const [selectedBucketIdx, setSelectedBucketIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!periodDropdownOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPeriodDropdownOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPeriodDropdownOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [periodDropdownOpen]);

  const effectiveSeriesGoal = useMemo(
    () =>
      selectedSeriesGoalId
        ? activeGoals.find((g) => g.id === selectedSeriesGoalId) || null
        : null,
    [activeGoals, selectedSeriesGoalId]
  );

  // Build adaptive buckets for Semanal / Mensual / Periodo personalizado
  const trendData = useMemo(() => {
    interface BucketMeta {
      key: string;
      label: string;
      fullLabel: string;
      dates: string[];
      globalPct: number | null;
      lowEnergyCount: number;
      saturationCount: number;
      perGoalPct: Record<string, number | null>;
    }

    let rangeStart = addDays(todayStr, -29);
    let rangeEnd = todayStr;

    if (periodMode === 'week') {
      if (weeklyStatsMode === 'full_week') {
        const monday = getMondayOfWeek(todayStr);
        rangeStart = monday;
        rangeEnd = addDays(monday, 6);
      } else {
        rangeStart = addDays(todayStr, -6);
        rangeEnd = todayStr;
      }
    } else if (periodMode === 'month') {
      if (anchorMonth) {
        const y = anchorMonth.year;
        const m = anchorMonth.month;
        const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        const monthLastDay = toLocalDateStr(new Date(y, m + 1, 0));
        const currentMonthPrefix = todayStr.slice(0, 7);
        const targetPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;
        rangeStart = monthStart;
        rangeEnd =
          targetPrefix === currentMonthPrefix
            ? todayStr
            : monthLastDay > todayStr
            ? todayStr
            : monthLastDay;
        // If current month just started (< 4 days), show rolling 30 days ending today so curve has depth
        if (diffDays(rangeStart, rangeEnd) < 3) {
          rangeStart = addDays(todayStr, -29);
          rangeEnd = todayStr;
        }
      } else {
        rangeStart = addDays(todayStr, -29);
        rangeEnd = todayStr;
      }
    } else {
      const a = customStart || addDays(todayStr, -29);
      const b = customEnd || todayStr;
      rangeStart = a <= b ? a : b;
      rangeEnd = a <= b ? b : a;
    }

    const totalSpanDays = Math.max(1, diffDays(rangeStart, rangeEnd) + 1);
    const chunkSize =
      totalSpanDays <= 10
        ? 1
        : totalSpanDays <= 21
        ? 3
        : totalSpanDays <= 45
        ? 5
        : totalSpanDays <= 120
        ? 7
        : Math.max(10, Math.ceil(totalSpanDays / 10));

    const buckets: BucketMeta[] = [];
    let cursor = rangeStart;
    let guard = 0;

    while (cursor <= rangeEnd && guard < 40) {
      const chunkEndCandidate = addDays(cursor, chunkSize - 1);
      const chunkEnd = chunkEndCandidate <= rangeEnd ? chunkEndCandidate : rangeEnd;
      const dates: string[] = [];
      let dCursor = cursor;
      let dGuard = 0;
      while (dCursor <= chunkEnd && dGuard < 60) {
        if (dCursor <= todayStr) {
          dates.push(dCursor);
        }
        dCursor = addDays(dCursor, 1);
        dGuard += 1;
      }

      const startDt = parseLocalDate(cursor);
      const label = `${startDt.getDate()} ${MONTH_SHORT_CAP[startDt.getMonth()]}`;
      const fullLabel =
        cursor === chunkEnd
          ? formatShortSpanishDate(cursor)
          : `${formatShortSpanishDate(cursor)} – ${formatShortSpanishDate(chunkEnd)}`;

      let sumGoalPcts = 0;
      let activeInBucket = 0;
      let lowEnergyCount = 0;
      let saturationCount = 0;
      const perGoalPct: Record<string, number | null> = {};

      for (const d of dates) {
        const dQuiz = dailyQuizLogs[d];
        if (dQuiz?.energyLevel === 'low' || dQuiz?.obstacle === 'energy_mood') {
          lowEnergyCount += 1;
        }
        if (
          dQuiz?.obstacle === 'mental_saturation' ||
          dQuiz?.obstacle === 'friction_time' ||
          dQuiz?.frictionTags?.includes('tight_time')
        ) {
          saturationCount += 1;
        }
      }

      for (const g of activeGoals) {
        let gSched = 0;
        let gComp = 0;
        let inRangeDays = 0;
        const freqType = g.frequency?.type || 'everyday';

        for (const d of dates) {
          if (!getGoalInRangeOnDate(g, d)) continue;
          inRangeDays += 1;
          const stats = getDayCompletionStats(g, d);

          if (freqType === 'specific_days' || freqType === 'every_n_days') {
            if (isGoalScheduledForTrend(g, d)) gSched += 1;
            if (stats.value > 0) gComp += Math.min(1, stats.value / stats.target);
          } else if (freqType === 'everyday') {
            gSched += 1;
            gComp += Math.min(1, stats.value / stats.target);
          } else {
            if (stats.value > 0) gComp += Math.min(1, stats.value / stats.target);
          }

          const gQuiz = g.quizLogs?.[d];
          if (gQuiz?.energyLevel === 'low' || gQuiz?.obstacle === 'energy_mood') {
            lowEnergyCount += 1;
          }
          if (
            gQuiz?.obstacle === 'mental_saturation' ||
            gQuiz?.obstacle === 'friction_time' ||
            gQuiz?.frictionTags?.includes('tight_time')
          ) {
            saturationCount += 1;
          }
        }

        if (inRangeDays > 0) {
          if (freqType === 'times_per_week') {
            gSched = Math.max(
              1,
              Math.min(inRangeDays, Math.round(((g.frequency.count || 3) / 7) * inRangeDays))
            );
          } else if (freqType === 'times_per_month') {
            gSched = Math.max(
              1,
              Math.min(inRangeDays, Math.round(((g.frequency.count || 10) / 30) * inRangeDays))
            );
          }
        }

        if (gSched > 0) {
          const pct = Math.min(100, Math.round((gComp / gSched) * 100));
          perGoalPct[g.id] = pct;
          sumGoalPcts += pct;
          activeInBucket += 1;
        } else if (gComp > 0) {
          const pct = 100;
          perGoalPct[g.id] = pct;
          sumGoalPcts += pct;
          activeInBucket += 1;
        } else {
          perGoalPct[g.id] = null;
        }
      }

      buckets.push({
        key: cursor,
        label,
        fullLabel,
        dates,
        globalPct:
          activeInBucket > 0 ? Math.round(sumGoalPcts / activeInBucket) : null,
        lowEnergyCount,
        saturationCount,
        perGoalPct,
      });

      cursor = addDays(chunkEnd, 1);
      guard += 1;
    }

    const getSeriesVal = (b: BucketMeta): number | null =>
      effectiveSeriesGoal ? b.perGoalPct[effectiveSeriesGoal.id] ?? null : b.globalPct;

    const validBuckets = buckets
      .map((b, idx) => ({ ...b, idx, seriesPct: getSeriesVal(b) }))
      .filter((b) => b.seriesPct !== null);

    const bestBucket =
      validBuckets.length > 0
        ? [...validBuckets].sort((a, b) => (b.seriesPct || 0) - (a.seriesPct || 0))[0]
        : null;
    const dipBucket =
      validBuckets.length > 1
        ? [...validBuckets].sort((a, b) => (a.seriesPct || 0) - (b.seriesPct || 0))[0]
        : null;

    const defaultIdx =
      validBuckets.length > 0
        ? validBuckets[validBuckets.length - 1].idx
        : Math.max(0, buckets.length - 1);

    return {
      buckets,
      bestBucket,
      dipBucket,
      defaultIdx,
    };
  }, [
    activeGoals,
    periodMode,
    weeklyStatsMode,
    anchorMonth,
    customStart,
    customEnd,
    todayStr,
    dailyQuizLogs,
    effectiveSeriesGoal,
  ]);

  const effectiveBucketIdx =
    selectedBucketIdx !== null &&
    selectedBucketIdx >= 0 &&
    selectedBucketIdx < trendData.buckets.length
      ? selectedBucketIdx
      : trendData.defaultIdx;
  const activeBucket = trendData.buckets[effectiveBucketIdx];

  const seriesColor = effectiveSeriesGoal?.colorHex || '#3B4DF5';

  // SVG Geometry
  const chartGeom = useMemo(() => {
    const width = 620;
    const height = 216;
    const padL = 38;
    const padR = 16;
    const padT = 18;
    const padB = 28;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const n = trendData.buckets.length;

    const getX = (idx: number) =>
      n <= 1 ? padL + innerW / 2 : padL + (idx / (n - 1)) * innerW;
    const getY = (pct: number) =>
      padT + innerH - (Math.min(100, Math.max(0, pct)) / 100) * innerH;

    const points: Array<{ x: number; y: number; idx: number; pct: number }> = [];
    trendData.buckets.forEach((b, idx) => {
      const val = effectiveSeriesGoal
        ? b.perGoalPct[effectiveSeriesGoal.id]
        : b.globalPct;
      if (val !== null && val !== undefined) {
        points.push({ x: getX(idx), y: getY(val), idx, pct: val });
      }
    });

    const { linePath, areaPath } = buildClampedSmoothSpline(
      points,
      padT,
      padT + innerH
    );

    return {
      width,
      height,
      padL,
      padR,
      padT,
      padB,
      innerH,
      getX,
      getY,
      points,
      linePath,
      areaPath,
    };
  }, [trendData.buckets, effectiveSeriesGoal]);

  const periodOptionLabels: Record<TrendPeriodMode, string> = {
    week: 'Semanal',
    month: 'Mensual',
    custom: 'Personalizado',
  };

  const labelStep = trendData.buckets.length > 8 ? 2 : 1;

  const activeSeriesPct = activeBucket
    ? effectiveSeriesGoal
      ? activeBucket.perGoalPct[effectiveSeriesGoal.id] ?? null
      : activeBucket.globalPct
    : null;

  const WrapperTag = embedded ? 'div' : 'section';
  const wrapperClass = embedded
    ? 'space-y-4'
    : 'bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-4';

  return (
    <WrapperTag className={wrapperClass}>
      {/* Header + Dropdown Period Selector (Default: Mensual) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {embedded ? (
          <p className="text-xs text-slate-500 min-w-0 flex-1">
            Cruce de todos tus hábitos para detectar semanas pico o caídas por saturación.
          </p>
        ) : (
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
              Tendencia global de hábitos
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cruce de todos tus hábitos para detectar semanas pico o caídas por saturación.
            </p>
          </div>
        )}

        <div ref={dropdownRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setPeriodDropdownOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={periodDropdownOpen}
            aria-label="Seleccionar periodo de estadísticas"
            className="h-10 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200/90 text-xs font-semibold text-slate-800 inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <span>{periodOptionLabels[periodMode]}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                periodDropdownOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          {periodDropdownOpen && (
            <div
              role="listbox"
              aria-label="Periodo de gráfica"
              className="absolute right-0 mt-1.5 w-48 rounded-2xl bg-white border border-slate-200 shadow-xl py-1.5 z-30"
            >
              {(
                [
                  { id: 'week', label: 'Semanal', hint: weeklyStatsMode === 'full_week' ? 'Semana completa' : 'Últimos 7 días' },
                  { id: 'month', label: 'Mensual', hint: 'Vista del mes' },
                  { id: 'custom', label: 'Periodo manual', hint: 'Elegir fechas' },
                ] as const
              ).map((opt) => {
                const selected = periodMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setPeriodMode(opt.id);
                      setSelectedBucketIdx(null);
                      setPeriodDropdownOpen(false);
                    }}
                    className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left transition-colors ${
                      selected
                        ? 'bg-indigo-50/70 text-[#3B4DF5]'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">{opt.label}</div>
                      <div className="text-[10px] text-slate-400">{opt.hint}</div>
                    </div>
                    {selected && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Weekly Window Toggle (Últimos 7 días vs Semana completa) Synced with Settings */}
      {periodMode === 'week' && onChangeWeeklyStatsMode && (
        <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/80 gap-1">
          {(
            [
              { id: 'last_7', label: 'Últimos 7 días' },
              { id: 'full_week', label: 'Semana completa' },
            ] as const
          ).map((opt) => {
            const active = weeklyStatsMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChangeWeeklyStatsMode(opt.id);
                  setSelectedBucketIdx(null);
                }}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Custom Date Range Inputs (when Periodo personalizado is active) */}
      {periodMode === 'custom' && (
        <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <CalendarRange className="w-4 h-4 text-[#3B4DF5]" aria-hidden="true" />
            <span>Rango manual</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 flex-1 min-w-[130px]">
              <span className="text-[11px] font-medium text-slate-500">Desde</span>
              <input
                type="date"
                value={customStart}
                max={todayStr}
                onChange={(e) => {
                  if (e.target.value) {
                    setCustomStart(e.target.value);
                    setSelectedBucketIdx(null);
                  }
                }}
                className="flex-1 h-9 px-2.5 rounded-lg border border-slate-200 bg-white font-mono text-xs text-slate-900"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 flex-1 min-w-[130px]">
              <span className="text-[11px] font-medium text-slate-500">Hasta</span>
              <input
                type="date"
                value={customEnd}
                max={todayStr}
                onChange={(e) => {
                  if (e.target.value) {
                    setCustomEnd(e.target.value);
                    setSelectedBucketIdx(null);
                  }
                }}
                className="flex-1 h-9 px-2.5 rounded-lg border border-slate-200 bg-white font-mono text-xs text-slate-900"
              />
            </label>
          </div>
        </div>
      )}

      {activeGoals.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">
          Crea al menos un hábito para visualizar tendencias globales.
        </div>
      ) : (
        <>
          {/* Smooth Area Spline Chart + Meta Line (Photo 2 adapted to Ritmo Light) */}
          <div className="w-full overflow-hidden">
            <svg
              viewBox={`0 0 ${chartGeom.width} ${chartGeom.height}`}
              className="w-full h-auto select-none"
              role="img"
              aria-label="Gráfica de tendencia global con línea meta al 80%"
            >
              <defs>
                <linearGradient id={`trend-area-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={seriesColor} stopOpacity="0.32" />
                  <stop offset="75%" stopColor={seriesColor} stopOpacity="0.08" />
                  <stop offset="100%" stopColor={seriesColor} stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Y-Axis Guides (0%, 50%, 100%) */}
              {[0, 50, 100].map((val) => {
                const y = chartGeom.getY(val);
                return (
                  <g key={val}>
                    <line
                      x1={chartGeom.padL}
                      x2={chartGeom.width - chartGeom.padR}
                      y1={y}
                      y2={y}
                      stroke="#E2E8F0"
                      strokeWidth="1"
                    />
                    <text
                      x={chartGeom.padL - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      fill="#94A3B8"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {val}%
                    </text>
                  </g>
                );
              })}

              {/* 80% Dashed Meta Line */}
              {(() => {
                const metaY = chartGeom.getY(80);
                return (
                  <g>
                    <line
                      x1={chartGeom.padL}
                      x2={chartGeom.width - chartGeom.padR}
                      y1={metaY}
                      y2={metaY}
                      stroke="#94A3B8"
                      strokeWidth="1.2"
                      strokeDasharray="5 5"
                    />
                    <text
                      x={chartGeom.padL + 6}
                      y={metaY - 5}
                      fill="#64748B"
                      fontSize="10"
                      fontWeight="500"
                    >
                      meta line
                    </text>
                  </g>
                );
              })()}

              {/* Selected Vertical Cursor */}
              {activeBucket && (
                <line
                  x1={chartGeom.getX(effectiveBucketIdx)}
                  x2={chartGeom.getX(effectiveBucketIdx)}
                  y1={chartGeom.padT}
                  y2={chartGeom.padT + chartGeom.innerH}
                  stroke="#CBD5E1"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                />
              )}

              {/* Gradient Area Under Curve */}
              {chartGeom.areaPath && (
                <path
                  d={chartGeom.areaPath}
                  fill={`url(#trend-area-${gradId})`}
                />
              )}

              {/* Smooth Spline Stroke */}
              {chartGeom.linePath && (
                <path
                  d={chartGeom.linePath}
                  fill="none"
                  stroke={seriesColor}
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Active Point Marker + Single-Point Fallback */}
              {chartGeom.points.map((pt) => {
                const isActive = pt.idx === effectiveBucketIdx;
                if (!isActive && chartGeom.points.length > 1) return null;
                return (
                  <circle
                    key={pt.idx}
                    cx={pt.x}
                    cy={pt.y}
                    r={isActive ? 5 : 3.5}
                    fill={seriesColor}
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                );
              })}

              {/* X-Axis Labels + Interactive Hit Columns */}
              {trendData.buckets.map((bucket, idx) => {
                const x = chartGeom.getX(idx);
                const colWidth =
                  trendData.buckets.length > 1
                    ? (chartGeom.width - chartGeom.padL - chartGeom.padR) /
                      (trendData.buckets.length - 1)
                    : 60;
                const showLabel =
                  idx === 0 ||
                  idx === trendData.buckets.length - 1 ||
                  idx % labelStep === 0;

                return (
                  <g key={bucket.key}>
                    {showLabel && (
                      <text
                        x={x}
                        y={chartGeom.height - 6}
                        textAnchor="middle"
                        fill={idx === effectiveBucketIdx ? '#0F172A' : '#94A3B8'}
                        fontWeight={idx === effectiveBucketIdx ? '700' : '500'}
                        fontSize="10"
                      >
                        {bucket.label}
                      </text>
                    )}
                    <rect
                      x={x - colWidth / 2}
                      y={0}
                      width={colWidth}
                      height={chartGeom.height}
                      fill="transparent"
                      className="cursor-pointer"
                      onClick={() => setSelectedBucketIdx(idx)}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Series Selector Tabs (Promedio global | Habit 1 | Habit 2...) */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={() => updateSeriesGoalId(null)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                selectedSeriesGoalId === null
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Promedio global
            </button>

            {activeGoals.map((g) => {
              const isSelected = selectedSeriesGoalId === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() =>
                    updateSeriesGoalId(isSelected ? null : g.id)
                  }
                  className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors truncate max-w-[160px] ${
                    isSelected
                      ? 'text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  style={
                    isSelected
                      ? { backgroundColor: g.colorHex || '#3B4DF5' }
                      : undefined
                  }
                >
                  {g.title}
                </button>
              );
            })}
          </div>

          {/* Snapshot Card Below Chart (Matching Photo 2 Bottom Summary) */}
          {activeBucket && (
            <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-900">
                  {activeBucket.fullLabel}
                </span>
                <span
                  className="font-mono text-sm font-bold tabular-nums shrink-0"
                  style={{ color: seriesColor }}
                >
                  {activeSeriesPct !== null
                    ? `${effectiveSeriesGoal ? effectiveSeriesGoal.title : 'Global'}: ${activeSeriesPct}%`
                    : 'Sin actividad'}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 tabular-nums">
                {activeGoals.map((g) => {
                  const pct = activeBucket.perGoalPct[g.id];
                  if (pct === null || pct === undefined) return null;
                  const gColor = g.colorHex || '#3B4DF5';
                  return (
                    <span
                      key={g.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-800 border"
                      style={{
                        backgroundColor: hexToRgba(gColor, 0.08),
                        borderColor: hexToRgba(gColor, 0.2),
                      }}
                    >
                      <span className="truncate max-w-[130px]">{g.title}:</span>
                      <strong className="font-mono font-bold text-slate-900">
                        {pct}%
                      </strong>
                    </span>
                  );
                })}
              </div>

              {trendData.bestBucket && trendData.dipBucket && (
                <div className="pt-2 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 tabular-nums">
                  <span className="inline-flex items-center gap-1.5">
                    <TrendingUp
                      className="w-3.5 h-3.5 text-emerald-600 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      Pico:{' '}
                      <strong className="text-slate-900">
                        {trendData.bestBucket.fullLabel}
                      </strong>{' '}
                      ({trendData.bestBucket.seriesPct}%)
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <TrendingDown
                      className="w-3.5 h-3.5 text-rose-500 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      Caída:{' '}
                      <strong className="text-slate-900">
                        {trendData.dipBucket.fullLabel}
                      </strong>{' '}
                      ({trendData.dipBucket.seriesPct}%
                      {trendData.dipBucket.lowEnergyCount > 0 ||
                      trendData.dipBucket.saturationCount > 0
                        ? ' · baja energía/saturación'
                        : ''}
                      )
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </WrapperTag>
  );
};
