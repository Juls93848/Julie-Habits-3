import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarCheck2,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import {
  DailyQuizResponse,
  Goal,
  QuizBreakPoint,
  QuizEnergyLevel,
  QuizExecutionMode,
  QuizObstacle,
  QuizReaction,
} from '../types/tracker';
import { getGoalPalette, GoalIconBadge } from '../utils/colorAndIcons';
import {
  QUIZ_BREAKPOINT_OPTIONS,
  QUIZ_ENERGY_OPTIONS,
  QUIZ_OBSTACLE_OPTIONS,
  QUIZ_REACTION_OPTIONS,
} from '../utils/diagnosticEngine';
import {
  formatShortSpanishDate,
  getSpanishWeekdayShort,
  toLocalDateStr,
} from '../utils/paceEngine';

export interface IndividualQuizQueueItem {
  goal: Goal;
  mandatory: boolean;
  consecutiveSkips: number;
}

interface QuickCheckInQuizModalProps {
  dateStr: string;
  now: Date;
  initialDayMode: boolean;
  incompleteGoalsForDay: Goal[];
  existingDailyQuiz?: DailyQuizResponse;
  existingDailyNote?: string;
  habitQueue: IndividualQuizQueueItem[];
  openReportAfter: boolean;
  onSaveDailyQuiz: (dateStr: string, response: DailyQuizResponse) => void;
  onSaveDailyNote: (dateStr: string, noteText: string) => void;
  onSaveHabitQuiz: (
    goalId: string,
    dateStr: string,
    response: DailyQuizResponse
  ) => void;
  onSaveHabitNote: (goalId: string, dateStr: string, noteText: string) => void;
  onFinish: () => void;
  onCancel: () => void;
}

const TOTAL_QUIZ_SLIDES = 5;

