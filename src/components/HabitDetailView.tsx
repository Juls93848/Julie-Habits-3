import React, { useMemo, useState } from 'react';
import {
  Archive,
  BarChart2,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  Repeat,
  RotateCcw,
  Sparkles,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { DailyQuizResponse, Goal, HabitPhaseOutcome } from '../types/tracker';
import { getGoalPalette, GoalIconBadge } from '../utils/colorAndIcons';
import { computeHabitDiagnostic } from '../utils/diagnosticEngine';
import { AnalyticalDiagnosticCard } from './AnalyticalDiagnosticCard';
import {
  calculateGoalProgress,
  formatFrequencySummary,
  formatPermanentCycleLabel,
  formatQuantity,
  formatShortPermanentCycleLabel,
  formatShortSpanishDate,
  getDayCompletionStats,
  getPaceLabel,
  getPermanentCycleDays,
  getSpanishWeekdayShort,
  isDateScheduledForGoal,
  isDateWithinGoal,
  isPhaseCompletedPromptNeeded,
  toLocalDateStr,
} from '../utils/paceEngine';

interface HabitDetailViewProps {
  goal: Goal;
  now: Date;
  initialDate?: string;
  dailyQuizLogs: Record<string, DailyQuizResponse>;
  onBack: () => void;
  onEditHabit: () => void;
  onOpenDetailedStats?: () => void;
  onDeleteHabit: () => void;
  onOpenEvolveModal: () => void;
  onMakePermanent: (cycleDays: number) => void;
  onUpdatePermanentCycle: (cycleDays: number) => void;
  onArchiveHabit: () => void;
  onUnarchiveHabit: () => void;
  onUpdateProgress: (dateStr: string, nextValue: number, event?: React.MouseEvent) => void;
  onMarkSkipped?: (dateStr: string) => void;
  onOpenCounterModal: (dateStr: string) => void;
  onSaveNote: (dateStr: string, noteText: string) => void;
  onOpenIndividualQuiz: (goalId: string, dateStr: string) => void;
  onApplyMinimumDose: (goalId: string, nextTarget: number) => void;
}

const MONTH_NAMES_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

const PHASE_OUTCOME_LABEL: Record<HabitPhaseOutcome, string> = {
  evolved: 'Evolucionó',
  permanent: 'Pasó a permanente',
  cycle_renewed: 'Ciclo cerrado',
  archived: 'Archivado',
};

export const HabitDetailView: React.FC<HabitDetailViewProps> = ({
  goal,
  now,
  initialDate,
  dailyQuizLogs,
  onBack,
  onEditHabit,
  onOpenDetailedStats,
  onDeleteHabit,
  onOpenEvolveModal,
  onMakePermanent,
  onUpdatePermanentCycle,
  onArchiveHabit,
  onUnarchiveHabit,
  onUpdateProgress,
  onMarkSkipped,
  onOpenCounterModal,
  onSaveNote,
  onOpenIndividualQuiz,
  onApplyMinimumDose,
}) => {
  const todayStr = toLocalDateStr(now);
  const palette = getGoalPalette(goal.colorHex);
  const currentCycleDays = getPermanentCycleDays(goal);
  const progress = useMemo(() => calculateGoalProgress(goal, now), [goal, now]);
  const phasePromptNeeded = useMemo(
    () => isPhaseCompletedPromptNeeded(goal, todayStr),
    [goal, todayStr]
  );
  const diagnostic = useMemo(
    () => computeHabitDiagnostic(goal, todayStr, now.getHours() >= 22, dailyQuizLogs),
    [goal, todayStr, now, dailyQuizLogs]
  );

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (initialDate) return initialDate;
    return isDateWithinGoal(goal, todayStr) ? todayStr : goal.startDate;
  });

  const [viewYear, setViewYear] = useState<number>(() =>
    Number(selectedDate.split('-')[0])
  );
  const [viewMonth, setViewMonth] = useState<number>(
    () => Number(selectedDate.split('-')[1]) - 1
  );

  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cyclePickerOpen, setCyclePickerOpen] = useState(false);
  const [cycleDaysDraft, setCycleDaysDraft] = useState<number>(() =>
    getPermanentCycleDays(goal)
  );

  // Build Monday-first calendar grid for viewYear / viewMonth
  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7; // 0=Mon..6=Sun
    const gridStart = new Date(viewYear, viewMonth, 1 - startWeekday);

    const cells: Array<{ dateStr: string; dayNum: number; inMonth: boolean }> = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push({
        dateStr: toLocalDateStr(d),
        dayNum: d.getDate(),
        inMonth: d.getMonth() === viewMonth,
      });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const jumpToToday = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(todayStr);
    setEditingNote(false);
  };

  const selectedNote = goal.notes?.[selectedDate] || '';
  const selectedStats = getDayCompletionStats(goal, selectedDate);
  const unitSuffix =
    goal.trackingMode === 'measure' && goal.unit ? ` ${goal.unit}` : '';

  const allNotesSorted = useMemo(() => {
    const entries = Object.entries(goal.notes || {}).filter(
      ([, txt]) => txt && txt.trim().length > 0
    );
    return entries.sort(([a], [b]) => b.localeCompare(a));
  }, [goal.notes]);

  const handleOpenNoteEditor = () => {
    setNoteDraft(selectedNote);
    setEditingNote(true);
  };

  const handleSubmitNote = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveNote(selectedDate, noteDraft.trim());
    setEditingNote(false);
  };

  const handleSelectedDayAction = (e: React.MouseEvent) => {
    if (goal.trackingMode === 'boolean') {
      onUpdateProgress(selectedDate, selectedStats.isDone ? 0 : 1, e);
    } else {
      onOpenCounterModal(selectedDate);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Action Bar (only place where Habit can be edited/deleted!) */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver"
          className="retro-press inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-white border border-slate-200/90 text-xs font-semibold text-slate-800 shadow-2xs hover:bg-slate-50"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          <span>Volver</span>
        </button>

        <div className="flex items-center gap-2">
          {onOpenDetailedStats && (
            <button
              type="button"
              onClick={onOpenDetailedStats}
              aria-label="Ver estadísticas detalladas del hábito"
              title="Estadísticas detalladas"
              className="retro-press w-10 h-10 rounded-full bg-white border border-slate-200/90 text-slate-600 hover:text-[#3B4DF5] hover:bg-indigo-50 flex items-center justify-center shadow-2xs"
            >
              <BarChart2 className="w-4 h-4" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={onEditHabit}
            aria-label="Modificar hábito"
            className="retro-press inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-white border border-slate-200/90 text-xs font-semibold text-slate-800 shadow-2xs hover:bg-slate-50"
          >
            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Editar hábito</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmDelete((v) => !v)}
            aria-label="Eliminar hábito"
            className="retro-press w-10 h-10 rounded-full bg-white border border-slate-200/90 text-slate-500 hover:text-red-600 hover:bg-red-50 flex items-center justify-center shadow-2xs"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-red-800">
            ¿Eliminar "{goal.title}" y todo su historial?
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-slate-700 font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onDeleteHabit}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold"
            >
              Eliminar
            </button>
          </div>
        </div>
      )}

      {/* Habit Summary Card */}
      <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <GoalIconBadge
              iconType={goal.iconType || 'icon'}
              iconValue={goal.iconValue || 'activity'}
              colorHex={goal.colorHex || '#3B4DF5'}
              sizeClass="w-12 h-12"
            />
            <div className="min-w-0">
              <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900 truncate">
                {goal.title}
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 tabular-nums">
                <span className="font-medium text-slate-700">
                  {goal.area || 'Personal'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatFrequencySummary(goal.frequency)}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {formatShortSpanishDate(goal.startDate)} –{' '}
                  {formatShortSpanishDate(goal.deadlineDate)}
                </span>
                {(goal.phaseNumber && goal.phaseNumber > 1) || goal.isPermanent || goal.isArchived ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-slate-700">
                      {goal.isArchived
                        ? 'Archivado'
                        : goal.isPermanent
                        ? `Fase ${goal.phaseNumber || 1} · Permanente`
                        : `Fase ${goal.phaseNumber}`}
                    </span>
                  </>
                ) : null}
                {goal.trackPace && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-700">
                      {getPaceLabel(progress.status)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div
            className="font-mono text-sm font-bold px-3 py-1.5 rounded-xl shrink-0 tabular-nums"
            style={{
              backgroundColor: palette.softBg,
              color: palette.iconFg,
            }}
          >
            {Math.round(progress.actualPct)}%
          </div>
        </div>
      </section>

      {/* Phase Completed Prompt Banner */}
      {phasePromptNeeded && (
        <section className="rounded-2xl bg-indigo-50/90 border border-indigo-200 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-white border border-indigo-200 text-[#3B4DF5] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                Etapa completada · {Math.round(progress.completedDaysEquivalent)}/{progress.totalScheduledDays} ({Math.round(progress.actualPct)}%)
              </h2>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Esta fase llegó a su fecha límite. Puedes evolucionar a una nueva etapa, dejar el hábito permanente o archivarlo.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenEvolveModal}
              className="px-3.5 h-9 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Evolucionar</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCycleDaysDraft(currentCycleDays);
                setCyclePickerOpen(true);
              }}
              className="px-3.5 h-9 rounded-full bg-white border border-indigo-200 hover:bg-indigo-100/60 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Repeat className="w-3.5 h-3.5 text-[#3B4DF5]" aria-hidden="true" />
              <span>Hacer permanente</span>
            </button>
            <button
              type="button"
              onClick={onArchiveHabit}
              className="px-3.5 h-9 rounded-full bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Archive className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Archivar</span>
            </button>
          </div>
        </section>
      )}

      {diagnostic && (
        <AnalyticalDiagnosticCard
          diagnostic={diagnostic}
          onApplyMinimumDose={onApplyMinimumDose}
          onInspectHabit={() => onEditHabit()}
        />
      )}

      {/* Monthly Calendar (matching screenshot 2) */}
      <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-400 mb-2">
          <span>lun</span>
          <span>mar</span>
          <span>mié</span>
          <span>jue</span>
          <span>vie</span>
          <span>sáb</span>
          <span>dom</span>
        </div>

        <div className="grid grid-cols-7 gap-y-1.5 text-center">
          {calendarCells.map((cell) => {
            const stats = getDayCompletionStats(goal, cell.dateStr);
            const hasNote = Boolean(goal.notes?.[cell.dateStr]?.trim());
            const isSelected = cell.dateStr === selectedDate;
            const inRange = isDateWithinGoal(goal, cell.dateStr);

            return (
              <div key={cell.dateStr} className="flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(cell.dateStr);
                    setEditingNote(false);
                  }}
                  className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center text-sm font-mono transition-all ${
                    isSelected ? 'ring-2 ring-offset-1 font-bold' : ''
                  } ${!cell.inMonth ? 'opacity-30' : ''}`}
                  style={{
                    backgroundColor: stats.isDone
                      ? palette.softBg
                      : isSelected
                      ? '#F8FAFC'
                      : 'transparent',
                    color: isSelected
                      ? '#0F172A'
                      : inRange
                      ? '#1E293B'
                      : '#94A3B8',
                    boxShadow: isSelected
                      ? `0 0 0 2px ${palette.fillBg}`
                      : undefined,
                  }}
                >
                  <span className="leading-none">{cell.dayNum}</span>
                  <div className="flex items-center gap-0.5 mt-1 h-1.5">
                    {stats.value > 0 && (
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          backgroundColor: stats.isDone
                            ? palette.fillBg
                            : palette.border,
                        }}
                      />
                    )}
                    {hasNote && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {/* Month Navigation Footer */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-800">
            {MONTH_NAMES_ES[viewMonth]} {viewYear}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={jumpToToday}
              className="px-3.5 h-9 rounded-full border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Mes anterior"
              className="w-9 h-9 rounded-full border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-700"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Mes siguiente"
              className="w-9 h-9 rounded-full border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-700"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Selected Day Progress Quick Action */}
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-slate-600 tabular-nums">
              <span className="font-semibold text-slate-900">
                {getSpanishWeekdayShort(selectedDate)}{' '}
                {formatShortSpanishDate(selectedDate)}:
              </span>{' '}
              {goal.trackingMode === 'boolean'
                ? selectedStats.isDone
                  ? 'Completado'
                  : goal.skipped?.[selectedDate]
                  ? 'Pausado'
                  : isDateWithinGoal(goal, selectedDate) &&
                    !isDateScheduledForGoal(goal, selectedDate)
                  ? 'Opcional (día no programado)'
                  : 'Sin completar'
                : `${formatQuantity(selectedStats.value)} / ${formatQuantity(selectedStats.target)}${unitSuffix} (${selectedStats.pct}%)`}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {onMarkSkipped && !selectedStats.isDone && selectedStats.value === 0 && (
                <button
                  type="button"
                  onClick={() => onMarkSkipped(selectedDate)}
                  className={`px-3 h-9 rounded-full text-xs font-semibold border transition-colors ${
                    goal.skipped?.[selectedDate]
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {goal.skipped?.[selectedDate] ? 'Pausado' : 'Omitir'}
                </button>
              )}
              <button
                type="button"
                onClick={handleSelectedDayAction}
                className="retro-press px-3.5 h-9 rounded-full text-xs font-semibold inline-flex items-center gap-1.5"
                style={{
                  backgroundColor: selectedStats.isDone ? palette.fillBg : palette.softBg,
                  color: selectedStats.isDone ? '#FFFFFF' : palette.iconFg,
                }}
              >
                {goal.trackingMode === 'boolean' ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                    <span>{selectedStats.isDone ? 'Hecho' : 'Marcar'}</span>
                  </>
                ) : (
                  <span>Modificar ({formatQuantity(selectedStats.value)})</span>
                )}
              </button>
            </div>
          </div>

          {(Boolean(goal.quizLogs?.[selectedDate]) || !selectedStats.isDone) && (
            <button
              type="button"
              onClick={() => onOpenIndividualQuiz(goal.id, selectedDate)}
              className="w-full flex items-center justify-between gap-2 text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100 rounded-xl px-3.5 py-2.5 border border-slate-200/70 transition-colors text-left"
            >
              <span>Cuestionario del día</span>
              {goal.quizLogs?.[selectedDate] ? (
                <Check className="w-4 h-4 text-[#3B4DF5] shrink-0" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </section>

      {/* Daily Written Notes Card (matching screenshot 2 bottom) */}
      <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
        {editingNote ? (
          <form onSubmit={handleSubmitNote} className="space-y-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor="daily-note-input"
                className="text-xs font-bold text-slate-900"
              >
                Nota del {getSpanishWeekdayShort(selectedDate).toLowerCase()}{' '}
                {formatShortSpanishDate(selectedDate)}
              </label>
              <button
                type="button"
                onClick={() => setEditingNote(false)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Cancelar
              </button>
            </div>
            <textarea
              id="daily-note-input"
              rows={3}
              autoFocus
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="¿Qué fue bien? ¿Qué se interpuso?"
              className="w-full p-3 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-2 focus:outline-blue-600"
            />
            <div className="flex items-center justify-end gap-2">
              {selectedNote && (
                <button
                  type="button"
                  onClick={() => {
                    onSaveNote(selectedDate, '');
                    setEditingNote(false);
                  }}
                  className="px-3.5 h-9 rounded-full border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-50"
                >
                  Borrar nota
                </button>
              )}
              <button
                type="submit"
                className="px-4 h-9 rounded-full text-white text-xs font-semibold"
                style={{ backgroundColor: palette.fillBg }}
              >
                Guardar nota
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleOpenNoteEditor}
              className="flex items-start gap-3 min-w-0 flex-1 text-left"
            >
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: palette.softBg,
                  color: palette.iconFg,
                }}
              >
                <SquarePen className="w-4 h-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-900">
                  {selectedNote
                    ? `Nota · ${formatShortSpanishDate(selectedDate)}`
                    : 'Aún no hay notas'}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">
                  {selectedNote || '¿Qué fue bien? ¿Qué se interpuso?'}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={handleOpenNoteEditor}
              aria-label={selectedNote ? 'Editar nota' : 'Añadir nota'}
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors"
              style={{
                backgroundColor: palette.softBg,
                color: palette.iconFg,
              }}
            >
              {selectedNote ? (
                <Edit3 className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Plus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
              )}
            </button>
          </div>
        )}

        {/* Recent Notes History */}
        {allNotesSorted.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Notas registradas ({allNotesSorted.length})
            </div>
            <div className="space-y-1.5">
              {allNotesSorted.map(([dStr, txt]) => (
                <button
                  key={dStr}
                  type="button"
                  onClick={() => {
                    setSelectedDate(dStr);
                    setViewYear(Number(dStr.split('-')[0]));
                    setViewMonth(Number(dStr.split('-')[1]) - 1);
                    setEditingNote(false);
                  }}
                  className={`w-full p-2.5 rounded-xl text-left text-xs transition-colors ${
                    dStr === selectedDate
                      ? 'bg-slate-100 text-slate-900'
                      : 'bg-slate-50/70 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="font-mono text-[11px] font-semibold text-slate-500 mb-0.5">
                    {getSpanishWeekdayShort(dStr)} {formatShortSpanishDate(dStr)}
                  </div>
                  <div className="line-clamp-2">{txt}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Etapa y Ruta de Evolución */}
      <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Etapa y ruta de evolución
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {goal.isArchived
                ? 'Proyecto archivado en tu historial.'
                : goal.isPermanent
                ? `Fase ${goal.phaseNumber || 1} · Permanente en ciclos de evaluación: ${formatPermanentCycleLabel(
                    currentCycleDays
                  )}.`
                : `Fase ${goal.phaseNumber || 1} · Proyecto temporal hasta el ${formatShortSpanishDate(
                    goal.deadlineDate
                  )}.`}
            </p>
          </div>
        </div>

        {/* Manual Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {goal.isArchived ? (
            <button
              type="button"
              onClick={onUnarchiveHabit}
              className="px-4 h-9 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reactivar hábito</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onOpenEvolveModal}
                className="px-3.5 h-9 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Evolucionar</span>
              </button>

              {!goal.isPermanent ? (
                <button
                  type="button"
                  onClick={() => {
                    setCycleDaysDraft(currentCycleDays);
                    setCyclePickerOpen((v) => !v);
                  }}
                  className="px-3.5 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Hacer permanente</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setCycleDaysDraft(currentCycleDays);
                    setCyclePickerOpen((v) => !v);
                  }}
                  className="px-3.5 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Cambiar ciclo ({currentCycleDays}d)</span>
                </button>
              )}

              <button
                type="button"
                onClick={onArchiveHabit}
                className="px-3.5 h-9 rounded-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Archivar</span>
              </button>
            </>
          )}
        </div>

        {/* Inline Cycle Frequency Organizer */}
        {cyclePickerOpen && !goal.isArchived && (
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">
                {goal.isPermanent
                  ? 'Organizar ciclos de evaluación'
                  : 'Elige cada cuántos días evaluar el progreso'}
              </span>
              <button
                type="button"
                onClick={() => setCyclePickerOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Cancelar
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { days: 7, label: 'Semanal (7d)' },
                { days: 14, label: 'Quincenal (14d)' },
                { days: 15, label: '15 días' },
                { days: 30, label: 'Mensual (30d)' },
              ].map((opt) => {
                const selected = cycleDaysDraft === opt.days;
                return (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setCycleDaysDraft(opt.days)}
                    className={`h-8 px-2 rounded-lg border text-[11px] font-semibold transition-colors ${
                      selected
                        ? 'text-white border-transparent'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                    style={selected ? { backgroundColor: palette.fillBg } : undefined}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-600">
                  Días por ciclo:
                </span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={cycleDaysDraft}
                  onChange={(e) =>
                    setCycleDaysDraft(
                      Math.max(1, Math.min(365, Math.round(Number(e.target.value) || 1)))
                    )
                  }
                  aria-label="Días por ciclo permanente"
                  className="w-16 h-8 text-center rounded-lg border border-slate-200 bg-white font-mono text-xs font-bold text-slate-900"
                />
                <span className="text-[11px] text-slate-500">
                  ({formatPermanentCycleLabel(cycleDaysDraft)})
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  const safeDays = Math.max(
                    1,
                    Math.min(365, Math.round(cycleDaysDraft || 30))
                  );
                  if (goal.isPermanent) {
                    onUpdatePermanentCycle(safeDays);
                  } else {
                    onMakePermanent(safeDays);
                  }
                  setCyclePickerOpen(false);
                }}
                className="px-4 h-8 rounded-full text-white text-xs font-semibold"
                style={{ backgroundColor: palette.fillBg }}
              >
                {goal.isPermanent ? 'Aplicar ciclo' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}

        {/* Evolution Route Timeline */}
        <div className="pt-2 border-t border-slate-100 space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Ruta de progreso
          </div>

          <div className="space-y-2.5 pl-1">
            {(goal.phaseHistory || []).map((rec) => (
              <div key={rec.id} className="flex items-start gap-3">
                <span className="mt-1 w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0" />
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold text-slate-800">
                      Fase {rec.phaseNumber}: {rec.title}
                    </span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      {PHASE_OUTCOME_LABEL[rec.outcome]}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                    {rec.frequencySummary} · {formatShortSpanishDate(rec.startDate)} –{' '}
                    {formatShortSpanishDate(rec.deadlineDate)} ·{' '}
                    <strong className="font-mono text-slate-700">
                      {rec.completedDays}/{rec.scheduledDays} ({rec.pct}%)
                    </strong>
                  </div>
                </div>
              </div>
            ))}

            {/* Current Phase Node */}
            <div className="flex items-start gap-3">
              <span
                className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor: goal.isArchived ? '#94A3B8' : palette.fillBg,
                }}
              />
              <div className="min-w-0 flex-1 text-xs">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-bold text-slate-900">
                    Fase {goal.phaseNumber || 1}: {goal.title}
                  </span>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                    style={{
                      backgroundColor: goal.isArchived ? '#F1F5F9' : palette.softBg,
                      color: goal.isArchived ? '#475569' : palette.iconFg,
                    }}
                  >
                    {goal.isArchived
                      ? 'Archivado'
                      : goal.isPermanent
                      ? `${formatShortPermanentCycleLabel(currentCycleDays)} activo`
                      : 'Etapa actual'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                  {formatFrequencySummary(goal.frequency)} ·{' '}
                  {formatShortSpanishDate(goal.startDate)} –{' '}
                  {formatShortSpanishDate(goal.deadlineDate)} ·{' '}
                  <strong className="font-mono text-slate-700">
                    {Math.round(progress.completedDaysEquivalent)}/
                    {progress.totalScheduledDays} ({Math.round(progress.actualPct)}%)
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
