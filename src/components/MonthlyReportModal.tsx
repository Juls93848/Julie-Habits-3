import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Share,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  AppSettings,
  DailyQuizResponse,
  GlobalProgressSummary,
  Goal,
} from '../types/tracker';
import { GoalIconBadge } from '../utils/colorAndIcons';
import { getMascotStage, MASCOT_TRACKS } from '../utils/gamification';
import {
  buildMonthlyReport,
  formatMonthlyShareText,
  getMonthKey,
  getNextMonth,
  getPreviousMonth,
} from '../utils/monthlyReport';
import { formatQuantity, toLocalDateStr } from '../utils/paceEngine';
import { WeeklyDiagnosticBarItem } from '../utils/weeklyReport';

interface MonthlyReportModalProps {
  goals: Goal[];
  now: Date;
  settings: AppSettings;
  globalProgress: GlobalProgressSummary;
  dailyQuizLogs: Record<string, DailyQuizResponse>;
  initialYear?: number;
  initialMonth?: number; // 0-indexed
  onClose: (viewedMonthKey: string) => void;
  onInspectGoal: (goalId: string) => void;
}

type MonthlySlideKey =
  | 'anchor'
  | 'mascot'
  | 'overview'
  | 'balance'
  | 'pulse'
  | 'best'
  | 'progress'
  | 'improve'
  | 'score';

