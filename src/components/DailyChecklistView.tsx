import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  GripVertical,
  Sparkles,
  SquarePen,
  X,
} from 'lucide-react';
import { Goal, HabitDiagnostic } from '../types/tracker';
import { getGoalPalette, GoalIconBadge } from '../utils/colorAndIcons';
import { AnalyticalDiagnosticCard } from './AnalyticalDiagnosticCard';
import {
  addDays,
  calculateDailyTotalProgress,
  calculateGoalProgress,
  formatQuantity,
  formatShortSpanishDate,
  getDayCompletionStats,
  getPaceLabel,
  getSpanishWeekdayShort,
  isDateScheduledForGoal,
  toLocalDateStr,
} from '../utils/paceEngine';

interface DailyChecklistViewProps {
  goals: Goal[];
  now: Date;
  selectedDate: string;
  dailyNote: string;
  hasDailyQuiz: boolean;
  diagnostics: HabitDiagnostic[];
  finishedPhaseGoals?: Goal[];
  onSelectDate: (dateStr: string) => void;
  onUpdateProgress: (
    goalId: string,
    dateStr: string,
    nextValue: number,
    event?: React.MouseEvent
  ) => void;
  onReorderHabits: (reorderedVisibleIds: string[]) => void;
  onInspectGoal: (goalId: string, dateStr?: string) => void;
  onOpenCounterModal: (goalId: string, dateStr: string) => void;
  onOpenDayQuiz: (dateStr: string) => void;
  onSaveDailyNote: (dateStr: string, noteText: string) => void;
  onApplyMinimumDose: (goalId: string, nextTarget: number) => void;
  onDismissDiagnostic: (goalId: string, consecutiveSkips: number) => void;
  onDismissPhaseNotice?: (goalId: string) => void;
}

