import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Edit2,
  Flame,
  MinusCircle,
  SquarePen,
  X,
} from 'lucide-react';
import {
  AppSettings,
  DailyQuizResponse,
  GlobalProgressSummary,
  Goal,
} from '../types/tracker';
import { getGoalPalette, GoalIconBadge } from '../utils/colorAndIcons';
import {
  buildDailyReport,
  buildDailyReportAnalytics,
  calculateMascotDailyContribution,
} from '../utils/dailyReport';
import { getEnergyLevelLabel, getGoalsWithDiagnostic } from '../utils/diagnosticEngine';
import { AnalyticalDiagnosticCard } from './AnalyticalDiagnosticCard';
import {
  addDays,
  formatQuantity,
  formatShortSpanishDate,
  getSpanishWeekdayShort,
  toLocalDateStr,
} from '../utils/paceEngine';

interface DailyReportModalProps {
  goals: Goal[];
  now: Date;
  settings: AppSettings;
  globalProgress: GlobalProgressSummary;
  initialDate?: string;
  dailyNotes: Record<string, string>;
  dailyQuizLogs: Record<string, DailyQuizResponse>;
  dismissedDiagnostics: Record<string, number>;
  isDayClosed: boolean;
  onClose: () => void;
  onCloseDay: (dateStr: string) => void;
  onInspectGoal: (goalId: string, dateStr: string) => void;
  onOpenDayQuiz: (dateStr: string) => void;
  onOpenQuickQuiz: (goalId: string, dateStr: string) => void;
  onSaveDailyNote: (dateStr: string, noteText: string) => void;
  onApplyMinimumDose: (goalId: string, nextTarget: number) => void;
  onDismissDiagnostic: (goalId: string, consecutiveSkips: number) => void;
}

