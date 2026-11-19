import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Award,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import {
  AppSettings,
  DailyQuizResponse,
  GlobalProgressSummary,
  Goal,
} from '../types/tracker';
import { GoalIconBadge } from '../utils/colorAndIcons';
import {
  getMascotStage,
  playWeeklySlideSound,
  WeeklySlideSoundKey,
} from '../utils/gamification';
import { addDays, toLocalDateStr } from '../utils/paceEngine';
import {
  buildWeeklyReport,
  WeeklyDiagnosticBarItem,
} from '../utils/weeklyReport';

interface WeeklyReportModalProps {
  goals: Goal[];
  now: Date;
  settings: AppSettings;
  globalProgress: GlobalProgressSummary;
  dailyQuizLogs: Record<string, DailyQuizResponse>;
  initialAnchorDate?: string;
  onClose: (viewedWeekKey: string) => void;
  onOpenWeeklyDetail?: () => void;
  onInspectGoal?: (goalId: string) => void;
}

const SLIDE_KEYS: WeeklySlideSoundKey[] = [
  'anchor',
  'balance',
  'pulse',
  'victory',
  'adjustment',
];

export const WeeklyReportModal: React.FC<WeeklyReportModalProps> = ({
  goals,
  now,
  settings,
  globalProgress,
  dailyQuizLogs,
  initialAnchorDate,
  onClose,
  onOpenWeeklyDetail,
  onInspectGoal,
}) => {
  const todayStr = toLocalDateStr(now);
  const weeklyMode = settings.weeklyStatsMode ?? 'full_week';

  const [anchorDate, setAnchorDate] = useState<string>(
    initialAnchorDate || todayStr
  );
  const [slideIdx, setSlideIdx] = useState<number>(0);
  const swipeOriginRef = useRef<{ x: number; y: number } | null>(null);

  const report = useMemo(
    () => buildWeeklyReport(goals, anchorDate, todayStr, weeklyMode, dailyQuizLogs),
    [goals, anchorDate, todayStr, weeklyMode, dailyQuizLogs]
  );

  const mascotStage = useMemo(
    () => getMascotStage(settings.mascotTrackId, globalProgress.actualPct),
    [settings.mascotTrackId, globalProgress.actualPct]
  );

  const safeSlideIdx = Math.max(0, Math.min(SLIDE_KEYS.length - 1, slideIdx));
  const activeSlide = SLIDE_KEYS[safeSlideIdx];

  // Play distinct Web Audio sound per slide on entry & transitions
  useEffect(() => {
    if (!settings.soundEnabled) return;
    playWeeklySlideSound(activeSlide);
  }, [activeSlide, settings.soundEnabled, report.weekKey]);

  const canGoNextWeek = anchorDate < todayStr && addDays(anchorDate, 7) <= todayStr;

  const handleShiftWeek = (delta: -1 | 1) => {
    if (delta === 1 && !canGoNextWeek) return;
    setAnchorDate((prev) => addDays(prev, delta * 7));
    setSlideIdx(0);
  };

  const handleContinue = () => {
    if (safeSlideIdx < SLIDE_KEYS.length - 1) {
      setSlideIdx(safeSlideIdx + 1);
    } else {
      onClose(report.weekKey);
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

    if (dx < 0 && safeSlideIdx < SLIDE_KEYS.length - 1) {
      setSlideIdx(safeSlideIdx + 1);
    } else if (dx > 0 && safeSlideIdx > 0) {
      setSlideIdx(safeSlideIdx - 1);
    }
  };

  // Slide 1 Balance tone (matching Slide 3 of MonthlyReportModal)
  const balanceTone = useMemo(() => {
    if (report.totalScheduledActions === 0) {
      return {
        emoji: '🗓️',
        title: 'Semana sin hábitos programados',
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

  // Congruent weekly accent color distinct from Monthly's #3B4DF5 -> Teal #0D9488
  const weeklyAccent = '#0D9488';

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
      aria-labelledby="weekly-report-heading"
    >
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="w-full max-w-md h-[92vh] sm:h-auto sm:max-h-[90vh] bg-[#F7F7FA] sm:bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Top Story Progress Bars (5 Slides, congruent with Monthly) + Week Switcher + Close */}
        <div className="px-5 pt-4 pb-2.5 bg-white border-b border-slate-100 space-y-2.5 shrink-0">
          <div
            className="flex items-center gap-1.5"
            role="tablist"
            aria-label="Páginas del reporte semanal"
          >
            {SLIDE_KEYS.map((key, idx) => {
              const activeOrDone = idx <= safeSlideIdx;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={idx === safeSlideIdx}
                  aria-label={`Diapositiva semanal ${idx + 1} de ${SLIDE_KEYS.length}`}
                  onClick={() => setSlideIdx(idx)}
                  className="flex-1 py-1 group focus:outline-none"
                >
                  <span
                    className={`block h-1 rounded-full transition-colors ${
                      activeOrDone
                        ? 'bg-teal-600'
                        : 'bg-slate-200 group-hover:bg-slate-300'
                    }`}
                  />
                </button>
              );
            })}
          </div>

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
                  onClick={() => handleShiftWeek(-1)}
                  aria-label="Semana anterior"
                  className="w-6 h-6 rounded-full hover:bg-white flex items-center justify-center text-slate-600"
                >
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <span className="text-[11px] font-bold text-slate-800 px-1.5 tabular-nums">
                  Sem. {report.weekOfYear} · {report.rangeLabel}
                </span>
                <button
                  type="button"
                  disabled={!canGoNextWeek}
                  onClick={() => handleShiftWeek(1)}
                  aria-label="Semana siguiente"
                  className="w-6 h-6 rounded-full hover:bg-white disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-slate-600"
                >
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onClose(report.weekKey)}
              aria-label="Cerrar reporte semanal"
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Slide Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col justify-between">
          {/* SLIDE 1: Balance de Hábitos Semanal (como Slide 3 del reporte mensual) */}
          {activeSlide === 'balance' && (
            <div className="flex-1 flex flex-col justify-center py-2 space-y-5">
              <div className="text-center space-y-1.5">
                <div className="text-4xl leading-none mb-2" aria-hidden="true">
                  {balanceTone.emoji}
                </div>
                <div className="text-xs font-medium text-slate-500">
                  Balance de Hábitos · Semana {report.weekOfYear}
                </div>
                <h2
                  id="weekly-report-heading"
                  className="font-display text-2xl font-extrabold text-slate-900 leading-tight"
                >
                  {balanceTone.title}
                </h2>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 space-y-5">
                <div className="space-y-3">
                  <div className="flex justify-center">
                    <span
                      className={`px-3.5 py-1 rounded-full font-mono text-sm font-bold tabular-nums ${
                        balanceTone.badgeIsGood
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {balanceTone.badgePct}%
                    </span>
                  </div>

                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden flex">
                    {report.totalScheduledActions > 0 ? (
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
                        Cumplidos ({report.overallPctExact}%) ·{' '}
                        {report.totalCompletedActions}
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span>
                        Sin completar ({report.missedPctExact}%) ·{' '}
                        {Math.max(
                          0,
                          Math.round(
                            (report.totalScheduledActions - report.totalCompletedActions) *
                              10
                          ) / 10
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

                  {report.againstItems.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No se registraron faltas ni obstáculos esta semana.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {report.againstItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                            <span
                              className="text-base leading-none shrink-0"
                              aria-hidden="true"
                            >
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

          {/* SLIDE 2: Semana del año, avance del mes y cita motivacional congruente */}
          {activeSlide === 'anchor' && (
            <div className="flex-1 flex flex-col justify-center py-2 space-y-3.5">
              <div
                className="rounded-2xl text-white p-6 shadow-sm space-y-3"
                style={{
                  background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 55%, #14B8A6 100%)',
                }}
              >
                <h2
                  id="weekly-report-heading"
                  className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-white"
                >
                  Semana {report.weekOfYear} del año
                </h2>

                <p className="text-base sm:text-lg font-semibold text-teal-50 tabular-nums">
                  {report.weekOfMonth}/{report.weeksInMonth} semanas del mes (
                  {report.monthElapsedPct}% del mes transcurrido)
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-slate-600 tabular-nums">
                  <span className="capitalize font-semibold text-slate-800">
                    Avance de {report.monthName}
                  </span>
                  <span
                    className="font-mono font-bold"
                    style={{ color: weeklyAccent }}
                  >
                    {report.weekOfMonth}/{report.weeksInMonth} · {report.monthElapsedPct}%
                  </span>
                </div>

                {/* Block-by-block Segmented Weekly Bar */}
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${report.weeksInMonth}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({ length: report.weeksInMonth }, (_, i) => {
                    const blockNum = i + 1;
                    const isFilled = blockNum <= report.weekOfMonth;
                    const isCurrent = blockNum === report.weekOfMonth;
                    return (
                      <div
                        key={blockNum}
                        className={`h-3.5 rounded-md transition-all ${
                          isCurrent
                            ? 'bg-teal-600 ring-2 ring-teal-500/30'
                            : isFilled
                            ? 'bg-teal-400'
                            : 'bg-slate-100 border border-slate-200'
                        }`}
                      />
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                  <span>{report.rangeLabel}</span>
                  <span>
                    {report.mode === 'full_week' ? 'Semana completa' : 'Últimos 7 días'}
                  </span>
                </div>
              </div>

              {/* Frase motivacional congruente con el resultado del mes */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-2">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold uppercase tracking-wider text-slate-400">
                    Reflexión del mes
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-mono font-bold tabular-nums">
                    {report.monthResultPct}% en {report.monthName}
                  </span>
                </div>
                <blockquote className="text-xs sm:text-[13px] font-medium text-slate-800 leading-relaxed italic">
                  «{report.monthQuote.quote}»
                </blockquote>
                <div className="text-[11px] font-semibold text-slate-500">
                  — {report.monthQuote.author} · <span className="font-normal text-slate-400">{report.monthQuote.role}</span>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 3: El Pulso de la Semana (Energía + Gráficas de las 4 preguntas de diagnóstico) */}
          {activeSlide === 'pulse' && (
            <div className="flex-1 flex flex-col justify-between py-1 space-y-3.5">
              <div className="text-center space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  El pulso de la semana
                </span>
                <h2
                  id="weekly-report-heading"
                  className="font-display text-xl font-extrabold text-slate-900"
                >
                  ¿Cómo se sintió esta semana?
                </h2>
              </div>

              {/* Energía de la semana elegida / predominante */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-xl shrink-0">
                    {report.diagnostics.dominantEnergy
                      ? report.diagnostics.dominantEnergy.emoji
                      : '😶'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Energía de la semana
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

              {/* Gráficas de las 4 preguntas de diagnóstico */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-2.5">
                {renderDiagnosticQuestionChart(
                  '1. Nivel de energía',
                  report.diagnostics.energyTotal,
                  report.diagnostics.energyItems,
                  'El usuario no registró energía esta semana.'
                )}

                {renderDiagnosticQuestionChart(
                  '2. Obstáculo principal',
                  report.diagnostics.obstacleTotal,
                  report.diagnostics.obstacleItems,
                  'El usuario no registró obstáculos esta semana.'
                )}

                {renderDiagnosticQuestionChart(
                  '3. Punto de rotura',
                  report.diagnostics.breakPointTotal,
                  report.diagnostics.breakPointItems,
                  'El usuario no registró punto de rotura esta semana.'
                )}

                {renderDiagnosticQuestionChart(
                  '4. Reacción ante el reto',
                  report.diagnostics.reactionTotal,
                  report.diagnostics.reactionItems,
                  'El usuario no registró reacción ante el reto esta semana.'
                )}
              </div>
            </div>
          )}

          {/* SLIDE 4: La Micro-Victoria + Evolución de hábito (si hay) */}
          {activeSlide === 'victory' && (
            <div className="flex-1 flex flex-col justify-center space-y-3.5 py-1">
              <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-2xs flex flex-col items-center text-center space-y-5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  La micro-victoria
                </span>

                <h2
                  id="weekly-report-heading"
                  className="font-display text-2xl font-extrabold text-slate-900"
                >
                  Tu victoria de la semana
                </h2>

                <div className="relative flex items-center justify-center py-2">
                  <div className="w-24 h-24 rounded-full bg-linear-to-br from-amber-100 via-amber-50 to-orange-100 border-4 border-amber-300/80 flex items-center justify-center shadow-md">
                    {report.victory && report.victory.streakDays >= 3 ? (
                      <Award className="w-11 h-11 text-amber-600" aria-hidden="true" />
                    ) : (
                      <Trophy className="w-11 h-11 text-amber-600" aria-hidden="true" />
                    )}
                  </div>
                  {report.victory && report.victory.streakDays > 0 && (
                    <span className="absolute -bottom-1 px-3 py-0.5 rounded-full bg-slate-900 text-amber-300 font-mono text-[11px] font-bold shadow-xs tabular-nums">
                      {report.victory.streakDays}d racha
                    </span>
                  )}
                </div>

                {report.victory ? (
                  <div className="space-y-2.5 max-w-xs">
                    <p className="text-base sm:text-lg font-extrabold text-slate-900 leading-snug">
                      {report.victory.headline}
                    </p>
                    <div className="inline-flex items-center px-3.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-mono text-xs font-bold tabular-nums">
                      {report.victory.pct}% de consistencia esta semana
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 max-w-xs">
                    <p className="text-base font-bold text-slate-900">
                      Semana de preparación
                    </p>
                    <p className="text-xs text-slate-500">
                      Completa al menos un hábito esta semana para desbloquear tu
                      micro-victoria destacada.
                    </p>
                  </div>
                )}
              </div>

              {report.evolvedHabits.length > 0 && (
                <div className="bg-white rounded-2xl border border-teal-200/80 p-4 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-800">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
                      <span>Evolución de hábito</span>
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-600">
                      Nuevo nivel
                    </span>
                  </div>

                  <div className="space-y-2">
                    {report.evolvedHabits.slice(0, 2).map((ev) => (
                      <button
                        key={ev.goal.id}
                        type="button"
                        onClick={() => {
                          if (onInspectGoal) {
                            onClose(report.weekKey);
                            onInspectGoal(ev.goal.id);
                          }
                        }}
                        className="w-full rounded-xl bg-teal-50/70 hover:bg-teal-50 border border-teal-200/70 p-2.5 flex items-center justify-between gap-2.5 text-left transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <GoalIconBadge
                            iconType={ev.goal.iconType || 'icon'}
                            iconValue={ev.goal.iconValue || 'activity'}
                            colorHex={ev.goal.colorHex || '#0D9488'}
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

                        <span className="px-2 py-0.5 rounded-full bg-teal-600 text-white font-mono text-[10px] font-bold shrink-0 tabular-nums">
                          F{ev.fromPhase} → F{ev.toPhase}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SLIDE 5: Hábito con mayor margen de ajuste (estilo Slide 4/improve del reporte mensual + intención + flecha) */}
          {activeSlide === 'adjustment' && (
            <div className="flex-1 flex flex-col justify-between py-1 space-y-4">
              {!report.adjustmentHabit ? (
                <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col items-center justify-center text-center space-y-2 shadow-2xs">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Semana {report.weekOfYear} · Siguiente paso
                  </span>
                  <h2
                    id="weekly-report-heading"
                    className="font-display text-xl font-extrabold text-slate-900"
                  >
                    Hábito con mayor margen de ajuste
                  </h2>
                  <p className="text-xs text-slate-500 max-w-xs">
                    Aún no hay suficientes registros semanales para destacar un hábito
                    específico.
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 flex flex-col items-center text-center space-y-3 shadow-2xs">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Enfoque para la semana {report.nextWeekOfYear}
                    </span>

                    <h2
                      id="weekly-report-heading"
                      className="text-sm font-bold text-slate-900"
                    >
                      Hábito con mayor margen de ajuste
                    </h2>

                    <div className="flex items-center justify-center gap-3 pt-1">
                      <GoalIconBadge
                        iconType={report.adjustmentHabit.goal.iconType || 'icon'}
                        iconValue={report.adjustmentHabit.goal.iconValue || 'activity'}
                        colorHex={report.adjustmentHabit.goal.colorHex || '#EF4444'}
                        sizeClass="w-11 h-11"
                      />
                      <span className="font-display text-4xl font-extrabold text-slate-900 tabular-nums">
                        {report.adjustmentHabit.pct}%
                      </span>
                    </div>

                    <div className="text-sm font-bold text-slate-900">
                      {report.adjustmentHabit.goal.title}
                    </div>

                    <span
                      className={`inline-flex items-center px-3.5 py-1 rounded-full text-xs font-semibold tabular-nums ${
                        report.adjustmentHabit.missed === 0
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {report.adjustmentHabit.missed === 0
                        ? 'Cumplido al 100%'
                        : `Faltaron ${report.adjustmentHabit.missed} de ${report.adjustmentHabit.scheduled} días`}
                    </span>

                    {/* Intención concreta + flecha de avance */}
                    <div className="w-full rounded-xl bg-teal-50/70 border border-teal-200/70 p-3.5 flex items-center justify-between gap-3 text-left mt-1">
                      <p className="text-xs font-medium text-slate-800 leading-relaxed flex-1">
                        {report.focusIntention}
                      </p>
                      <span className="w-9 h-9 rounded-full bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </span>
                    </div>
                  </div>

                  {/* También a considerar / Mascota acompañante */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-slate-900">
                        También a considerar
                      </h3>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                        <span>{mascotStage.emoji}</span>
                        <span>{mascotStage.label}</span>
                      </span>
                    </div>

                    {report.otherAdjustmentHabits.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        El resto de tus hábitos mantuvo un desempeño sólido esta semana.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {report.otherAdjustmentHabits.map((h) => (
                          <button
                            key={h.goal.id}
                            type="button"
                            onClick={() => {
                              if (onInspectGoal) {
                                onClose(report.weekKey);
                                onInspectGoal(h.goal.id);
                              }
                            }}
                            className="w-full flex items-center justify-between gap-3 text-left hover:bg-slate-50 rounded-xl p-1.5 -mx-1.5 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <GoalIconBadge
                                iconType={h.goal.iconType || 'icon'}
                                iconValue={h.goal.iconValue || 'activity'}
                                colorHex={h.goal.colorHex || '#0D9488'}
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

                    {onOpenWeeklyDetail && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose(report.weekKey);
                          onOpenWeeklyDetail();
                        }}
                        className="w-full h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <BarChart2 className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
                        <span>Ver gráfica y desglose semanal</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Bottom Primary CTA Footer */}
        <div className="px-5 py-4 bg-white border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={handleContinue}
            className="w-full h-11 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors"
          >
            {safeSlideIdx < SLIDE_KEYS.length - 1
              ? 'Continuar'
              : `Ir a la semana ${report.nextWeekOfYear}`}
          </button>
        </div>
      </div>
    </div>
  );
};