const WEEKDAY_HEADERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export const MonthlyReportModal: React.FC<MonthlyReportModalProps> = ({
  goals,
  now,
  settings,
  globalProgress,
  dailyQuizLogs,
  initialYear,
  initialMonth,
  onClose,
  onInspectGoal,
}) => {
  const todayStr = toLocalDateStr(now);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentMonthKey = getMonthKey(currentYear, currentMonth);

  const [viewYear, setViewYear] = useState<number>(initialYear ?? currentYear);
  const [viewMonth, setViewMonth] = useState<number>(initialMonth ?? currentMonth);
  const [slideIdx, setSlideIdx] = useState<number>(0);
  const [copiedFeedback, setCopiedFeedback] = useState<boolean>(false);
  const swipeOriginRef = useRef<{ x: number; y: number } | null>(null);

  const report = useMemo(
    () => buildMonthlyReport(goals, viewYear, viewMonth, todayStr, dailyQuizLogs),
    [goals, viewYear, viewMonth, todayStr, dailyQuizLogs]
  );

  const slides = useMemo<MonthlySlideKey[]>(() => {
    const list: MonthlySlideKey[] = [
      'anchor',
      'mascot',
      'overview',
      'balance',
      'pulse',
      'best',
    ];
    if (report.progressedHabits.length > 0) {
      list.push('progress');
    }
    list.push('improve', 'score');
    return list;
  }, [report.progressedHabits.length]);

  const safeSlideIdx = Math.min(slideIdx, slides.length - 1);
  const activeSlide = slides[safeSlideIdx];

  const mascotStage = useMemo(
    () => getMascotStage(settings.mascotTrackId, globalProgress.actualPct),
    [settings.mascotTrackId, globalProgress.actualPct]
  );

  const mascotTrack = MASCOT_TRACKS[settings.mascotTrackId] || MASCOT_TRACKS.horse;
  const mascotStageSpan =
    mascotStage.nextMinPct !== null
      ? Math.max(1, mascotStage.nextMinPct - mascotStage.minPct)
      : 100;
  const mascotStageFillPct =
    mascotStage.nextMinPct !== null
      ? Math.min(
          100,
          Math.max(
            0,
            ((globalProgress.actualPct - mascotStage.minPct) / mascotStageSpan) * 100
          )
        )
      : 100;
  const mascotMissingPct =
    mascotStage.nextMinPct !== null
      ? Math.max(
          0,
          Math.round((mascotStage.nextMinPct - globalProgress.actualPct) * 10) / 10
        )
      : 0;

  const canGoNextMonth = getMonthKey(viewYear, viewMonth) < currentMonthKey;

  const handleShiftMonth = (delta: -1 | 1) => {
    if (delta === 1 && !canGoNextMonth) return;
    const next =
      delta === -1
        ? getPreviousMonth(viewYear, viewMonth)
        : getNextMonth(viewYear, viewMonth);
    setViewYear(next.year);
    setViewMonth(next.month);
    setSlideIdx(0);
  };

  const handleShare = async () => {
    const text = formatMonthlyShareText(report);
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `Reporte mensual · ${report.monthTitle}`,
          text,
        });
        return;
      }
    } catch {
      // Fall back to clipboard if user cancels or share fails
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedFeedback(true);
        window.setTimeout(() => setCopiedFeedback(false), 2000);
      }
    } catch {
      // Ignore clipboard errors
    }
  };

  const handleContinue = () => {
    if (safeSlideIdx < slides.length - 1) {
      setSlideIdx(safeSlideIdx + 1);
    } else {
      onClose(report.monthKey);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      swipeOriginRef.current = { x: touch.clientX, y: touch.clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const origin = swipeOriginRef.current;
    swipeOriginRef.current = null;
    if (!origin) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.25) return;

    if (dx < 0 && safeSlideIdx < slides.length - 1) {
      setSlideIdx(safeSlideIdx + 1);
    } else if (dx > 0 && safeSlideIdx > 0) {
      setSlideIdx(safeSlideIdx - 1);
    }
  };

  // Max value for Overview weekday bars (completed vs expected/scheduled)
  const maxWeekdayScale = useMemo(() => {
    const m = Math.max(
      ...report.weekdayBars.map((b) => Math.max(b.completed, b.scheduled)),
      1
    );
    return m;
  }, [report.weekdayBars]);

  // Overview curved arc geometry
  const arcRatio = Math.min(1, Math.max(0, report.overallPct / 100));
  const arcPathLength = 220;
  const arcFilledLen = arcPathLength * arcRatio;

  // Score circular gauge geometry (260 degree open-bottom arc)
  const gaugeRadius = 48;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeSweep = gaugeCircumference * (260 / 360);
  const gaugeFill = gaugeSweep * Math.min(1, Math.max(0, report.overallPct / 100));
  const gaugeColor =
    report.overallPct >= 75
      ? '#10B981'
      : report.overallPct >= 45
      ? '#3B4DF5'
      : '#F43F5E';

  // Slide background consistent across all slides
  const slideBgClass = 'bg-[#F7F7FA] sm:bg-white';

  // Balance headline & emoji
  const slide2Tone = useMemo(() => {
    if (report.totalScheduledCount === 0) {
      return {
        emoji: '🗓️',
        title: 'Mes sin hábitos programados',
        badgePct: 0,
        badgeIsGood: true,
      };
    }
    if (report.overallPct >= 75) {
      return {
        emoji: '🎯',
        title: 'Sostuviste tu rutina con fuerza',
        badgePct: report.overallPctExact,
        badgeIsGood: true,
      };
    }
    if (report.overallPct >= 50) {
      return {
        emoji: '⚖️',
        title: 'Avance constante con altibajos',
        badgePct: report.overallPctExact,
        badgeIsGood: true,
      };
    }
    return {
      emoji: '🚨',
      title: 'Dejaste varios hábitos en visto',
      badgePct: report.missedPctExact,
      badgeIsGood: false,
    };
  }, [report]);

  // "Lo que jugó en tu contra" items
  const againstItems = useMemo(() => {
    const items: Array<{
      id: string;
      emoji: string;
      title: string;
      subtitle: string;
      rightLabel: string;
      goalId?: string;
    }> = [];

    for (const obs of report.topObstacles.slice(0, 2)) {
      items.push({
        id: `obs-${obs.id}`,
        emoji: '⚡',
        title: obs.label,
        subtitle: 'Obstáculo registrado',
        rightLabel: `${obs.count} ${obs.count === 1 ? 'día' : 'días'}`,
      });
    }

    const lowestMissed = [...report.perHabitStats]
      .filter((h) => h.missed > 0)
      .sort((a, b) => b.missed - a.missed || a.pct - b.pct);

    for (const h of lowestMissed) {
      if (items.length >= 3) break;
      items.push({
        id: `miss-${h.goal.id}`,
        emoji: h.goal.iconType === 'emoji' ? h.goal.iconValue : '📌',
        title: h.goal.title,
        subtitle: `${h.completed} de ${h.scheduled} cumplidos`,
        rightLabel: `${h.missed} faltas`,
        goalId: h.goal.id,
      });
    }

    return items;
  }, [report.topObstacles, report.perHabitStats]);

  const renderDiagnosticQuestionChart = (
    title: string,
    total: number,
    items: WeeklyDiagnosticBarItem[],
    emptyLabel: string
  ) => (
    <div className="rounded-xl bg-slate-50/80 border border-slate-200/70 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-800">{title}</span>
        <span className="font-mono text-[10px] font-semibold text-slate-400 tabular-nums">
          {total > 0 ? `${total} reg.` : 'Sin registro'}
        </span>
      </div>

      {total === 0 || items.length === 0 ? (
        <div className="py-1.5 text-[11px] text-slate-400 italic">
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px] gap-2">
                <span className="text-slate-700 font-medium truncate">
                  {item.label}
                </span>
                <span className="font-mono text-[11px] font-bold text-slate-800 tabular-nums shrink-0">
                  {item.pct}% ({item.count})
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${Math.max(8, item.pct)}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="monthly-report-heading"
    >
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`w-full max-w-md h-[92vh] sm:h-auto sm:max-h-[90vh] ${slideBgClass} rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden`}
      >
        {/* Top Story Progress Bars + Month Switcher + Close */}
        <div className="px-5 pt-4 pb-2.5 bg-white border-b border-slate-100 space-y-2.5 shrink-0">
          {/* Segmented Story Bars */}
          <div
            className="flex items-center gap-1.5"
            role="tablist"
            aria-label="Páginas del reporte mensual"
          >
            {slides.map((key, idx) => {
              const activeOrDone = idx <= safeSlideIdx;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={idx === safeSlideIdx}
                  aria-label={`Diapositiva ${idx + 1} de ${slides.length}`}
                  onClick={() => setSlideIdx(idx)}
                  className="flex-1 py-1 group focus:outline-none"
                >
                  <span
                    className={`block h-1 rounded-full transition-colors ${
                      activeOrDone
                        ? 'bg-[#3B4DF5]'
                        : 'bg-slate-200 group-hover:bg-slate-300'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Month Switcher + Back + Close */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {safeSlideIdx > 0 && (
                <button
                  type="button"
                  onClick={() => setSlideIdx(Math.max(0, safeSlideIdx - 1))}
                  aria-label="Diapositiva anterior"
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
              )}

              <div className="inline-flex items-center gap-1 bg-slate-100/90 rounded-full px-1.5 h-8">
                <button
                  type="button"
                  onClick={() => handleShiftMonth(-1)}
                  aria-label="Mes anterior"
                  className="w-6 h-6 rounded-full hover:bg-white flex items-center justify-center text-slate-600"
                >
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <span className="text-[11px] font-bold text-slate-800 px-1 capitalize tabular-nums">
                  {report.monthTitle}
                </span>
                <button
                  type="button"
                  disabled={!canGoNextMonth}
                  onClick={() => handleShiftMonth(1)}
                  aria-label="Mes siguiente"
                  className="w-6 h-6 rounded-full hover:bg-white disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-slate-600"
                >
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onClose(report.monthKey)}
              aria-label="Cerrar reporte mensual"
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Slide Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col justify-between">
          {/* STORY 1: Anclaje Temporal del Mes */}
          {activeSlide === 'anchor' && (
            <div className="flex-1 flex flex-col justify-center py-2 space-y-3.5">
              <div
                className="rounded-2xl text-white p-6 shadow-sm space-y-3"
                style={{
                  background:
                    'linear-gradient(135deg, #2534D1 0%, #3B4DF5 55%, #5668FF 100%)',
                }}
              >
                <h2
                  id="monthly-report-heading"
                  className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-white capitalize"
                >
                  {report.monthName} · Mes {report.monthNumber}
                </h2>

                <p className="text-base sm:text-lg font-semibold text-indigo-50 tabular-nums">
                  {report.monthNumber}/12 meses del año ({report.yearElapsedPct}% del año transcurrido)
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-slate-600 tabular-nums">
                  <span className="font-semibold text-slate-800">
                    Avance de {report.year}
                  </span>
                  <span className="font-mono font-bold text-[#3B4DF5]">
                    {report.monthNumber}/12 · {report.yearElapsedPct}%
                  </span>
                </div>

                {/* Block-by-block 12-Month Segmented Year Bar */}
                <div className="grid grid-cols-12 gap-1.5">
                  {Array.from({ length: 12 }, (_, i) => {
                    const blockMonth = i + 1;
                    const isFilled = blockMonth <= report.monthNumber;
                    const isCurrent = blockMonth === report.monthNumber;
                    return (
                      <div
                        key={blockMonth}
                        className={`h-3.5 rounded-sm transition-all ${
                          isCurrent
                            ? 'bg-[#3B4DF5] ring-2 ring-[#3B4DF5]/30'
                            : isFilled
                            ? 'bg-blue-400'
                            : 'bg-slate-100 border border-slate-200'
                        }`}
                      />
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 tabular-nums">
                  <span className="capitalize">{report.monthTitle}</span>
                  <span>
                    {report.monthDaysElapsed}/{report.monthDaysTotal} días ({report.monthElapsedPct}%)
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-2">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold uppercase tracking-wider text-slate-400">
                    Reflexión del mes
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-[#3B4DF5] font-mono font-bold tabular-nums">
                    {report.overallPct}% en {report.monthName}
                  </span>
                </div>
                <blockquote className="text-xs sm:text-[13px] font-medium text-slate-800 leading-relaxed italic">
                  «{report.monthQuote.quote}»
                </blockquote>
                <div className="text-[11px] font-semibold text-slate-500">
                  — {report.monthQuote.author} ·{' '}
                  <span className="font-normal text-slate-400">
                    {report.monthQuote.role}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STORY 2: Progreso de la Mascota + Frase motivacional del mes */}
          {activeSlide === 'mascot' && (
            <div className="flex-1 flex flex-col justify-between py-1 space-y-4">
              {/* Opening Motivational Phrase about the month's progress */}
              <div className="rounded-2xl bg-linear-to-r from-[#3B4DF5] to-blue-600 text-white px-4 py-3.5 shadow-xs">
                <div
                  id="monthly-report-heading"
                  className="font-display text-base font-bold leading-snug"
                >
                  {report.motivationalTitle}
                </div>
                <p className="text-xs text-white/90 mt-1 leading-relaxed">
                  {report.motivationalMessage}
                </p>
              </div>

              {/* Mascot Progress Story Card */}
              <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 p-5 flex flex-col items-center justify-center text-center space-y-4 shadow-2xs">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Evolución de tu mascota · {mascotTrack.name}
                </span>

                <div className="w-24 h-24 rounded-3xl bg-linear-to-b from-indigo-50 to-blue-50/70 border border-indigo-100 flex items-center justify-center text-5xl shadow-inner">
                  <span role="img" aria-label={mascotStage.label}>
                    {mascotStage.emoji}
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-xl font-extrabold text-slate-900">
                    {mascotStage.label}
                  </h3>
                  <div className="font-mono text-2xl font-extrabold text-[#3B4DF5] tabular-nums mt-0.5">
                    {Math.round(globalProgress.actualPct)}% global
                  </div>
                </div>

                {/* Progress bar toward next stage */}
                <div className="w-full max-w-xs space-y-2">
                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#3B4DF5] transition-[width] duration-300"
                      style={{ width: `${mascotStageFillPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs font-medium tabular-nums">
                    <span className="text-slate-500">
                      Etapa actual: {mascotStage.emoji}
                    </span>
                    {mascotStage.nextEmoji && mascotStage.nextMinPct !== null ? (
                      <span className="text-[#3B4DF5] font-semibold">
                        Falta {formatQuantity(mascotMissingPct)}% para{' '}
                        {mascotStage.nextEmoji}
                      </span>
                    ) : (
                      <span className="text-emerald-600 font-semibold inline-flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                        Etapa máxima
                      </span>
                    )}
                  </div>
                </div>

                <div className="px-3.5 py-1.5 rounded-full bg-indigo-50/80 border border-indigo-100 text-xs font-medium text-slate-700 tabular-nums">
                  En {report.monthName} aportaste{' '}
                  <strong className="font-bold text-[#3B4DF5]">
                    {report.totalCompletedCount}
                  </strong>{' '}
                  {report.totalCompletedCount === 1
                    ? 'registro cumplido'
                    : 'registros cumplidos'}
                </div>
              </div>
            </div>
          )}

          {/* STORY 2: Panorama del mes */}
          {activeSlide === 'overview' && (
            <div className="flex-1 flex flex-col justify-between py-1 space-y-5">
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 flex flex-col items-center space-y-3 shadow-2xs">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Así es como te fue en {report.monthName}
                </span>

                <h2
                  id="monthly-report-heading"
                  className="text-sm font-bold text-slate-900 text-center"
                >
                  {report.totalScheduledCount === 0
                    ? 'Sin hábitos programados en este periodo'
                    : report.overallPct >= 80
                    ? '¡Cumpliste con tu objetivo!'
                    : report.overallPct >= 50
                    ? 'Avance de tu objetivo'
                    : 'Progreso de tu objetivo'}
                </h2>

                <div className="flex flex-col items-center tabular-nums pt-0.5 space-y-1">
                  <span className="font-display text-4xl font-extrabold text-slate-900">
                    {report.overallPct}%
                  </span>
                  <p className="text-xs sm:text-sm font-medium text-slate-600 text-center">
                    {report.totalScheduledCount > 0 ? (
                      <>
                        Realizaste tus hábitos{' '}
                        <strong className="font-mono font-bold text-[#3B4DF5]">
                          {report.totalCompletedCount}/{report.totalScheduledCount}
                        </strong>
                      </>
                    ) : (
                      report.summarySubtitle
                    )}
                  </p>
                  {report.totalScheduledCount > 0 && (
                    <p className="text-[11px] text-slate-400 text-center">
                      {report.summarySubtitle}
                    </p>
                  )}
                </div>

                {/* Curved Arc Gauge with 50% & 80% Ticks */}
                <div className="w-60 flex flex-col items-center pt-1">
                  <svg
                    viewBox="0 0 240 50"
                    className="w-full h-12 overflow-visible"
                    aria-hidden="true"
                  >
                    <path
                      d="M 16 32 Q 120 4 224 32"
                      fill="none"
                      stroke="#E2E8F0"
                      strokeWidth="5"
                      strokeLinecap="round"
                    />
                    {arcFilledLen > 1 && (
                      <path
                        d="M 16 32 Q 120 4 224 32"
                        fill="none"
                        stroke="#3B4DF5"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={`${arcFilledLen} ${arcPathLength}`}
                      />
                    )}
                    <line
                      x1="120"
                      y1="10"
                      x2="120"
                      y2="25"
                      stroke="#CBD5E1"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <line
                      x1="182"
                      y1="16"
                      x2="180"
                      y2="30"
                      stroke="#CBD5E1"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="w-full flex justify-between px-10 -mt-2 text-[11px] font-mono text-slate-400 tabular-nums">
                    <span className="pl-7">50%</span>
                    <span className="pr-2">80%</span>
                  </div>
                </div>
              </div>

              {/* Weekday Bar Chart (L M M J V S D) with Expected Marker */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
                <div className="h-40 flex items-end justify-between gap-2 px-2 pt-5">
                  {report.weekdayBars.map((bar) => {
                    const completedPct =
                      bar.completed > 0
                        ? Math.max(
                            10,
                            Math.round((bar.completed / maxWeekdayScale) * 100)
                          )
                        : 0;
                    const expectedPct =
                      bar.scheduled > 0
                        ? Math.max(
                            10,
                            Math.round((bar.scheduled / maxWeekdayScale) * 100)
                          )
                        : 0;

                    return (
                      <div
                        key={bar.dayOfWeek}
                        className="flex-1 flex flex-col items-center justify-end h-full gap-1.5"
                      >
                        <div className="text-[10px] font-mono leading-none tabular-nums h-3.5 flex items-center">
                          {bar.scheduled > 0 ? (
                            <>
                              <span className="font-bold text-slate-800">
                                {bar.completed}
                              </span>
                              <span className="text-slate-400">
                                /{bar.scheduled}
                              </span>
                            </>
                          ) : bar.completed > 0 ? (
                            <span className="font-bold text-slate-800">
                              {bar.completed}
                            </span>
                          ) : null}
                        </div>

                        <div className="relative flex-1 w-full max-w-[30px] flex items-end justify-center">
                          {/* Expected Progress Ghost Column & Dashed Marker */}
                          {bar.scheduled > 0 && (
                            <>
                              <div
                                className="absolute inset-x-0 bottom-0 rounded-t-xl bg-slate-100/90"
                                style={{ height: `${expectedPct}%` }}
                                aria-hidden="true"
                              />
                              <div
                                className="absolute -inset-x-0.5 border-t-2 border-dashed border-slate-500 z-20 pointer-events-none"
                                style={{ bottom: `${expectedPct}%` }}
                                title={`Progreso esperado: ${bar.scheduled}`}
                                aria-hidden="true"
                              >
                                <span className="absolute -top-[4.5px] right-0 w-1.5 h-1.5 rounded-full bg-slate-600" />
                              </div>
                            </>
                          )}

                          {/* Actual Completed Bar */}
                          <div
                            className="relative z-10 w-full rounded-t-xl transition-all duration-300"
                            style={{
                              height:
                                bar.completed > 0
                                  ? `${completedPct}%`
                                  : bar.scheduled > 0
                                  ? '0px'
                                  : '4px',
                              backgroundColor:
                                bar.completed > 0
                                  ? '#3B4DF5'
                                  : bar.scheduled > 0
                                  ? 'transparent'
                                  : '#E2E8F0',
                            }}
                          />
                        </div>

                        <span className="text-xs font-semibold text-slate-500">
                          {bar.short}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-center gap-4 text-[10px] font-medium text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-[3px] bg-[#3B4DF5]" aria-hidden="true" />
                    <span>Realizado</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3.5 border-t-2 border-dashed border-slate-500 inline-block" aria-hidden="true" />
                    <span>Progreso esperado</span>
                  </span>
                </div>

                <p className="text-center text-[11px] text-slate-400 mt-1.5 tabular-nums">
                  Registros cumplidos por día · {report.activeDaysCount} días activos en{' '}
                  {report.monthName}
                </p>
              </div>
            </div>
          )}

          {/* STORY 3: Balance de Cumplimiento & Lo que jugó en tu contra */}
          {activeSlide === 'balance' && (
            <div className="flex-1 flex flex-col justify-center py-2 space-y-5">
              <div className="text-center space-y-1.5">
                <div className="text-4xl leading-none mb-2" aria-hidden="true">
                  {slide2Tone.emoji}
                </div>
                <div className="text-xs font-medium text-slate-500">
                  Balance de Hábitos
                </div>
                <h2
                  id="monthly-report-heading"
                  className="font-display text-2xl font-extrabold text-slate-900 leading-tight"
                >
                  {slide2Tone.title}
                </h2>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 space-y-5">
                {/* Floating % Pill + Split Bar */}
                <div className="space-y-3">
                  <div className="flex justify-center">
                    <span
                      className={`px-3.5 py-1 rounded-full font-mono text-sm font-bold tabular-nums ${
                        slide2Tone.badgeIsGood
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {slide2Tone.badgePct}%
                    </span>
                  </div>

                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden flex">
                    {report.totalScheduledCount > 0 ? (
                      <>
                        <div
                          className="h-full bg-emerald-500 transition-[width] duration-300"
                          style={{ width: `${report.overallPctExact}%` }}
                        />
                        <div
                          className="h-full bg-rose-500 transition-[width] duration-300"
                          style={{ width: `${report.missedPctExact}%` }}
                        />
                      </>
                    ) : (
                      <div className="h-full w-full bg-slate-200" />
                    )}
                  </div>

                  <div className="space-y-1 text-center text-xs font-medium text-slate-700 tabular-nums">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>
                        Cumplidos ({report.overallPctExact}%) · {report.totalCompletedCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span>
                        Sin completar ({report.missedPctExact}%) ·{' '}
                        {Math.max(
                          0,
                          report.totalScheduledCount - report.totalCompletedCount
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Lo que jugó en tu contra */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <h3 className="text-xs font-bold text-slate-900">
                    Lo que jugó en tu contra
                  </h3>

                  {againstItems.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No se registraron faltas ni obstáculos este mes.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {againstItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                            <span className="text-base leading-none shrink-0" aria-hidden="true">
                              {item.emoji}
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 truncate">
                                {item.title}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate">
                                {item.subtitle}
                              </div>
                            </div>
                          </div>
                          <span className="font-mono text-xs font-semibold text-slate-700 shrink-0 tabular-nums">
                            {item.rightLabel}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STORY 4: El Pulso del Mes (Energía + Gráficas de las 4 preguntas de diagnóstico) */}
          {activeSlide === 'pulse' && (
            <div className="flex-1 flex flex-col justify-between py-1 space-y-3.5">
              <div className="text-center space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  El pulso de {report.monthName}
                </span>
                <h2
                  id="monthly-report-heading"
                  className="font-display text-xl font-extrabold text-slate-900"
                >
                  ¿Cómo se sintió este mes?
                </h2>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xl shrink-0">
                    {report.diagnostics.dominantEnergy
                      ? report.diagnostics.dominantEnergy.emoji
                      : '😶'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Energía del mes
                    </div>
                    <div className="text-sm font-extrabold text-slate-900 truncate">
                      {report.diagnostics.dominantEnergy
                        ? `${report.diagnostics.dominantEnergy.label} (${report.diagnostics.dominantEnergy.pct}%)`
                        : 'Sin registro de energía'}
                    </div>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-500 tabular-nums shrink-0">
                  <div className="font-semibold text-emerald-700">
                    {report.naturalFlowDays}d flujo
                  </div>
                  <div className="font-semibold text-amber-700">
                    {report.resistanceDays}d resistencia
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-2.5">
                {renderDiagnosticQuestionChart(
                  '1. Nivel de energía',
                  report.diagnostics.energyTotal,
                  report.diagnostics.energyItems,
                  'El usuario no registró energía este mes.'
                )}

                {renderDiagnosticQuestionChart(
                  '2. Obstáculo principal',
                  report.diagnostics.obstacleTotal,
                  report.diagnostics.obstacleItems,
                  'El usuario no registró obstáculos este mes.'
                )}

                {renderDiagnosticQuestionChart(
                  '3. Punto de rotura',
                  report.diagnostics.breakPointTotal,
                  report.diagnostics.breakPointItems,
                  'El usuario no registró punto de rotura este mes.'
                )}

                {renderDiagnosticQuestionChart(
                  '4. Reacción ante el reto',
                  report.diagnostics.reactionTotal,
                  report.diagnostics.reactionItems,
                  'El usuario no registró reacción ante el reto este mes.'
                )}
              </div>
            </div>
          )}

          {/* STORY 5: Lo mejor de este mes */}
          {activeSlide === 'best' && (
            <div className="flex-1 flex flex-col justify-between py-1 space-y-4">
              {!report.bestHabit ? (
                <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col items-center justify-center text-center space-y-2 shadow-2xs">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Lo mejor de {report.monthName}
                  </span>
                  <h2
                    id="monthly-report-heading"
                    className="font-display text-xl font-extrabold text-slate-900"
                  >
                    Sin registros todavía
                  </h2>
                  <p className="text-xs text-slate-500 max-w-xs">
                    Registra tus hábitos este mes para descubrir tus mejores resultados.
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 flex flex-col items-center text-center space-y-3 shadow-2xs">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Lo mejor de {report.monthName}
                    </span>

                    <h2
                      id="monthly-report-heading"
                      className="text-sm font-bold text-slate-900"
                    >
                      Tu hábito más constante
                    </h2>

                    <div className="flex items-center justify-center gap-3 pt-1">
                      <GoalIconBadge
                        iconType={report.bestHabit.goal.iconType || 'icon'}
                        iconValue={report.bestHabit.goal.iconValue || 'activity'}
                        colorHex={report.bestHabit.goal.colorHex || '#10B981'}
                        sizeClass="w-11 h-11"
                      />
                      <span className="font-display text-4xl font-extrabold text-slate-900 tabular-nums">
                        {report.bestHabit.pct}%
                      </span>
                    </div>

                    <div className="text-sm font-bold text-slate-900">
                      {report.bestHabit.goal.title}
                    </div>

                    <span className="inline-flex items-center px-3.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold tabular-nums">
                      {report.bestHabit.completed} de {report.bestHabit.scheduled} días
                      {report.bestHabit.bestStreak >= 2
                        ? ` · Racha de ${report.bestHabit.bestStreak}d`
                        : ''}
                    </span>

                    <p className="text-[11px] text-slate-400">
                      Cumplimiento mensual destacado en tu rutina
                    </p>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-slate-900">
                        También te fue bien en
                      </h3>
                      <span className="text-[10px] font-medium text-slate-400">
                        {report.monthName}
                      </span>
                    </div>

                    {report.runnerUpHabits.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Mantén este impulso en tus demás hábitos durante el mes.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {report.runnerUpHabits.map((h) => (
                          <button
                            key={h.goal.id}
                            type="button"
                            onClick={() => onInspectGoal(h.goal.id)}
                            className="w-full flex items-center justify-between gap-3 text-left hover:bg-slate-50 rounded-xl p-1.5 -mx-1.5 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <GoalIconBadge
                                iconType={h.goal.iconType || 'icon'}
                                iconValue={h.goal.iconValue || 'activity'}
                                colorHex={h.goal.colorHex || '#3B4DF5'}
                                sizeClass="w-8 h-8"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-800 truncate">
                                  {h.goal.title}
                                </div>
                                <div className="text-[10px] text-slate-400 tabular-nums">
                                  {h.completed} de {h.scheduled} días
                                </div>
                              </div>
                            </div>

                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 font-mono text-xs font-bold text-emerald-700 shrink-0 tabular-nums">
                              {h.pct}%
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {report.evolvedHabits.length > 0 && (
                    <div className="bg-white rounded-2xl border border-indigo-200/80 p-4 space-y-2.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3B4DF5]">
                          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Evolución de hábito en {report.monthName}</span>
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500">
                          Nuevo nivel
                        </span>
                      </div>

                      <div className="space-y-2">
                        {report.evolvedHabits.slice(0, 2).map((ev) => (
                          <button
                            key={ev.goal.id}
                            type="button"
                            onClick={() => onInspectGoal(ev.goal.id)}
                            className="w-full rounded-xl bg-indigo-50/60 hover:bg-indigo-50 border border-indigo-200/70 p-2.5 flex items-center justify-between gap-2.5 text-left transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <GoalIconBadge
                                iconType={ev.goal.iconType || 'icon'}
                                iconValue={ev.goal.iconValue || 'activity'}
                                colorHex={ev.goal.colorHex || '#3B4DF5'}
                                sizeClass="w-8 h-8"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900 truncate">
                                  {ev.toTitle}
                                </div>
                                <div className="text-[11px] text-slate-600 truncate">
                                  {ev.fromSummary} → {ev.toSummary}
                                </div>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-[#3B4DF5] text-white font-mono text-[10px] font-bold shrink-0 tabular-nums">
                              F{ev.fromPhase} → F{ev.toPhase}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* CONDITIONAL STORY: Progreso en hábitos (vs mes anterior / evolución) */}
          {activeSlide === 'progress' && (
            <div className="flex-1 flex flex-col justify-between py-1 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 flex flex-col items-center text-center space-y-2 shadow-2xs">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Evolución frente al mes anterior
                </span>
                <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 text-[#3B4DF5] flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" aria-hidden="true" />
                </div>
                <h2
                  id="monthly-report-heading"
                  className="font-display text-xl font-extrabold text-slate-900 leading-tight"
                >
                  ¡Subiste tu nivel en {report.monthName}!
                </h2>
                <p className="text-xs text-slate-500">
                  Comparativa directa de los hábitos donde mejoraste tu ritmo.
                </p>
              </div>

              <div className="space-y-2.5">
                {report.progressedHabits.slice(0, 4).map((item) => {
                  const maxBar = Math.max(item.fromValue, item.toValue, 1);
                  const fromWidth = Math.max(
                    10,
                    Math.round((item.fromValue / maxBar) * 100)
                  );
                  const toWidth = Math.max(
                    12,
                    Math.round((item.toValue / maxBar) * 100)
                  );

                  return (
                    <button
                      key={item.goal.id}
                      type="button"
                      onClick={() => onInspectGoal(item.goal.id)}
                      className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 text-left hover:border-blue-300 transition-colors space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <GoalIconBadge
                            iconType={item.goal.iconType || 'icon'}
                            iconValue={item.goal.iconValue || 'activity'}
                            colorHex={item.goal.colorHex || '#3B4DF5'}
                            sizeClass="w-8 h-8"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {item.goal.title}
                            </div>
                            <div className="text-[11px] font-semibold text-[#3B4DF5]">
                              {item.headline}
                            </div>
                          </div>
                        </div>

                        <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-mono text-[11px] font-bold shrink-0 tabular-nums">
                          {item.deltaLabel}
                        </span>
                      </div>

                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex items-center gap-2 text-[10px] font-mono tabular-nums">
                          <span className="w-24 text-slate-400 truncate">
                            {item.fromLabel}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-slate-300"
                              style={{ width: `${fromWidth}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono tabular-nums">
                          <span className="w-24 font-semibold text-[#3B4DF5] truncate">
                            {item.toLabel}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#3B4DF5]"
                              style={{ width: `${toWidth}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500">{item.subtext}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STORY 5: En lo que puedes mejorar */}
          {activeSlide === 'improve' && (
            <div className="flex-1 flex flex-col justify-between py-1 space-y-4">
              {!report.weakestHabit ? (
                <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col items-center justify-center text-center space-y-2 shadow-2xs">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Oportunidades de mejora · {report.monthName}
                  </span>
                  <h2
                    id="monthly-report-heading"
                    className="font-display text-xl font-extrabold text-slate-900"
                  >
                    Sin áreas críticas
                  </h2>
                  <p className="text-xs text-slate-500 max-w-xs">
                    No hay suficientes datos en este mes para detectar hábitos a reforzar.
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 flex flex-col items-center text-center space-y-3 shadow-2xs">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      En lo que puedes mejorar · {report.monthName}
                    </span>

                    <h2
                      id="monthly-report-heading"
                      className="text-sm font-bold text-slate-900"
                    >
                      {report.weakestHabit.pct < 80
                        ? 'Hábito con mayor margen de ajuste'
                        : 'Tu menor adherencia del mes'}
                    </h2>

                    <div className="flex items-center justify-center gap-3 pt-1">
                      <GoalIconBadge
                        iconType={report.weakestHabit.goal.iconType || 'icon'}
                        iconValue={report.weakestHabit.goal.iconValue || 'activity'}
                        colorHex={report.weakestHabit.goal.colorHex || '#EF4444'}
                        sizeClass="w-11 h-11"
                      />
                      <span className="font-display text-4xl font-extrabold text-slate-900 tabular-nums">
                        {report.weakestHabit.pct}%
                      </span>
                    </div>

                    <div className="text-sm font-bold text-slate-900">
                      {report.weakestHabit.goal.title}
                    </div>

                    <span
                      className={`inline-flex items-center px-3.5 py-1 rounded-full text-xs font-semibold tabular-nums ${
                        report.weakestHabit.missed === 0
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {report.weakestHabit.missed === 0
                        ? 'Cumplido al 100%'
                        : `Faltaron ${report.weakestHabit.missed} de ${report.weakestHabit.scheduled} días`}
                    </span>

                    <p className="text-[11px] text-slate-400">
                      Un ajuste pequeño en frecuencia o dosis facilita retomarlo
                    </p>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-slate-900">
                        También a considerar
                      </h3>
                      <span className="text-[10px] font-medium text-slate-400">
                        {report.monthName}
                      </span>
                    </div>

                    {report.otherImproveHabits.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        El resto de tus hábitos mantuvo un desempeño sólido este mes.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {report.otherImproveHabits.map((h) => (
                          <button
                            key={h.goal.id}
                            type="button"
                            onClick={() => onInspectGoal(h.goal.id)}
                            className="w-full flex items-center justify-between gap-3 text-left hover:bg-slate-50 rounded-xl p-1.5 -mx-1.5 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <GoalIconBadge
                                iconType={h.goal.iconType || 'icon'}
                                iconValue={h.goal.iconValue || 'activity'}
                                colorHex={h.goal.colorHex || '#3B4DF5'}
                                sizeClass="w-8 h-8"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-800 truncate">
                                  {h.goal.title}
                                </div>
                                <div className="text-[10px] text-slate-400 tabular-nums">
                                  {h.completed} de {h.scheduled} días
                                </div>
                              </div>
                            </div>

                            <span
                              className={`px-2.5 py-0.5 rounded-full font-mono text-xs font-bold shrink-0 tabular-nums ${
                                h.pct < 60
                                  ? 'bg-rose-50 text-rose-600'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {h.pct}%
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* FINAL STORY: Score del Mes + Mapa de color Lun-Dom */}
          {activeSlide === 'score' && (
            <div className="flex-1 flex flex-col justify-between py-1 space-y-4">
              {/* Compact Score del Mes Header */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center justify-between gap-4 shadow-2xs">
                <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                  <svg
                    viewBox="0 0 120 120"
                    className="w-full h-full"
                    style={{ transform: 'rotate(140deg)' }}
                    aria-hidden="true"
                  >
                    <circle
                      cx="60"
                      cy="60"
                      r={gaugeRadius}
                      fill="none"
                      stroke="#E2E8F0"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${gaugeSweep} ${gaugeCircumference}`}
                    />
                    {gaugeFill > 1 && (
                      <circle
                        cx="60"
                        cy="60"
                        r={gaugeRadius}
                        fill="none"
                        stroke={gaugeColor}
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={`${gaugeFill} ${gaugeCircumference}`}
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                    <span className="font-display text-2xl font-extrabold text-slate-900 tabular-nums leading-none">
                      {report.overallPct}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 mt-0.5">
                      {report.scoreLabel}
                    </span>
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div>
                    <h2
                      id="monthly-report-heading"
                      className="font-display text-base font-extrabold text-slate-900 leading-tight"
                    >
                      Tu Score del Mes
                    </h2>
                    <p className="text-[11px] font-medium text-slate-500 capitalize">
                      {report.rangeLabel} · {report.totalCompletedCount}/
                      {report.totalScheduledCount} hábitos
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50/80 border border-indigo-100 text-[11px] font-semibold text-slate-700">
                    <span>{mascotStage.emoji}</span>
                    <span className="truncate">
                      {mascotStage.label} · {Math.round(globalProgress.actualPct)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Mapa de Color de Consistencia por Día de la Semana */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-900">
                    Mapa de color · Consistencia por día
                  </h3>
                  <span className="text-[10px] font-medium text-slate-400">
                    Lun → Dom
                  </span>
                </div>

                <div className="grid grid-cols-7 gap-1.5 text-center">
                  {WEEKDAY_HEADERS.map((lbl, i) => (
                    <div key={i} className="text-[11px] font-bold text-slate-500">
                      {lbl}
                    </div>
                  ))}
                </div>

                {/* Month Heatmap Grid */}
                <div className="grid grid-cols-7 gap-1.5">
                  {report.calendarCells.map((cell) => {
                    if (!cell.inMonth) {
                      return <div key={cell.dateStr} className="h-8" />;
                    }

                    let cellClass = 'bg-slate-100 text-slate-400';
                    if (cell.isFuture) {
                      cellClass = 'bg-slate-50 border border-slate-100 text-slate-300';
                    } else if (cell.pct === null) {
                      cellClass = 'bg-slate-100 text-slate-400';
                    } else if (cell.pct === 0) {
                      cellClass =
                        'bg-rose-100 text-rose-700 border border-rose-200/80 font-semibold';
                    } else if (cell.pct < 50) {
                      cellClass = 'bg-blue-100 text-blue-800 font-semibold';
                    } else if (cell.pct < 80) {
                      cellClass = 'bg-blue-400 text-white font-semibold';
                    } else {
                      cellClass = 'bg-[#3B4DF5] text-white font-bold';
                    }

                    return (
                      <div
                        key={cell.dateStr}
                        title={
                          cell.pct !== null
                            ? `${cell.dayNum}: ${cell.completed}/${cell.scheduled} (${cell.pct}%)`
                            : `${cell.dayNum}`
                        }
                        className={`h-8 rounded-lg flex items-center justify-center font-mono text-[11px] tabular-nums transition-colors ${cellClass}`}
                      >
                        {cell.dayNum}
                      </div>
                    );
                  })}
                </div>

                {/* Weekday Column Adherence Summary */}
                <div className="grid grid-cols-7 gap-1.5 text-center pt-1 border-t border-slate-100">
                  {report.weekdayBars.map((bar) => (
                    <div
                      key={bar.dayOfWeek}
                      className="font-mono text-[10px] font-semibold text-slate-600 tabular-nums"
                    >
                      {bar.scheduled > 0 ? `${bar.pct}%` : '–'}
                    </div>
                  ))}
                </div>

                {/* Legend + Pattern Insight */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-xs bg-rose-100 border border-rose-200" />
                      0%
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-xs bg-blue-100" />
                      1–49%
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-xs bg-blue-400" />
                      50–79%
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-xs bg-[#3B4DF5]" />
                      80–100%
                    </span>
                  </div>

                  <p className="text-[11px] font-medium text-slate-700 leading-snug">
                    {report.weekdayPatternNote}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom CTA Footer (Ritmo Brand Blue) */}
        <div className="px-5 py-4 bg-white border-t border-slate-100 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleShare}
            className="h-11 px-4 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shrink-0"
          >
            {copiedFeedback ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                <span>Copiado</span>
              </>
            ) : (
              <>
                <Share className="w-4 h-4" aria-hidden="true" />
                <span>Compartir</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleContinue}
            className="retro-press flex-1 h-11 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            {safeSlideIdx < slides.length - 1 ? 'Continuar' : 'Hecho'}
          </button>
        </div>
      </div>
    </div>
  );
};