export const DailyReportModal: React.FC<DailyReportModalProps> = ({
  goals,
  now,
  settings,
  globalProgress,
  initialDate,
  dailyNotes,
  dailyQuizLogs,
  dismissedDiagnostics,
  isDayClosed,
  onClose,
  onCloseDay,
  onInspectGoal,
  onOpenDayQuiz,
  onOpenQuickQuiz,
  onSaveDailyNote,
  onApplyMinimumDose,
  onDismissDiagnostic,
}) => {
  const todayStr = toLocalDateStr(now);
  const [reportDate, setReportDate] = useState<string>(initialDate || todayStr);
  const [editingNoteForDate, setEditingNoteForDate] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const report = useMemo(
    () => buildDailyReport(goals, reportDate, dailyNotes, dailyQuizLogs),
    [goals, reportDate, dailyNotes, dailyQuizLogs]
  );

  const analytics = useMemo(
    () => buildDailyReportAnalytics(goals, reportDate, dailyQuizLogs),
    [goals, reportDate, dailyQuizLogs]
  );

  const mascotContrib = useMemo(
    () =>
      calculateMascotDailyContribution(
        goals,
        reportDate,
        settings.mascotTrackId,
        globalProgress
      ),
    [goals, reportDate, settings.mascotTrackId, globalProgress]
  );

  const diagnostics = useMemo(
    () =>
      getGoalsWithDiagnostic(goals, reportDate, true, dailyQuizLogs).filter(
        (d) => dismissedDiagnostics[d.goal.id] !== d.consecutiveSkips
      ),
    [goals, reportDate, dailyQuizLogs, dismissedDiagnostics]
  );

  const currentDailyNote = dailyNotes[reportDate] || '';
  const isEditingDailyNote = editingNoteForDate === reportDate;
  const hasDayQuiz = Boolean(dailyQuizLogs[reportDate]);
  const dayEnergy = dailyQuizLogs[reportDate]?.energyLevel;

  // Motivational mini-summary of the day based on actual results
  const banner = useMemo(() => {
    if (report.totalCount === 0) {
      return {
        title: 'Día de descanso programado',
        subtitle:
          'Recarga energía hoy para volver con buen ritmo en tu siguiente jornada.',
        bgClass: 'from-slate-700 to-slate-800',
      };
    }
    if (report.completedCount === report.totalCount) {
      return {
        title: 'Día excelente.',
        subtitle:
          analytics.globalActiveStreak >= 3
            ? `Felicidades, llevas ${analytics.globalActiveStreak} días seguidos cumpliendo; así llegarás pronto a tus objetivos.`
            : 'Felicidades, así llegarás pronto a cumplir tus objetivos.',
        bgClass: 'from-[#3B4DF5] to-emerald-500',
      };
    }
    if (report.totalPct >= 75) {
      return {
        title: '¡Gran jornada hoy!',
        subtitle:
          'Estuviste muy cerca del cierre perfecto. Ese ritmo constante te acerca directo a tus metas.',
        bgClass: 'from-[#3B4DF5] to-cyan-500',
      };
    }
    if (report.totalPct >= 40) {
      return {
        title: 'Buen progreso hoy.',
        subtitle:
          'Cada hábito que sumaste hoy construye disciplina; sigue paso a paso hacia tus objetivos.',
        bgClass: 'from-[#3B4DF5] to-blue-600',
      };
    }
    if (report.totalPct > 0) {
      return {
        title: 'Avance valioso en un día retador.',
        subtitle:
          'Incluso completar una parte mantiene el hábito vivo. Mañana podrás dar el siguiente paso.',
        bgClass: 'from-slate-800 to-blue-700',
      };
    }
    if (dayEnergy === 'low') {
      return {
        title: 'Hoy tocó cuidar tu energía.',
        subtitle:
          'En días de baja carga, descansar sin culpa también sostiene el camino hacia tus objetivos.',
        bgClass: 'from-slate-700 to-slate-800',
      };
    }
    return {
      title: 'Hoy no se sumaron hábitos, y está bien.',
      subtitle:
        'Un día en pausa no borra tu camino; mañana retomas con un paso sencillo para volver al ritmo.',
      bgClass: 'from-slate-700 to-slate-800',
    };
  }, [
    report.totalCount,
    report.completedCount,
    report.totalPct,
    analytics.globalActiveStreak,
    dayEnergy,
  ]);

  // Multi-segment donut geometry for Cuerpo 1
  const donutSegments = useMemo(() => {
    const items = [...report.completed, ...report.partial, ...report.missed];
    const n = items.length;
    if (n === 0) return [];

    const radius = 58;
    const circumference = 2 * Math.PI * radius;
    const gap = n > 1 ? 5 : 0;
    const sliceLen = Math.max(4, circumference / n - gap);

    return items.map((item, idx) => {
      const ratio = Math.min(1, item.value / item.target);
      const fillLen = sliceLen * ratio;
      const offset = -(idx * (circumference / n));
      const color = getGoalPalette(item.goal.colorHex).fillBg;
      return {
        id: item.goal.id,
        circumference,
        sliceLen,
        fillLen,
        offset,
        color,
      };
    });
  }, [report.completed, report.partial, report.missed]);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-report-title"
    >
      <div className="w-full max-w-lg bg-[#F7F7FA] sm:bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-slate-100">
          <div className="min-w-0">
            <h2
              id="daily-report-title"
              className="font-display text-base sm:text-lg font-bold text-slate-900 truncate"
            >
              Reporte del día
            </h2>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide tabular-nums">
              {reportDate === todayStr ? 'Hoy · ' : ''}
              {getSpanishWeekdayShort(reportDate)} {formatShortSpanishDate(reportDate)}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenDayQuiz(reportDate)}
              aria-label="Cuestionario del día"
              title="Cuestionario del día"
              className="retro-press relative w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
            >
              <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
              {hasDayQuiz && (
                <span
                  className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#3B4DF5]"
                  aria-hidden="true"
                />
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Scrollable Report Body */}
        <div className="p-4 sm:p-5 space-y-4 max-h-[78vh] overflow-y-auto">
          {/* Date Switcher */}
          <div className="flex items-center justify-between gap-2 bg-white rounded-2xl border border-slate-200/80 px-2 py-1.5">
            <button
              type="button"
              onClick={() => setReportDate((d) => addDays(d, -1))}
              aria-label="Día anterior"
              className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-700"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>

            <span className="text-xs sm:text-sm font-bold text-slate-900 tabular-nums">
              {reportDate === todayStr ? 'Hoy · ' : ''}
              {getSpanishWeekdayShort(reportDate)} {formatShortSpanishDate(reportDate)}
            </span>

            <div className="flex items-center gap-1">
              {reportDate !== todayStr && (
                <button
                  type="button"
                  onClick={() => setReportDate(todayStr)}
                  className="px-2.5 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700"
                >
                  Hoy
                </button>
              )}
              <button
                type="button"
                onClick={() => setReportDate((d) => addDays(d, 1))}
                aria-label="Día siguiente"
                className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-700"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Objective Banner */}
          <div
            className={`rounded-2xl bg-linear-to-r ${banner.bgClass} text-white px-4 py-3.5 shadow-xs`}
          >
            <div className="text-sm sm:text-base font-bold leading-snug">
              {banner.title}
            </div>
            <div className="text-xs text-white/90 mt-0.5">{banner.subtitle}</div>
          </div>

          {/* Mascot Current Stage + Missing % for Next Stage (Option B, no full route strip) */}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-blue-50/70 border border-blue-100 flex items-center justify-center text-3xl shrink-0">
                {mascotContrib.currentStage.emoji}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900 truncate">
                    {mascotContrib.currentStage.label}
                  </span>
                  <span className="font-mono text-sm font-bold text-[#3B4DF5] tabular-nums shrink-0">
                    {Math.round(mascotContrib.globalPct)}% global
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {mascotContrib.evolvedToday ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                      ✨ Subió de fase hoy (+{formatQuantity(mascotContrib.deltaPct)}%)
                    </span>
                  ) : mascotContrib.deltaPct > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold tabular-nums">
                      +{formatQuantity(mascotContrib.deltaPct)}% aportado hoy
                    </span>
                  ) : (
                    <span className="text-slate-500">0% sumado hoy</span>
                  )}

                  {mascotContrib.currentStage.nextEmoji &&
                  mascotContrib.pctToNextStage !== null ? (
                    <span className="text-slate-600 font-medium tabular-nums">
                      · Faltan {formatQuantity(mascotContrib.pctToNextStage)}% para{' '}
                      {mascotContrib.currentStage.nextEmoji}
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-medium">
                      · Etapa máxima alcanzada
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Cuerpo 1: Visualización de Logros (Donut Ring + Qué completé / Qué no) */}
          <section className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
            {report.totalCount === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No hay hábitos programados para este día.
              </div>
            ) : (
              <>
                {/* Ring Visualization */}
                <div className="pt-5 pb-4 px-4 flex flex-col items-center border-b border-slate-100">
                  <div className="relative w-40 h-40 flex items-center justify-center">
                    <svg
                      viewBox="0 0 144 144"
                      className="w-full h-full -rotate-90"
                      aria-hidden="true"
                    >
                      {donutSegments.map((seg) => (
                        <React.Fragment key={seg.id}>
                          {/* Background track for this habit slice */}
                          <circle
                            cx="72"
                            cy="72"
                            r="58"
                            fill="none"
                            stroke="#E2E8F0"
                            strokeWidth="14"
                            strokeLinecap="round"
                            strokeDasharray={`${seg.sliceLen} ${seg.circumference}`}
                            strokeDashoffset={seg.offset}
                          />
                          {/* Completed fill for this habit slice */}
                          {seg.fillLen > 0.5 && (
                            <circle
                              cx="72"
                              cy="72"
                              r="58"
                              fill="none"
                              stroke={seg.color}
                              strokeWidth="14"
                              strokeLinecap="round"
                              strokeDasharray={`${seg.fillLen} ${seg.circumference}`}
                              strokeDashoffset={seg.offset}
                            />
                          )}
                        </React.Fragment>
                      ))}
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                      <span className="text-xs font-bold text-slate-700 tabular-nums">
                        {report.completedCount} DE {report.totalCount}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        completados
                      </span>
                      <span className="font-mono text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5">
                        {report.totalPct}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Qué completé y qué no */}
                <div className="divide-y divide-slate-100">
                  {/* Completed */}
                  {report.completed.map((item) => (
                    <button
                      key={item.goal.id}
                      type="button"
                      onClick={() => onInspectGoal(item.goal.id, reportDate)}
                      className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <GoalIconBadge
                          iconType={item.goal.iconType || 'icon'}
                          iconValue={item.goal.iconValue || 'activity'}
                          colorHex={item.goal.colorHex || '#3B4DF5'}
                          sizeClass="w-8 h-8"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {item.goal.title}
                          </div>
                          {item.goal.trackingMode !== 'boolean' && (
                            <div className="text-[11px] font-mono text-emerald-700 tabular-nums">
                              {formatQuantity(item.value)}/{formatQuantity(item.target)}
                              {item.goal.trackingMode === 'measure' && item.goal.unit
                                ? ` ${item.goal.unit}`
                                : ''}
                            </div>
                          )}
                        </div>
                      </div>
                      <CheckCircle2
                        className="w-5 h-5 text-emerald-600 shrink-0"
                        aria-label="Completado"
                      />
                    </button>
                  ))}

                  {/* Partial */}
                  {report.partial.map((item) => {
                    const hasQuiz = Boolean(item.goal.quizLogs?.[reportDate]);
                    return (
                      <div
                        key={item.goal.id}
                        className="px-4 py-3 flex items-center justify-between gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => onInspectGoal(item.goal.id, reportDate)}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left"
                        >
                          <GoalIconBadge
                            iconType={item.goal.iconType || 'icon'}
                            iconValue={item.goal.iconValue || 'activity'}
                            colorHex={item.goal.colorHex || '#3B4DF5'}
                            sizeClass="w-8 h-8"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {item.goal.title}
                            </div>
                            <div className="text-[11px] font-mono text-amber-700 tabular-nums">
                              Parcial · {formatQuantity(item.value)}/{formatQuantity(item.target)}
                              {item.goal.trackingMode === 'measure' && item.goal.unit
                                ? ` ${item.goal.unit}`
                                : ''}{' '}
                              ({item.pct}%)
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onOpenQuickQuiz(item.goal.id, reportDate)}
                            aria-label={`Cuestionario del día para ${item.goal.title}`}
                            title="Cuestionario del día"
                            className="relative w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600"
                          >
                            <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />
                            {hasQuiz && (
                              <span
                                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#3B4DF5]"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                          <Clock
                            className="w-5 h-5 text-amber-500 shrink-0"
                            aria-label="Avance parcial"
                          />
                        </div>
                      </div>
                    );
                  })}

                  {/* Missed / Incomplete */}
                  {report.missed.map((item) => {
                    const hasQuiz = Boolean(item.goal.quizLogs?.[reportDate]);
                    return (
                      <div
                        key={item.goal.id}
                        className="px-4 py-3 flex items-center justify-between gap-3 bg-slate-50/50"
                      >
                        <button
                          type="button"
                          onClick={() => onInspectGoal(item.goal.id, reportDate)}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left"
                        >
                          <GoalIconBadge
                            iconType={item.goal.iconType || 'icon'}
                            iconValue={item.goal.iconValue || 'activity'}
                            colorHex={item.goal.colorHex || '#3B4DF5'}
                            sizeClass="w-8 h-8"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-600 truncate">
                              {item.goal.title}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Sin completar hoy
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onOpenQuickQuiz(item.goal.id, reportDate)}
                            aria-label={`Cuestionario del día para ${item.goal.title}`}
                            title="Cuestionario del día"
                            className="relative w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600"
                          >
                            <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />
                            {hasQuiz && (
                              <span
                                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#3B4DF5]"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                          <MinusCircle
                            className="w-5 h-5 text-slate-300 shrink-0"
                            aria-label="Sin completar"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {/* Cuerpo 2: Rachas Consecutivas Reales */}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-amber-100/80 text-amber-600 flex items-center justify-center shrink-0">
                  <Flame className="w-5 h-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Racha consecutiva
                  </div>
                  <div className="font-mono text-lg font-extrabold text-slate-900 tabular-nums leading-tight">
                    {analytics.globalActiveStreak}{' '}
                    {analytics.globalActiveStreak === 1 ? 'día' : 'días'}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Mejor racha
                </div>
                <div className="font-mono text-sm font-bold text-slate-700 tabular-nums">
                  {analytics.bestGlobalStreak}{' '}
                  {analytics.bestGlobalStreak === 1 ? 'día' : 'días'}
                </div>
              </div>
            </div>
          </section>

          {/* Concrete Per-Habit Information (Streaks & Missed Days) */}
          {analytics.insights.length > 0 && (
            <section className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1">
                Resumen concreto de tus hábitos
              </div>
              <div className="space-y-2">
                {analytics.insights.map((insight) => {
                  const styleClass =
                    insight.tone === 'reward'
                      ? 'bg-emerald-50/70 border-emerald-200/80'
                      : insight.tone === 'alert'
                      ? 'bg-white border-slate-200/90'
                      : 'bg-white border-slate-200/70';

                  return (
                    <button
                      key={insight.id}
                      type="button"
                      onClick={() => onInspectGoal(insight.goalId, reportDate)}
                      className={`w-full text-left rounded-2xl border p-3.5 flex items-start gap-3 hover:brightness-[0.98] transition-all ${styleClass}`}
                    >
                      <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden="true">
                        {insight.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-semibold text-slate-900 leading-snug">
                          {insight.headline}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                          {insight.detail}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* 3+ Consecutive Skips Analytical Diagnostics */}
          {diagnostics.length > 0 && (
            <div className="space-y-3">
              {diagnostics.map((diag) => (
                <AnalyticalDiagnosticCard
                  key={diag.goal.id}
                  diagnostic={diag}
                  onApplyMinimumDose={onApplyMinimumDose}
                  onInspectHabit={(goalId) => onInspectGoal(goalId, reportDate)}
                  onDismiss={(goalId) =>
                    onDismissDiagnostic(goalId, diag.consecutiveSkips)
                  }
                />
              ))}
            </div>
          )}

          {/* Notas del día (at the very bottom in a box) */}
          <section className="bg-white rounded-2xl border border-slate-200/90 p-4">
            {isEditingDailyNote ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onSaveDailyNote(reportDate, noteDraft.trim());
                  setEditingNoteForDate(null);
                }}
                className="space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="report-daily-note-input"
                    className="text-xs font-bold text-slate-900"
                  >
                    Notas del día
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditingNoteForDate(null)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Cancelar
                  </button>
                </div>
                <textarea
                  id="report-daily-note-input"
                  rows={3}
                  autoFocus
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Escribe libremente cómo fue tu día..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-2 focus:outline-blue-600"
                />
                <div className="flex items-center justify-end">
                  <button
                    type="submit"
                    className="px-3.5 h-8 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-xs font-semibold"
                  >
                    Guardar nota
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                    <SquarePen className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900">
                      Notas del día
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600 whitespace-pre-wrap">
                      {currentDailyNote.trim()
                        ? currentDailyNote
                        : 'Aún no hay notas escritas para este día.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNoteDraft(currentDailyNote);
                    setEditingNoteForDate(reportDate);
                  }}
                  className="px-3 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 shrink-0"
                >
                  <Edit2 className="w-3 h-3" aria-hidden="true" />
                  <span>{currentDailyNote.trim() ? 'Editar' : 'Escribir'}</span>
                </button>
              </div>
            )}
          </section>

          {/* Energía registrada (hasta abajo del reporte diario) */}
          {dayEnergy && (
            <section className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3 flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 font-medium">Energía registrada</span>
              <span className="font-semibold text-slate-900">
                {getEnergyLevelLabel(dayEnergy)}
              </span>
            </section>
          )}
        </div>

        {/* Bottom CTA: Cerrar el día (Option B, no Copy Report button) */}
        <div className="px-5 py-4 bg-white border-t border-slate-100">
          <button
            type="button"
            onClick={() => onCloseDay(reportDate)}
            className="retro-press w-full h-11 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
          >
            {isDayClosed ? (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>Día cerrado · Volver</span>
              </>
            ) : (
              <span>Cerrar el día</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