export const QuickCheckInQuizModal: React.FC<QuickCheckInQuizModalProps> = ({
  dateStr,
  now,
  initialDayMode,
  existingDailyQuiz,
  existingDailyNote = '',
  habitQueue,
  openReportAfter,
  onSaveDailyQuiz,
  onSaveDailyNote,
  onSaveHabitQuiz,
  onSaveHabitNote,
  onFinish,
  onCancel,
}) => {
  const [inDayStep, setInDayStep] = useState<boolean>(initialDayMode);
  const [habitIndex, setHabitIndex] = useState<number>(0);
  const [slideIdx, setSlideIdx] = useState<number>(0);
  const [energyWarning, setEnergyWarning] = useState<boolean>(false);

  const currentHabitItem = !inDayStep ? habitQueue[habitIndex] ?? null : null;

  const [energyLevel, setEnergyLevel] = useState<QuizEnergyLevel | null>(() =>
    initialDayMode
      ? existingDailyQuiz?.energyLevel || null
      : habitQueue[0]?.goal.quizLogs?.[dateStr]?.energyLevel || null
  );
  const [obstacle, setObstacle] = useState<QuizObstacle | null>(() =>
    initialDayMode
      ? existingDailyQuiz?.obstacle || null
      : habitQueue[0]?.goal.quizLogs?.[dateStr]?.obstacle || null
  );
  const [breakPoint, setBreakPoint] = useState<QuizBreakPoint | null>(() =>
    initialDayMode
      ? existingDailyQuiz?.breakPoint || null
      : habitQueue[0]?.goal.quizLogs?.[dateStr]?.breakPoint || null
  );
  const [reaction, setReaction] = useState<QuizReaction | null>(() =>
    initialDayMode
      ? existingDailyQuiz?.reaction || null
      : habitQueue[0]?.goal.quizLogs?.[dateStr]?.reaction || null
  );
  const [noteText, setNoteText] = useState<string>(() =>
    initialDayMode
      ? existingDailyNote || existingDailyQuiz?.note || ''
      : habitQueue[0]?.goal.notes?.[dateStr] || ''
  );

  const autoAdvanceTimerRef = useRef<number | null>(null);
  const swipeOriginRef = useRef<{ x: number; y: number } | null>(null);

  const clearAutoAdvance = () => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearAutoAdvance();
  }, []);

  if (!inDayStep && !currentHabitItem) return null;

  const todayStr = toLocalDateStr(now);
  const accentColor = currentHabitItem
    ? getGoalPalette(currentHabitItem.goal.colorHex).fillBg
    : '#3B4DF5';

  const isLastStep = inDayStep
    ? habitQueue.length === 0
    : habitIndex >= habitQueue.length - 1;

  const isMandatoryStep = Boolean(currentHabitItem?.mandatory);
  const canSubmit = isMandatoryStep
    ? Boolean(energyLevel && obstacle && breakPoint && reaction)
    : Boolean(energyLevel);

  const canGoBackToPreviousTarget =
    !inDayStep && (habitIndex > 0 || initialDayMode);
  const canGoPrev = slideIdx > 0 || canGoBackToPreviousTarget;

  const loadDayIntoForm = () => {
    setEnergyLevel(existingDailyQuiz?.energyLevel || null);
    setObstacle(existingDailyQuiz?.obstacle || null);
    setBreakPoint(existingDailyQuiz?.breakPoint || null);
    setReaction(existingDailyQuiz?.reaction || null);
    setNoteText(existingDailyNote || existingDailyQuiz?.note || '');
    setEnergyWarning(false);
  };

  const loadHabitIntoForm = (item: IndividualQuizQueueItem) => {
    const existing = item.goal.quizLogs?.[dateStr];
    setEnergyLevel(existing?.energyLevel || null);
    setObstacle(existing?.obstacle || null);
    setBreakPoint(existing?.breakPoint || null);
    setReaction(existing?.reaction || null);
    setNoteText(item.goal.notes?.[dateStr] || '');
    setEnergyWarning(false);
  };

  const persistCurrentStep = (modeOverride?: QuizExecutionMode) => {
    if (!energyLevel) return;
    if (!modeOverride && isMandatoryStep && (!obstacle || !breakPoint || !reaction)) {
      return;
    }

    const trimmedNote = noteText.trim();
    const isFluid = modeOverride === 'fluid_success';
    const computedMode: QuizExecutionMode =
      modeOverride ||
      (obstacle || breakPoint || reaction ? 'with_resistance' : 'fluid_success');

    const payload: DailyQuizResponse = {
      energyLevel,
      executionMode: computedMode,
      obstacle: isFluid ? undefined : obstacle || undefined,
      breakPoint: isFluid ? undefined : breakPoint || undefined,
      reaction: isFluid ? undefined : reaction || undefined,
      note: trimmedNote || undefined,
      answeredAt: new Date().toISOString(),
    };

    if (inDayStep) {
      onSaveDailyQuiz(dateStr, payload);
      if (trimmedNote !== existingDailyNote.trim()) {
        onSaveDailyNote(dateStr, trimmedNote);
      }
    } else if (currentHabitItem) {
      onSaveHabitQuiz(currentHabitItem.goal.id, dateStr, payload);
      const prevHabitNote = (currentHabitItem.goal.notes?.[dateStr] || '').trim();
      if (trimmedNote !== prevHabitNote) {
        onSaveHabitNote(currentHabitItem.goal.id, dateStr, trimmedNote);
      }
    }
  };

  const advanceTargetOrFinish = () => {
    clearAutoAdvance();
    if (inDayStep) {
      if (habitQueue.length > 0) {
        setInDayStep(false);
        setHabitIndex(0);
        setSlideIdx(0);
        loadHabitIntoForm(habitQueue[0]);
        return;
      }
      onFinish();
      return;
    }

    if (habitIndex < habitQueue.length - 1) {
      const nextIdx = habitIndex + 1;
      setHabitIndex(nextIdx);
      setSlideIdx(0);
      loadHabitIntoForm(habitQueue[nextIdx]);
      return;
    }

    onFinish();
  };

  const handleGoPrev = () => {
    clearAutoAdvance();
    if (slideIdx > 0) {
      setSlideIdx((s) => s - 1);
      return;
    }
    if (!inDayStep) {
      if (habitIndex > 0) {
        const prevIdx = habitIndex - 1;
        setHabitIndex(prevIdx);
        setSlideIdx(TOTAL_QUIZ_SLIDES - 1);
        loadHabitIntoForm(habitQueue[prevIdx]);
      } else if (initialDayMode) {
        setInDayStep(true);
        setSlideIdx(TOTAL_QUIZ_SLIDES - 1);
        loadDayIntoForm();
      }
    }
  };

  const handleGoNextSlide = () => {
    clearAutoAdvance();
    if (slideIdx === 0 && !energyLevel) {
      setEnergyWarning(true);
      return;
    }
    if (slideIdx < TOTAL_QUIZ_SLIDES - 1) {
      setSlideIdx((s) => s + 1);
    }
  };

  const scheduleAutoAdvance = (targetSlide: number) => {
    clearAutoAdvance();
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      setSlideIdx(targetSlide);
      autoAdvanceTimerRef.current = null;
    }, 200);
  };

  const handleQuickFluidExit = () => {
    if (!energyLevel) {
      setEnergyWarning(true);
      return;
    }
    clearAutoAdvance();
    persistCurrentStep('fluid_success');
    advanceTargetOrFinish();
  };

  const handleSaveDirect = () => {
    if (!canSubmit) {
      if (!energyLevel) setEnergyWarning(true);
      return;
    }
    clearAutoAdvance();
    persistCurrentStep();
    advanceTargetOrFinish();
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) {
      handleSaveDirect();
      return;
    }
    if (!energyLevel) {
      setEnergyWarning(true);
      setSlideIdx(0);
      return;
    }
    if (slideIdx < TOTAL_QUIZ_SLIDES - 1) {
      handleGoNextSlide();
    }
  };

  const handleSkipStep = () => {
    if (isMandatoryStep) return;
    clearAutoAdvance();
    if (inDayStep && noteText.trim() !== existingDailyNote.trim()) {
      onSaveDailyNote(dateStr, noteText.trim());
    }
    advanceTargetOrFinish();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('textarea')) {
      swipeOriginRef.current = null;
      return;
    }
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

    if (dx < 0 && slideIdx < TOTAL_QUIZ_SLIDES - 1) {
      handleGoNextSlide();
    } else if (dx > 0 && canGoPrev) {
      handleGoPrev();
    }
  };

  const slideLabels = [
    'Energía',
    'Obstáculo',
    'Rotura',
    'Reacción',
    'Nota',
  ];

  const missingRequiredSteps: Array<{ idx: number; label: string }> = [];
  if (!energyLevel) missingRequiredSteps.push({ idx: 0, label: '1. Energía' });
  if (isMandatoryStep) {
    if (!obstacle) missingRequiredSteps.push({ idx: 1, label: '2. Obstáculo' });
    if (!breakPoint) missingRequiredSteps.push({ idx: 2, label: '3. Punto de rotura' });
    if (!reaction) missingRequiredSteps.push({ idx: 3, label: '4. Reacción' });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-quiz-title"
    >
      <form
        onSubmit={handleConfirm}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="w-full max-w-lg h-[88vh] sm:h-[630px] sm:max-h-[92vh] bg-[#F7F7FA] sm:bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Top IG-Story Progress Bars + Header */}
        <div className="px-5 pt-3.5 pb-3.5 bg-white border-b border-slate-100 space-y-3 shrink-0">
          <div
            className="flex items-center gap-1.5"
            role="tablist"
            aria-label="Pasos del cuestionario"
          >
            {slideLabels.map((label, idx) => {
              const activeOrDone = idx <= slideIdx;
              return (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  aria-selected={idx === slideIdx}
                  aria-label={`Paso ${idx + 1}: ${label}`}
                  onClick={() => {
                    clearAutoAdvance();
                    if (idx > 0 && !energyLevel) {
                      setEnergyWarning(true);
                      setSlideIdx(0);
                      return;
                    }
                    setSlideIdx(idx);
                  }}
                  className="flex-1 py-1 group focus:outline-none"
                >
                  <span
                    className="block h-1.5 rounded-full transition-colors"
                    style={{
                      backgroundColor: activeOrDone ? accentColor : '#E2E8F0',
                    }}
                  />
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {inDayStep ? (
                <span className="w-10 h-10 rounded-xl bg-blue-50 text-[#3B4DF5] flex items-center justify-center shrink-0">
                  <CalendarCheck2 className="w-5 h-5" aria-hidden="true" />
                </span>
              ) : (
                currentHabitItem && (
                  <GoalIconBadge
                    iconType={currentHabitItem.goal.iconType || 'icon'}
                    iconValue={currentHabitItem.goal.iconValue || 'activity'}
                    colorHex={currentHabitItem.goal.colorHex || '#3B4DF5'}
                    sizeClass="w-10 h-10"
                  />
                )
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {inDayStep
                      ? slideIdx === 0
                        ? 'Cuestionario rápido'
                        : `Matices · ${slideIdx}/4`
                      : `Hábito${
                          habitQueue.length > 1
                            ? ` ${habitIndex + 1}/${habitQueue.length}`
                            : ''
                        } · ${slideIdx === 0 ? 'Paso 1' : `Matices ${slideIdx}/4`}`}
                  </span>
                </div>
                <h2
                  id="quick-quiz-title"
                  className="font-display text-base font-bold text-slate-900 truncate"
                >
                  {inDayStep ? 'Cierre general del día' : currentHabitItem?.goal.title}
                </h2>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {dateStr === todayStr ? 'Hoy · ' : ''}
                  {getSpanishWeekdayShort(dateStr)} {formatShortSpanishDate(dateStr)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onCancel}
              aria-label="Cerrar cuestionario"
              className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Story Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col justify-between">
          <div className="space-y-4">
            {!inDayStep && isMandatoryStep && currentHabitItem && slideIdx === 0 && (
              <div className="flex items-start gap-2.5 text-xs text-indigo-950 bg-indigo-50/80 rounded-xl border border-indigo-200/80 px-3.5 py-2.5">
                <Info
                  className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span>
                  Cuestionario obligatorio: llevas{' '}
                  <strong className="font-semibold">
                    {currentHabitItem.consecutiveSkips} días consecutivos
                  </strong>{' '}
                  sin completar este hábito. Elige tu energía y responde los 4 pasos para ajustar tu ritmo.
                </span>
              </div>
            )}

            {/* SLIDE 0: Paso 1 (Energía + Nota) + Paso 2 (Bifurcación Vía A / Vía B) */}
            {slideIdx === 0 && (
              <div className="space-y-4 pt-1">
                <div>
                  <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Paso 1 · Obligatorio
                  </span>
                  <h3 className="font-display text-xl font-bold text-slate-900">
                    ¿Cómo estuvo tu energía?
                  </h3>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {QUIZ_ENERGY_OPTIONS.map((opt) => {
                    const selected = energyLevel === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setEnergyLevel(opt.id);
                          setEnergyWarning(false);
                          if (isMandatoryStep) {
                            scheduleAutoAdvance(1);
                          }
                        }}
                        aria-pressed={selected}
                        className="retro-press py-4 px-2.5 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 transition-colors shadow-2xs"
                        style={{
                          backgroundColor: selected ? accentColor : '#FFFFFF',
                          borderColor: selected ? accentColor : '#E2E8F0',
                          color: selected ? '#FFFFFF' : '#1E293B',
                        }}
                      >
                        <span className="text-2xl leading-none" aria-hidden="true">
                          {opt.emoji}
                        </span>
                        <span className="text-xs font-semibold leading-tight">
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {energyWarning && !energyLevel && (
                  <p role="alert" className="text-xs font-medium text-rose-600">
                    Primero selecciona tu nivel de energía (Alta, Media o Baja).
                  </p>
                )}

                {/* Nota directa desde el Paso 1 */}
                <div>
                  <label
                    htmlFor="quiz-step1-note"
                    className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
                  >
                    Nota (opcional)
                  </label>
                  <textarea
                    id="quiz-step1-note"
                    rows={2}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder={
                      inDayStep
                        ? 'Escribe una nota breve de tu día...'
                        : 'Escribe una nota breve sobre este hábito...'
                    }
                    className="w-full p-3 rounded-2xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-blue-600 shadow-2xs resize-none"
                  />
                </div>

                {/* Paso 2: La Bifurcación Principal */}
                {!isMandatoryStep && (
                  <div className="pt-1 space-y-2.5">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Paso 2 · Elige una vía
                    </span>

                    {/* Vía A: Salida Rápida */}
                    <button
                      type="button"
                      onClick={handleQuickFluidExit}
                      className={`retro-press w-full py-3.5 px-4 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-opacity ${
                        !energyLevel ? 'opacity-70' : 'hover:opacity-95'
                      }`}
                      style={{ backgroundColor: accentColor }}
                    >
                      <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>✨ Todo fluyó excelente</span>
                    </button>

                    {/* Vía B: Matices de Ejecución (4 tarjetas deslizables) */}
                    <button
                      type="button"
                      onClick={handleGoNextSlide}
                      className="retro-press w-full py-3 px-4 rounded-2xl bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 transition-colors shadow-2xs"
                    >
                      <span className="inline-flex items-center gap-2 text-left">
                        <SlidersHorizontal
                          className="w-4 h-4 text-slate-500 shrink-0"
                          aria-hidden="true"
                        />
                        <span>Registrar matices o contratiempos (opcional)</span>
                      </span>
                      <ChevronRight
                        className="w-4 h-4 text-slate-400 shrink-0"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SLIDE 1 (Vía B · 1/4): Obstáculo principal */}
            {slideIdx === 1 && (
              <div className="space-y-4 pt-2">
                <div>
                  <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Matices · 1 de 4{!isMandatoryStep ? ' · Opcional' : ''}
                  </span>
                  <h3 className="font-display text-xl font-bold text-slate-900">
                    ¿Cuál fue el obstáculo principal?
                  </h3>
                  {!isMandatoryStep && (
                    <p className="text-xs text-slate-500 mt-1">
                      Toca una opción para registrarla o desliza si quieres dejarlo en blanco.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {QUIZ_OBSTACLE_OPTIONS.map((opt) => {
                    const selected = obstacle === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          const willDeselect = !isMandatoryStep && obstacle === opt.id;
                          setObstacle(willDeselect ? null : opt.id);
                          if (!willDeselect) {
                            scheduleAutoAdvance(2);
                          }
                        }}
                        aria-pressed={selected}
                        className="retro-press min-h-[54px] px-3.5 py-2.5 rounded-2xl border text-xs font-semibold text-left flex items-center justify-between gap-2 transition-colors shadow-2xs"
                        style={{
                          backgroundColor: selected ? accentColor : '#FFFFFF',
                          borderColor: selected ? accentColor : '#E2E8F0',
                          color: selected ? '#FFFFFF' : '#1E293B',
                        }}
                      >
                        <span className="leading-snug">{opt.label}</span>
                        {selected && (
                          <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SLIDE 2 (Vía B · 2/4): Punto de rotura */}
            {slideIdx === 2 && (
              <div className="space-y-4 pt-2">
                <div>
                  <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Matices · 2 de 4{!isMandatoryStep ? ' · Opcional' : ''}
                  </span>
                  <h3 className="font-display text-xl font-bold text-slate-900">
                    ¿En qué punto se frenó el hábito?
                  </h3>
                </div>

                <div className="space-y-2.5 pt-1">
                  {QUIZ_BREAKPOINT_OPTIONS.map((opt) => {
                    const selected = breakPoint === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          const willDeselect =
                            !isMandatoryStep && breakPoint === opt.id;
                          setBreakPoint(willDeselect ? null : opt.id);
                          if (!willDeselect) {
                            scheduleAutoAdvance(3);
                          }
                        }}
                        aria-pressed={selected}
                        className="retro-press w-full min-h-[52px] px-4 py-3 rounded-2xl border text-xs sm:text-sm font-semibold text-left flex items-center justify-between gap-2 transition-colors shadow-2xs"
                        style={{
                          backgroundColor: selected ? accentColor : '#FFFFFF',
                          borderColor: selected ? accentColor : '#E2E8F0',
                          color: selected ? '#FFFFFF' : '#1E293B',
                        }}
                      >
                        <span>{opt.label}</span>
                        {selected && (
                          <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SLIDE 3 (Vía B · 3/4): Reacción ante el reto */}
            {slideIdx === 3 && (
              <div className="space-y-4 pt-2">
                <div>
                  <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Matices · 3 de 4{!isMandatoryStep ? ' · Opcional' : ''}
                  </span>
                  <h3 className="font-display text-xl font-bold text-slate-900">
                    ¿Cuál fue tu reacción ante el reto?
                  </h3>
                </div>

                <div className="space-y-2.5 pt-1">
                  {QUIZ_REACTION_OPTIONS.map((opt) => {
                    const selected = reaction === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          const willDeselect = !isMandatoryStep && reaction === opt.id;
                          setReaction(willDeselect ? null : opt.id);
                          if (!willDeselect) {
                            scheduleAutoAdvance(4);
                          }
                        }}
                        aria-pressed={selected}
                        className="retro-press w-full min-h-[52px] px-4 py-3 rounded-2xl border text-xs sm:text-sm font-semibold text-left flex items-center justify-between gap-2 transition-colors shadow-2xs"
                        style={{
                          backgroundColor: selected ? accentColor : '#FFFFFF',
                          borderColor: selected ? accentColor : '#E2E8F0',
                          color: selected ? '#FFFFFF' : '#1E293B',
                        }}
                      >
                        <span>{opt.label}</span>
                        {selected && (
                          <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SLIDE 4 (Vía B · 4/4): Nota del día y resumen */}
            {slideIdx === 4 && (
              <div className="space-y-4 pt-2">
                <div>
                  <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Matices · 4 de 4 · Opcional
                  </span>
                  <h3 className="font-display text-xl font-bold text-slate-900">
                    Nota del día y resumen
                  </h3>
                </div>

                <textarea
                  id="quiz-daily-note-input"
                  rows={4}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder={
                    inDayStep
                      ? 'Escribe libremente cómo fue tu día o qué ocurrió...'
                      : 'Escribe libremente qué pasó con este hábito hoy...'
                  }
                  className="w-full p-3.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-blue-600 shadow-2xs"
                />

                {missingRequiredSteps.length > 0 ? (
                  <div className="rounded-2xl bg-amber-50/90 border border-amber-200 p-3.5 space-y-2">
                    <div className="text-xs font-semibold text-amber-950">
                      Falta responder para poder guardar:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {missingRequiredSteps.map((m) => (
                        <button
                          key={m.idx}
                          type="button"
                          onClick={() => setSlideIdx(m.idx)}
                          className="px-3 py-1.5 rounded-full bg-white border border-amber-300 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                        >
                          Ir a {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-white border border-slate-200/80 p-3.5 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Resumen listo (toca cualquier paso arriba para editar)
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {energyLevel && (
                        <button
                          type="button"
                          onClick={() => setSlideIdx(0)}
                          className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 font-medium text-slate-800"
                        >
                          {QUIZ_ENERGY_OPTIONS.find((o) => o.id === energyLevel)?.emoji}{' '}
                          {QUIZ_ENERGY_OPTIONS.find((o) => o.id === energyLevel)?.label}
                        </button>
                      )}
                      {obstacle && (
                        <button
                          type="button"
                          onClick={() => setSlideIdx(1)}
                          className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 font-medium text-slate-800"
                        >
                          {QUIZ_OBSTACLE_OPTIONS.find((o) => o.id === obstacle)?.label}
                        </button>
                      )}
                      {breakPoint && (
                        <button
                          type="button"
                          onClick={() => setSlideIdx(2)}
                          className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 font-medium text-slate-800"
                        >
                          {QUIZ_BREAKPOINT_OPTIONS.find((o) => o.id === breakPoint)?.label}
                        </button>
                      )}
                      {reaction && (
                        <button
                          type="button"
                          onClick={() => setSlideIdx(3)}
                          className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 font-medium text-slate-800"
                        >
                          {QUIZ_REACTION_OPTIONS.find((o) => o.id === reaction)?.label}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="text-center text-[11px] text-slate-400 pt-3">
            {slideIdx === 0 && !isMandatoryStep
              ? 'Elige tu energía y pulsa ✨ Todo fluyó excelente o registra matices'
              : 'Desliza o usa las flechas para desplazarte atrás y adelante'}
          </p>
        </div>

        {/* Footer Navigation Controls */}
        <div className="px-5 py-4 bg-white border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
          {canGoPrev ? (
            <button
              type="button"
              onClick={handleGoPrev}
              aria-label="Paso anterior"
              className="h-11 px-3.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 shrink-0"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              <span>Atrás</span>
            </button>
          ) : !isMandatoryStep ? (
            <button
              type="button"
              onClick={handleSkipStep}
              className="h-11 px-3.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 shrink-0"
            >
              {isLastStep && openReportAfter ? 'Ir al reporte' : 'Omitir'}
            </button>
          ) : (
            <span className="text-[11px] font-medium text-slate-500 px-1">
              Paso obligatorio
            </span>
          )}

          {slideIdx === 0 && !isMandatoryStep ? (
            <button
              type="button"
              onClick={handleGoNextSlide}
              className="retro-press h-11 px-4 rounded-full bg-slate-100 hover:bg-slate-200 text-xs sm:text-sm font-semibold text-slate-700 inline-flex items-center gap-1 shrink-0"
            >
              <span>Matices</span>
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : slideIdx < TOTAL_QUIZ_SLIDES - 1 ? (
            <div className="flex items-center gap-2 flex-1 justify-end">
              {canSubmit && (
                <button
                  type="button"
                  onClick={handleSaveDirect}
                  className="retro-press flex-1 sm:flex-initial sm:min-w-[130px] h-11 px-4 rounded-full text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-opacity"
                  style={{ backgroundColor: accentColor }}
                >
                  <span>Guardar</span>
                  <Check className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={handleGoNextSlide}
                className={`retro-press h-11 px-4 rounded-full text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1 transition-colors ${
                  canSubmit
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 shrink-0'
                    : 'flex-1 sm:flex-initial sm:min-w-[160px] text-white'
                }`}
                style={canSubmit ? undefined : { backgroundColor: accentColor }}
              >
                <span>Siguiente</span>
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={!canSubmit}
              className="retro-press flex-1 h-11 rounded-full text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: accentColor }}
            >
              <span>
                {isLastStep
                  ? openReportAfter
                    ? 'Guardar y ver reporte'
                    : 'Guardar registro'
                  : 'Guardar y continuar'}
              </span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