export const DailyChecklistView: React.FC<DailyChecklistViewProps> = ({
  goals,
  now,
  selectedDate,
  dailyNote,
  hasDailyQuiz,
  diagnostics,
  finishedPhaseGoals = [],
  onSelectDate,
  onUpdateProgress,
  onReorderHabits,
  onInspectGoal,
  onOpenCounterModal,
  onOpenDayQuiz,
  onSaveDailyNote,
  onApplyMinimumDose,
  onDismissDiagnostic,
  onDismissPhaseNotice,
}) => {
  const todayStr = toLocalDateStr(now);
  const [editingNoteForDate, setEditingNoteForDate] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [reorderMode, setReorderMode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef<boolean>(false);
  const pressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const checkPressTimerRef = useRef<number | null>(null);
  const checkLongPressTriggeredRef = useRef<boolean>(false);
  const checkPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  const goalsForDay = useMemo(
    () => goals.filter((g) => isDateScheduledForGoal(g, selectedDate)),
    [goals, selectedDate]
  );

  const visibleIdsRef = useRef<string[]>([]);
  visibleIdsRef.current = goalsForDay.map((g) => g.id);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressOriginRef.current = null;
  };

  const startLongPress = (goalId: string, clientX: number, clientY: number) => {
    if (goalsForDay.length < 2) return;
    clearLongPress();
    longPressTriggeredRef.current = false;
    pressOriginRef.current = { x: clientX, y: clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      longPressTimerRef.current = null;
      setReorderMode(true);
      setDraggingId(goalId);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12);
      }
    }, 420);
  };

  const moveLongPress = (clientX: number, clientY: number) => {
    const origin = pressOriginRef.current;
    if (!origin) return;
    if (
      Math.abs(clientX - origin.x) > 10 ||
      Math.abs(clientY - origin.y) > 10
    ) {
      clearLongPress();
    }
  };

  const moveHabitStep = (goalId: string, delta: -1 | 1) => {
    const ids = visibleIdsRef.current;
    const idx = ids.indexOf(goalId);
    const nextIdx = idx + delta;
    if (idx === -1 || nextIdx < 0 || nextIdx >= ids.length) return;
    const nextIds = [...ids];
    [nextIds[idx], nextIds[nextIdx]] = [nextIds[nextIdx], nextIds[idx]];
    onReorderHabits(nextIds);
  };

  useEffect(() => {
    if (!draggingId) return;

    const handlePointerMove = (e: PointerEvent) => {
      const ids = visibleIdsRef.current;
      const curIdx = ids.indexOf(draggingId);
      if (curIdx === -1) return;

      if (curIdx > 0) {
        const prevEl = cardRefs.current[ids[curIdx - 1]];
        if (prevEl) {
          const rect = prevEl.getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) {
            const nextIds = [...ids];
            [nextIds[curIdx - 1], nextIds[curIdx]] = [nextIds[curIdx], nextIds[curIdx - 1]];
            onReorderHabits(nextIds);
            return;
          }
        }
      }

      if (curIdx < ids.length - 1) {
        const nextEl = cardRefs.current[ids[curIdx + 1]];
        if (nextEl) {
          const rect = nextEl.getBoundingClientRect();
          if (e.clientY > rect.top + rect.height / 2) {
            const nextIds = [...ids];
            [nextIds[curIdx + 1], nextIds[curIdx]] = [nextIds[curIdx], nextIds[curIdx + 1]];
            onReorderHabits(nextIds);
          }
        }
      }
    };

    const handlePointerUp = () => {
      setDraggingId(null);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [draggingId, onReorderHabits]);

  useEffect(() => {
    if (goalsForDay.length < 2 && reorderMode) {
      setReorderMode(false);
      setDraggingId(null);
    }
  }, [goalsForDay.length, reorderMode]);

  const clearCheckLongPress = () => {
    if (checkPressTimerRef.current !== null) {
      window.clearTimeout(checkPressTimerRef.current);
      checkPressTimerRef.current = null;
    }
    checkPressOriginRef.current = null;
  };

  const startCheckLongPress = (
    goal: Goal,
    clientX: number,
    clientY: number
  ) => {
    clearCheckLongPress();
    checkLongPressTriggeredRef.current = false;
    if (goal.trackingMode === 'boolean') return;
    checkPressOriginRef.current = { x: clientX, y: clientY };
    checkPressTimerRef.current = window.setTimeout(() => {
      checkLongPressTriggeredRef.current = true;
      checkPressTimerRef.current = null;
      checkPressOriginRef.current = null;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12);
      }
      onOpenCounterModal(goal.id, selectedDate);
    }, 420);
  };

  const moveCheckLongPress = (clientX: number, clientY: number) => {
    const origin = checkPressOriginRef.current;
    if (!origin) return;
    if (
      Math.abs(clientX - origin.x) > 10 ||
      Math.abs(clientY - origin.y) > 10
    ) {
      clearCheckLongPress();
    }
  };

  useEffect(() => {
    return () => {
      clearLongPress();
      clearCheckLongPress();
    };
  }, []);

  const isEditingDailyNote = editingNoteForDate === selectedDate;
  const hasDailyNote = dailyNote.trim().length > 0;

  const handleOpenDailyNoteEditor = () => {
    setNoteDraft(dailyNote);
    setEditingNoteForDate(selectedDate);
  };

  const handleSubmitDailyNote = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveDailyNote(selectedDate, noteDraft.trim());
    setEditingNoteForDate(null);
  };

  const dayStrip = useMemo(() => {
    return [-3, -2, -1, 0, 1, 2, 3].map((offset) => addDays(selectedDate, offset));
  }, [selectedDate]);

  const dailyTotal = useMemo(
    () => calculateDailyTotalProgress(goals, selectedDate),
    [goals, selectedDate]
  );

  const handleCheckTap = (goal: Goal, event: React.MouseEvent) => {
    if (checkLongPressTriggeredRef.current) {
      checkLongPressTriggeredRef.current = false;
      return;
    }
    const stats = getDayCompletionStats(goal, selectedDate);
    onUpdateProgress(goal.id, selectedDate, stats.isDone ? 0 : stats.target, event);
  };

  return (
    <div className="space-y-4">
      {/* Independent Day Strip */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onSelectDate(addDays(selectedDate, -1))}
          aria-label="Día anterior"
          className="w-11 h-11 rounded-full bg-white border border-slate-200/90 flex items-center justify-center text-slate-700 shrink-0"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {dayStrip.map((dStr) => {
            const isSelected = dStr === selectedDate;
            const isToday = dStr === todayStr;
            const dayNum = Number(dStr.split('-')[2]);
            return (
              <button
                key={dStr}
                type="button"
                onClick={() => onSelectDate(dStr)}
                className={`retro-press min-w-[46px] h-12 px-2 rounded-xl flex flex-col items-center justify-center shrink-0 transition-colors ${
                  isSelected
                    ? 'bg-[#3B4DF5] text-white shadow-xs'
                    : 'bg-white border border-slate-200/80 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="text-[10px] font-medium opacity-80">
                  {getSpanishWeekdayShort(dStr)}
                </span>
                <span className="text-xs font-bold font-mono mt-0.5 tabular-nums">
                  {dayNum}
                  {isToday ? '·' : ''}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onSelectDate(addDays(selectedDate, 1))}
          aria-label="Día siguiente"
          className="w-11 h-11 rounded-full bg-white border border-slate-200/90 flex items-center justify-center text-slate-700 shrink-0"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Total Daily Progress Summary */}
      {goalsForDay.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200/80 px-4 sm:px-5 py-4 shadow-2xs">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div>
              <h1 className="text-sm font-bold text-slate-900">
                Progreso total del día
              </h1>
              <p className="text-xs text-slate-500 tabular-nums">
                {dailyTotal.completedHabits}/{dailyTotal.totalHabits} completados
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleOpenDailyNoteEditor}
                aria-label="Notas del día"
                title="Notas del día"
                className="retro-press relative w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors"
              >
                <SquarePen className="w-4 h-4" aria-hidden="true" />
                {hasDailyNote && (
                  <span
                    className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#3B4DF5]"
                    aria-hidden="true"
                  />
                )}
              </button>

              <button
                type="button"
                onClick={() => onOpenDayQuiz(selectedDate)}
                aria-label="Cuestionario del día"
                title="Cuestionario del día"
                className="retro-press relative w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors"
              >
                <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
                {hasDailyQuiz && (
                  <span
                    className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#3B4DF5]"
                    aria-hidden="true"
                  />
                )}
              </button>

              <span className="font-mono text-xl font-bold text-[#3B4DF5] tabular-nums ml-1">
                {dailyTotal.pct}%
              </span>
            </div>
          </div>

          <div
            className="h-2.5 rounded-full bg-slate-100 overflow-hidden"
            role="progressbar"
            aria-valuenow={dailyTotal.pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso total del día"
          >
            <div
              className="h-full rounded-full bg-[#3B4DF5] transition-[width] duration-200 ease-out"
              style={{ width: `${dailyTotal.pct}%` }}
            />
          </div>
        </section>
      )}

      {/* Calm Analytical Diagnostics for >= 3 consecutive skips */}
      {diagnostics.length > 0 && (
        <div className="space-y-2.5">
          {diagnostics.map((diag) => (
            <AnalyticalDiagnosticCard
              key={diag.goal.id}
              diagnostic={diag}
              onApplyMinimumDose={onApplyMinimumDose}
              onInspectHabit={(goalId) => onInspectGoal(goalId, selectedDate)}
              onDismiss={(goalId) =>
                onDismissDiagnostic(goalId, diag.consecutiveSkips)
              }
            />
          ))}
        </div>
      )}

      {/* Habits List */}
      {goalsForDay.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center">
          <p className="text-sm font-medium text-slate-700">
            No hay hábitos programados para el {formatShortSpanishDate(selectedDate)}.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleOpenDailyNoteEditor}
              aria-label="Notas del día"
              title="Notas del día"
              className="retro-press relative w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors"
            >
              <SquarePen className="w-4 h-4" aria-hidden="true" />
              {hasDailyNote && (
                <span
                  className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#3B4DF5]"
                  aria-hidden="true"
                />
              )}
            </button>

            <button
              type="button"
              onClick={() => onOpenDayQuiz(selectedDate)}
              aria-label="Cuestionario del día"
              title="Cuestionario del día"
              className="retro-press relative w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors"
            >
              <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
              {hasDailyQuiz && (
                <span
                  className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#3B4DF5]"
                  aria-hidden="true"
                />
              )}
            </button>

            {selectedDate !== todayStr && (
              <button
                type="button"
                onClick={() => onSelectDate(todayStr)}
                className="px-4 h-10 rounded-full bg-[#3B4DF5] text-white text-xs font-semibold"
              >
                Ir a hoy
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {reorderMode && (
            <div className="rounded-2xl bg-indigo-50/90 border border-indigo-200 px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900">
                  Reordenar hábitos
                </div>
                <div className="text-[11px] text-slate-600">
                  Arrastra desde el icono o usa las flechas para cambiar el orden.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReorderMode(false);
                  setDraggingId(null);
                }}
                className="px-3.5 h-8 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-xs font-semibold shrink-0"
              >
                Listo
              </button>
            </div>
          )}

          {goalsForDay.map((goal, goalIdx) => {
            const palette = getGoalPalette(goal.colorHex);
            const dayStats = getDayCompletionStats(goal, selectedDate);
            const pace = goal.trackPace ? calculateGoalProgress(goal, now) : null;
            const hasNote = Boolean(goal.notes?.[selectedDate]?.trim());
            const isSkipped =
              Boolean(goal.skipped?.[selectedDate]) && !dayStats.isDone && dayStats.value === 0;
            const showSubtitle =
              goal.trackingMode !== 'boolean' || hasNote || Boolean(pace);
            const unitSuffix =
              goal.trackingMode === 'measure' && goal.unit ? ` ${goal.unit}` : '';
            const isDraggingThis = draggingId === goal.id;

            return (
              <section
                key={goal.id}
                ref={(el) => {
                  cardRefs.current[goal.id] = el;
                }}
                className={`bg-white rounded-2xl border overflow-hidden transition-all ${
                  isDraggingThis
                    ? 'border-[#3B4DF5] ring-2 ring-[#3B4DF5]/30 shadow-md scale-[1.01] relative z-10 touch-none'
                    : reorderMode
                    ? 'border-slate-200/90 shadow-2xs touch-none'
                    : 'border-slate-200/80 shadow-2xs'
                }`}
                style={{
                  backgroundColor: dayStats.isDone
                    ? palette.softBg
                    : isSkipped
                    ? '#F8FAFC'
                    : '#FFFFFF',
                }}
              >
                <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
                  {reorderMode && (
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        setDraggingId(goal.id);
                      }}
                      aria-label={`Arrastrar ${goal.title}`}
                      className="w-8 h-10 -ml-1 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-grab active:cursor-grabbing touch-none shrink-0"
                    >
                      <GripVertical className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}

                  <button
                    type="button"
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      if (reorderMode) {
                        e.preventDefault();
                        setDraggingId(goal.id);
                        return;
                      }
                      startLongPress(goal.id, e.clientX, e.clientY);
                    }}
                    onPointerMove={(e) => {
                      if (!reorderMode) moveLongPress(e.clientX, e.clientY);
                    }}
                    onPointerUp={() => {
                      if (!reorderMode) clearLongPress();
                    }}
                    onPointerCancel={() => {
                      if (!reorderMode) clearLongPress();
                    }}
                    onPointerLeave={() => {
                      if (!reorderMode) clearLongPress();
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={() => {
                      if (reorderMode) return;
                      if (longPressTriggeredRef.current) {
                        longPressTriggeredRef.current = false;
                        return;
                      }
                      onInspectGoal(goal.id, selectedDate);
                    }}
                    className={`flex items-center gap-3 min-w-0 flex-1 text-left group select-none ${
                      reorderMode ? 'cursor-grab active:cursor-grabbing touch-none' : 'touch-manipulation'
                    }`}
                  >
                    <GoalIconBadge
                      iconType={goal.iconType || 'icon'}
                      iconValue={goal.iconValue || 'activity'}
                      colorHex={goal.colorHex || '#3B4DF5'}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm sm:text-[15px] font-bold truncate transition-colors ${
                            dayStats.isDone
                              ? 'line-through text-slate-500'
                              : isSkipped
                              ? 'text-slate-400'
                              : 'text-slate-900 group-hover:text-[#3B4DF5]'
                          }`}
                        >
                          {goal.title}
                        </span>
                      </div>
                      {showSubtitle && (
                        <div className="mt-0.5 text-xs text-slate-500 flex flex-wrap items-center gap-x-1.5 tabular-nums">
                          {goal.trackingMode !== 'boolean' && (
                            <span className="font-mono font-semibold text-slate-700">
                              {formatQuantity(dayStats.value)} / {formatQuantity(dayStats.target)}
                              {unitSuffix}
                            </span>
                          )}
                          {hasNote && (
                            <>
                              {goal.trackingMode !== 'boolean' && (
                                <span aria-hidden="true">·</span>
                              )}
                              <span className="font-medium text-amber-700">Nota</span>
                            </>
                          )}
                          {pace && (
                            <>
                              {(goal.trackingMode !== 'boolean' || hasNote) && (
                                <span aria-hidden="true">·</span>
                              )}
                              <span>{getPaceLabel(pace.status)}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Right Side: Reorder Arrows or % + Check / Manual Number Button */}
                  {reorderMode ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={goalIdx === 0}
                        onClick={() => moveHabitStep(goal.id, -1)}
                        aria-label={`Subir ${goal.title}`}
                        className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none text-slate-700 flex items-center justify-center transition-colors"
                      >
                        <ArrowUp className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={goalIdx === goalsForDay.length - 1}
                        onClick={() => moveHabitStep(goal.id, 1)}
                        aria-label={`Bajar ${goal.title}`}
                        className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none text-slate-700 flex items-center justify-center transition-colors"
                      >
                        <ArrowDown className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <span
                        className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg tabular-nums transition-colors"
                        style={{
                          backgroundColor: dayStats.isDone
                            ? palette.fillBg
                            : palette.iconBg,
                          color: dayStats.isDone ? '#FFFFFF' : palette.iconFg,
                        }}
                      >
                        {dayStats.pct}%
                      </span>

                      <button
                        type="button"
                        onPointerDown={(e) => {
                          if (e.pointerType === 'mouse' && e.button !== 0) return;
                          startCheckLongPress(goal, e.clientX, e.clientY);
                        }}
                        onPointerMove={(e) => {
                          moveCheckLongPress(e.clientX, e.clientY);
                        }}
                        onPointerUp={() => {
                          clearCheckLongPress();
                        }}
                        onPointerCancel={() => {
                          clearCheckLongPress();
                        }}
                        onPointerLeave={() => {
                          clearCheckLongPress();
                        }}
                        onContextMenu={(e) => {
                          if (goal.trackingMode !== 'boolean') {
                            e.preventDefault();
                          }
                        }}
                        onClick={(e) => handleCheckTap(goal, e)}
                        aria-label={
                          goal.trackingMode !== 'boolean'
                            ? `Registrar ${goal.title} (mantén presionado para escribir cantidad)`
                            : `Registrar ${goal.title}`
                        }
                        title={
                          goal.trackingMode !== 'boolean'
                            ? 'Toca para completar · Mantén presionado para escribir cantidad'
                            : undefined
                        }
                        aria-pressed={dayStats.isDone}
                        className="retro-press w-11 h-11 rounded-xl flex items-center justify-center transition-colors select-none touch-manipulation"
                        style={{
                          backgroundColor: dayStats.isDone ? palette.fillBg : '#FFFFFF',
                          border: `2px solid ${
                            dayStats.isDone ? palette.fillBg : palette.border
                          }`,
                          color: dayStats.isDone ? '#FFFFFF' : palette.iconFg,
                        }}
                      >
                        {dayStats.isDone ? (
                          <Check className="w-4 h-4 stroke-[3]" aria-hidden="true" />
                        ) : null}
                      </button>
                    </div>
                  )}
                </div>

                {/* Clear To-Do Checklist Rows for Check-Mode Counters / Measures */}
                {!reorderMode &&
                  goal.trackingMode !== 'boolean' &&
                  goal.tapAction !== 'enter_total' &&
                  Number.isInteger(dayStats.target) &&
                  dayStats.target >= 2 &&
                  dayStats.target <= 15 && (
                    <div className="border-t border-slate-200/60 divide-y divide-slate-100/90 bg-white/60">
                      {Array.from({ length: dayStats.target }, (_, idx) => {
                        const completedSteps = Math.floor(dayStats.value);
                        const isStepDone = idx < completedSteps;
                        const prefix =
                          goal.stepLabel?.trim() ||
                          (goal.trackingMode === 'measure' && goal.unit
                            ? null
                            : 'Sesión');
                        const itemLabel = prefix
                          ? `${prefix} ${idx + 1}`
                          : `${idx + 1} ${goal.unit}`;

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={(e) => {
                              const nextVal = isStepDone ? idx : idx + 1;
                              onUpdateProgress(goal.id, selectedDate, nextVal, e);
                            }}
                            aria-pressed={isStepDone}
                            className="w-full min-h-[44px] px-4 py-2.5 flex items-center gap-3 text-left hover:bg-slate-50/80 transition-colors"
                          >
                            <span
                              className="retro-press w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                              style={{
                                backgroundColor: isStepDone ? palette.fillBg : '#FFFFFF',
                                border: `2px solid ${
                                  isStepDone ? palette.fillBg : palette.border
                                }`,
                                color: '#FFFFFF',
                              }}
                            >
                              {isStepDone && (
                                <Check className="w-3.5 h-3.5 stroke-[3]" aria-hidden="true" />
                              )}
                            </span>

                            <span
                              className={`text-sm font-medium transition-colors ${
                                isStepDone
                                  ? 'line-through text-slate-400'
                                  : 'text-slate-800'
                              }`}
                            >
                              {itemLabel}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
              </section>
            );
          })}
        </div>
      )}

      {/* Calm Finished-Phase Notice (keeps daily cards completely clean) */}
      {selectedDate === todayStr && finishedPhaseGoals.length > 0 && (
        <div className="space-y-2">
          {finishedPhaseGoals.map((goal) => (
            <div
              key={goal.id}
              className="rounded-2xl bg-indigo-50/70 border border-indigo-200/80 px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-white border border-indigo-200 text-[#3B4DF5] flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    «{goal.title}» finalizó su etapa
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Evoluciona, hazlo permanente o archívalo.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onInspectGoal(goal.id, todayStr)}
                  className="px-3 h-8 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-[11px] font-semibold"
                >
                  Revisar
                </button>
                {onDismissPhaseNotice && (
                  <button
                    type="button"
                    onClick={() => onDismissPhaseNotice(goal.id)}
                    aria-label="Descartar aviso de etapa"
                    className="w-7 h-7 rounded-full hover:bg-indigo-100 text-slate-500 flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Compact Modal for Notas del día (opened only when tapping the Notes icon button) */}
      {isEditingDailyNote && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="daily-notes-modal-title"
        >
          <form
            onSubmit={handleSubmitDailyNote}
            className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2
                  id="daily-notes-modal-title"
                  className="font-display text-base font-bold text-slate-900"
                >
                  Notas del día
                </h2>
                <p className="text-xs text-slate-500 tabular-nums">
                  {getSpanishWeekdayShort(selectedDate)}{' '}
                  {formatShortSpanishDate(selectedDate)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingNoteForDate(null)}
                aria-label="Cerrar notas"
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <textarea
              id="checklist-daily-note-input"
              rows={4}
              autoFocus
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Escribe libremente cómo fue tu día, qué funcionó o qué se interpuso..."
              className="w-full p-3 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-2 focus:outline-blue-600"
            />

            <div className="flex items-center justify-end gap-2">
              {hasDailyNote && (
                <button
                  type="button"
                  onClick={() => {
                    onSaveDailyNote(selectedDate, '');
                    setEditingNoteForDate(null);
                  }}
                  className="px-4 h-10 rounded-full border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50"
                >
                  Borrar
                </button>
              )}
              <button
                type="submit"
                className="px-5 h-10 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-xs font-semibold"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
