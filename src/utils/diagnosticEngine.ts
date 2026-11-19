import {
  DailyQuizResponse,
  Goal,
  HabitDiagnostic,
  QuizBreakPoint,
  QuizDeliveryType,
  QuizEnergyLevel,
  QuizExecutionMode,
  QuizFrictionTag,
  QuizObstacle,
  QuizReaction,
} from '../types/tracker';
import {
  addDays,
  formatQuantity,
  getDayCompletionStats,
  getEffectiveTarget,
  isDateScheduledForGoal,
  isDateWithinGoal,
} from './paceEngine';

export const QUIZ_ENERGY_OPTIONS: Array<{
  id: QuizEnergyLevel;
  emoji: string;
  label: string;
}> = [
  { id: 'flow', emoji: '🔋', label: 'Alta' },
  { id: 'regular', emoji: '🔋', label: 'Media' },
  { id: 'low', emoji: '🔋', label: 'Baja' },
];

export const QUIZ_DELIVERY_OPTIONS: Array<{
  id: QuizDeliveryType;
  label: string;
}> = [
  { id: 'complete', label: 'Completo' },
  { id: 'emergency_rule', label: 'Versión reducida / Regla de emergencia' },
];

export const QUIZ_FRICTION_TAG_OPTIONS: Array<{
  id: QuizFrictionTag;
  label: string;
  mappedObstacle: QuizObstacle;
}> = [
  {
    id: 'forgot_distraction',
    label: 'Olvido / Distracción',
    mappedObstacle: 'forgot',
  },
  {
    id: 'emergency_unexpected',
    label: 'Emergencia / Imprevisto',
    mappedObstacle: 'external_interruption',
  },
  {
    id: 'tight_time',
    label: 'Tiempo ajustado',
    mappedObstacle: 'friction_time',
  },
];

export const QUIZ_OBSTACLE_OPTIONS: Array<{
  id: QuizObstacle;
  label: string;
}> = [
  { id: 'friction_time', label: 'Fricción/Tiempo' },
  { id: 'energy_mood', label: 'Energía/Ánimo' },
  { id: 'forgot', label: 'Olvido' },
  { id: 'external_interruption', label: 'Interrupción externa' },
  { id: 'mental_saturation', label: 'Saturación mental' },
  { id: 'habit_substitution', label: 'Cambio de hábito / Sustitución' },
];

export const QUIZ_BREAKPOINT_OPTIONS: Array<{
  id: QuizBreakPoint;
  label: string;
}> = [
  { id: 'start', label: 'En el inicio (No empecé)' },
  { id: 'middle', label: 'A la mitad (Me distraje)' },
  { id: 'planning', label: 'En la planificación (No sabía qué hacer)' },
];

export const QUIZ_REACTION_OPTIONS: Array<{
  id: QuizReaction;
  label: string;
}> = [
  { id: 'emergency_rule', label: 'Regla de emergencia (Versión reducida)' },
  { id: 'all_or_nothing', label: 'Todo o nada (No hice nada)' },
  { id: 'postponed', label: 'Posposición (Lo aplacé)' },
];

export function getEnergyLevelLabel(id?: QuizEnergyLevel): string {
  if (!id) return '';
  const opt = QUIZ_ENERGY_OPTIONS.find((o) => o.id === id);
  return opt ? `${opt.emoji} Energía ${opt.label.toLowerCase()}` : id;
}

export function getExecutionModeLabel(mode?: QuizExecutionMode): string {
  if (mode === 'fluid_success') return 'Éxito fluido';
  if (mode === 'with_resistance') return 'Éxito con resistencia';
  return '';
}

export function getDeliveryTypeLabel(type?: QuizDeliveryType): string {
  if (!type) return '';
  return QUIZ_DELIVERY_OPTIONS.find((o) => o.id === type)?.label || type;
}

export function getFrictionTagLabel(tag: QuizFrictionTag): string {
  return QUIZ_FRICTION_TAG_OPTIONS.find((o) => o.id === tag)?.label || tag;
}

export function getObstacleLabel(id: QuizObstacle): string {
  return QUIZ_OBSTACLE_OPTIONS.find((o) => o.id === id)?.label || id;
}

export function getBreakPointLabel(id: QuizBreakPoint): string {
  return QUIZ_BREAKPOINT_OPTIONS.find((o) => o.id === id)?.label || id;
}

export function getReactionLabel(id: QuizReaction): string {
  return QUIZ_REACTION_OPTIONS.find((o) => o.id === id)?.label || id;
}

export function getConsecutiveSkipsCount(
  goal: Goal,
  referenceDateStr: string,
  includeReferenceDayIfIncomplete: boolean
): number {
  const start = goal.startDate;
  if (referenceDateStr < start) return 0;

  let cursor = referenceDateStr;
  let count = 0;

  // Walk backwards at most 60 days to avoid unnecessary work
  for (let i = 0; i < 60 && cursor >= start; i++) {
    if (!isDateWithinGoal(goal, cursor) || !isDateScheduledForGoal(goal, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }

    const stats = getDayCompletionStats(goal, cursor);
    const isExplicitlySkipped = Boolean(goal.skipped?.[cursor]);

    if (cursor === referenceDateStr) {
      if (stats.isDone) {
        return 0;
      }
      if (!includeReferenceDayIfIncomplete && !isExplicitlySkipped) {
        // Day hasn't closed yet and wasn't explicitly skipped: check from previous scheduled day
        cursor = addDays(cursor, -1);
        continue;
      }
      count += 1;
    } else {
      if (stats.isDone) {
        break;
      }
      count += 1;
    }

    cursor = addDays(cursor, -1);
  }

  return count;
}

export function needsMandatoryIndividualQuiz(goal: Goal, dateStr: string): boolean {
  if (!isDateWithinGoal(goal, dateStr) || !isDateScheduledForGoal(goal, dateStr)) {
    return false;
  }
  const stats = getDayCompletionStats(goal, dateStr);
  if (stats.isDone) return false;
  if (goal.quizLogs?.[dateStr]) return false;
  return getConsecutiveSkipsCount(goal, dateStr, true) >= 4;
}

export function computeHabitDiagnostic(
  goal: Goal,
  referenceDateStr: string,
  includeReferenceDayIfIncomplete: boolean,
  dailyQuizLogs: Record<string, DailyQuizResponse> = {}
): HabitDiagnostic | null {
  const consecutiveSkips = getConsecutiveSkipsCount(
    goal,
    referenceDateStr,
    includeReferenceDayIfIncomplete
  );

  if (consecutiveSkips < 3) {
    return null;
  }

  // 30-day completion rate across scheduled days in [max(startDate, ref-29), ref]
  const windowStart =
    addDays(referenceDateStr, -29) > goal.startDate
      ? addDays(referenceDateStr, -29)
      : goal.startDate;

  let scheduledDays30d = 0;
  let completedEquivalent = 0;
  let cursor = windowStart;

  while (cursor <= referenceDateStr) {
    if (isDateWithinGoal(goal, cursor) && isDateScheduledForGoal(goal, cursor)) {
      scheduledDays30d += 1;
      const stats = getDayCompletionStats(goal, cursor);
      completedEquivalent += Math.min(1, stats.value / stats.target);
    }
    cursor = addDays(cursor, 1);
  }

  const completionRate30d =
    scheduledDays30d > 0
      ? Math.round((completedEquivalent / scheduledDays30d) * 100)
      : 0;

  // Aggregate obstacle & breakPoint from individual quizLogs (preferring recent 30 days)
  // and falling back to general dailyQuizLogs for scheduled incomplete days
  const mergedLogsByDate = new Map<string, DailyQuizResponse>();

  let logCursor = windowStart;
  while (logCursor <= referenceDateStr) {
    const individual = goal.quizLogs?.[logCursor];
    if (individual) {
      mergedLogsByDate.set(logCursor, individual);
    } else if (
      isDateWithinGoal(goal, logCursor) &&
      isDateScheduledForGoal(goal, logCursor) &&
      !getDayCompletionStats(goal, logCursor).isDone &&
      dailyQuizLogs[logCursor]
    ) {
      mergedLogsByDate.set(logCursor, dailyQuizLogs[logCursor]);
    }
    logCursor = addDays(logCursor, 1);
  }

  const effectiveEntries: Array<[string, DailyQuizResponse]> =
    mergedLogsByDate.size > 0
      ? Array.from(mergedLogsByDate.entries())
      : Object.entries(goal.quizLogs || {});

  let topObstacle: HabitDiagnostic['topObstacle'] = null;
  let topBreakPoint: HabitDiagnostic['topBreakPoint'] = null;

  if (effectiveEntries.length > 0) {
    const obstacleCounts: Record<string, number> = {};
    const breakCounts: Record<string, number> = {};
    let obstacleTotal = 0;
    let breakTotal = 0;

    for (const [, log] of effectiveEntries) {
      if (log.obstacle) {
        obstacleCounts[log.obstacle] = (obstacleCounts[log.obstacle] || 0) + 1;
        obstacleTotal += 1;
      }
      if (log.breakPoint) {
        breakCounts[log.breakPoint] = (breakCounts[log.breakPoint] || 0) + 1;
        breakTotal += 1;
      }
    }

    const sortedObstacles = Object.entries(obstacleCounts).sort((a, b) => b[1] - a[1]);
    const sortedBreaks = Object.entries(breakCounts).sort((a, b) => b[1] - a[1]);

    if (sortedObstacles.length > 0 && obstacleTotal > 0) {
      const [id, hits] = sortedObstacles[0];
      topObstacle = {
        id: id as QuizObstacle,
        label: getObstacleLabel(id as QuizObstacle),
        pct: Math.round((hits / obstacleTotal) * 100),
      };
    }

    if (sortedBreaks.length > 0 && breakTotal > 0) {
      const [id, hits] = sortedBreaks[0];
      topBreakPoint = {
        id: id as QuizBreakPoint,
        label: getBreakPointLabel(id as QuizBreakPoint),
        pct: Math.round((hits / breakTotal) * 100),
      };
    }
  }

  const target = getEffectiveTarget(goal);
  const suggestedTarget =
    goal.trackingMode !== 'boolean' && target > 1
      ? Math.max(1, Math.floor(target / 2))
      : null;

  const unitText =
    goal.trackingMode === 'measure' && goal.unit
      ? ` ${goal.unit}`
      : goal.trackingMode === 'counter'
      ? ` ${goal.stepLabel?.trim() || 'sesión'}`
      : '';

  // Build neutral adjustment question
  const patternClause = topObstacle
    ? `El ${topObstacle.pct}% de las omisiones coinciden con ${topObstacle.label}${
        topBreakPoint ? ` (${topBreakPoint.label})` : ''
      }. `
    : '';

  let actionPrompt =
    '¿Quieres ajustar este hábito a una versión mínima para retomar el ritmo sin fricción?';

  if (topObstacle?.id === 'energy_mood' || topBreakPoint?.id === 'start') {
    actionPrompt = suggestedTarget
      ? `¿Quieres reducir la dosis mínima a ${formatQuantity(suggestedTarget)}${unitText} (o 2 minutos) para días con baja energía?`
      : '¿Quieres definir una dosis mínima de 2 minutos para días con baja energía?';
  } else if (topObstacle?.id === 'mental_saturation') {
    actionPrompt = suggestedTarget
      ? `¿Quieres reducir la meta a ${formatQuantity(suggestedTarget)}${unitText} o mover este hábito a días de menor saturación mental?`
      : '¿Quieres simplificar este hábito a una versión de 2 minutos para días con saturación mental?';
  } else if (topObstacle?.id === 'habit_substitution') {
    actionPrompt =
      '¿Quieres editar este hábito o reemplazarlo por el nuevo hábito con el que lo estás sustituyendo?';
  } else if (topObstacle?.id === 'friction_time' || topBreakPoint?.id === 'planning') {
    actionPrompt = suggestedTarget
      ? `¿Quieres bajar temporalmente la meta diaria a ${formatQuantity(suggestedTarget)}${unitText} o simplificar el primer paso?`
      : '¿Quieres ajustar los días de repetición o simplificar el primer paso para reducir fricción?';
  } else if (topObstacle?.id === 'forgot') {
    actionPrompt =
      '¿Quieres ajustar su horario habitual o vincularlo a una rutina que ya haces cada día?';
  } else if (topObstacle?.id === 'external_interruption') {
    actionPrompt = suggestedTarget
      ? `¿Quieres activar una regla de emergencia de ${formatQuantity(suggestedTarget)}${unitText} para días con imprevistos?`
      : '¿Quieres activar una regla de emergencia de 2 minutos para días con imprevistos?';
  }

  const neutralQuestion = `Has pausado "${goal.title}" durante ${consecutiveSkips} días. ${patternClause}${actionPrompt}`;

  return {
    goal,
    consecutiveSkips,
    completionRate30d,
    scheduledDays30d,
    topObstacle,
    topBreakPoint,
    neutralQuestion,
    suggestedTarget,
  };
}

export function getGoalsWithDiagnostic(
  goals: Goal[],
  referenceDateStr: string,
  includeReferenceDayIfIncomplete: boolean,
  dailyQuizLogs: Record<string, DailyQuizResponse> = {}
): HabitDiagnostic[] {
  const results: HabitDiagnostic[] = [];
  for (const g of goals) {
    const diag = computeHabitDiagnostic(
      g,
      referenceDateStr,
      includeReferenceDayIfIncomplete,
      dailyQuizLogs
    );
    if (diag) results.push(diag);
  }
  return results;
}
