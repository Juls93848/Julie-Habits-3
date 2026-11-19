import {
  DailyQuizResponse,
  Goal,
  QuizBreakPoint,
  QuizEnergyLevel,
  QuizObstacle,
  QuizReaction,
  WeeklyStatsMode,
} from '../types/tracker';
import {
  getBreakPointLabel,
  getObstacleLabel,
  getReactionLabel,
} from './diagnosticEngine';
import {
  addDays,
  formatFrequencySummary,
  formatShortSpanishDate,
  getDayCompletionStats,
  getGoalOriginDateStr,
  getMondayOfWeek,
  isDateScheduledForGoal,
  parseLocalDate,
  toLocalDateStr,
} from './paceEngine';

export interface WeeklyVictorySummary {
  goal: Goal;
  completedDays: number;
  targetDays: number;
  streakDays: number;
  pct: number;
  headline: string;
}

export interface WeeklyHabitStat {
  goal: Goal;
  completed: number;
  scheduled: number;
  missed: number;
  pct: number;
}

export interface WeeklyAgainstItem {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  rightLabel: string;
  goalId?: string;
}

export interface WeeklyDiagnosticBarItem {
  id: string;
  label: string;
  count: number;
  pct: number;
  color: string;
}

export interface WeeklyDiagnosticMetrics {
  dominantEnergy: {
    id: QuizEnergyLevel;
    label: string;
    emoji: string;
    pct: number;
  } | null;
  energyTotal: number;
  energyItems: WeeklyDiagnosticBarItem[];
  obstacleTotal: number;
  obstacleItems: WeeklyDiagnosticBarItem[];
  breakPointTotal: number;
  breakPointItems: WeeklyDiagnosticBarItem[];
  reactionTotal: number;
  reactionItems: WeeklyDiagnosticBarItem[];
}

export interface WeeklyQuoteInfo {
  quote: string;
  author: string;
  role: string;
}

export interface WeeklyHabitEvolution {
  goal: Goal;
  fromPhase: number;
  toPhase: number;
  fromTitle: string;
  toTitle: string;
  fromSummary: string;
  toSummary: string;
  outcome: 'evolved' | 'permanent';
  eventDate: string;
}

export interface WeeklyReportSummary {
  weekKey: string;
  rangeStart: string;
  rangeEnd: string;
  rangeLabel: string;
  mode: WeeklyStatsMode;
  weekOfYear: number;
  nextWeekOfYear: number;
  weekOfMonth: number;
  weeksInMonth: number;
  monthElapsedPct: number;
  monthName: string;
  monthResultPct: number;
  monthQuote: WeeklyQuoteInfo;
  // Slide 1/2: Balance (como Slide 3 del reporte mensual)
  totalCompletedActions: number;
  totalScheduledActions: number;
  overallPct: number;
  overallPctExact: number;
  missedPctExact: number;
  againstItems: WeeklyAgainstItem[];
  // Slide 3: Pulso de la semana (Energía + 4 preguntas de diagnóstico)
  naturalFlowDays: number;
  resistanceDays: number;
  restOrPendingDays: number;
  diagnostics: WeeklyDiagnosticMetrics;
  // Slide 4: Micro-Victoria + Evoluciones de hábitos
  victory: WeeklyVictorySummary | null;
  evolvedHabits: WeeklyHabitEvolution[];
  // Slide 5: Hábito con mayor margen de ajuste
  adjustmentHabit: WeeklyHabitStat | null;
  otherAdjustmentHabits: WeeklyHabitStat[];
  focusIntention: string;
}

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function getISOWeekInfo(dateStr: string): {
  isoYear: number;
  weekOfYear: number;
  nextWeekOfYear: number;
} {
  const dt = parseLocalDate(dateStr);
  const utc = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const isoYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekOfYear = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  const nextDt = new Date(utc.getTime() + 7 * 86400000);
  const nextDayNum = nextDt.getUTCDay() || 7;
  nextDt.setUTCDate(nextDt.getUTCDate() + 4 - nextDayNum);
  const nextIsoYear = nextDt.getUTCFullYear();
  const nextYearStart = new Date(Date.UTC(nextIsoYear, 0, 1));
  const nextWeekOfYear = Math.ceil(
    ((nextDt.getTime() - nextYearStart.getTime()) / 86400000 + 1) / 7
  );

  return { isoYear, weekOfYear, nextWeekOfYear };
}

export function getWeekOfMonthInfo(refDateStr: string, todayStr: string): {
  weekOfMonth: number;
  weeksInMonth: number;
  monthElapsedPct: number;
  monthName: string;
} {
  const ref = parseLocalDate(refDateStr);
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weeksInMonth = Math.max(4, Math.ceil(daysInMonth / 7));
  const dayOfMonth = ref.getDate();
  const weekOfMonth = Math.min(weeksInMonth, Math.max(1, Math.ceil(dayOfMonth / 7)));

  const refPrefix = refDateStr.slice(0, 7);
  const todayPrefix = todayStr.slice(0, 7);
  const todayDt = parseLocalDate(todayStr);

  let monthElapsedPct = Math.round((weekOfMonth / weeksInMonth) * 100);
  if (refPrefix < todayPrefix) {
    monthElapsedPct = 100;
  } else if (refPrefix === todayPrefix) {
    const elapsedDay = Math.min(daysInMonth, Math.max(dayOfMonth, todayDt.getDate()));
    monthElapsedPct = Math.min(
      100,
      Math.max(1, Math.round((elapsedDay / daysInMonth) * 100))
    );
  }

  return {
    weekOfMonth,
    weeksInMonth,
    monthElapsedPct,
    monthName: MONTH_NAMES[month] || '',
  };
}

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

function getHabitStreakUpTo(goal: Goal, endDateStr: string): number {
  let streak = 0;
  let cursor = endDateStr;
  let guard = 0;
  const origin = getGoalOriginDateStr(goal);

  while (cursor >= origin && guard < 120) {
    const stats = getDayCompletionStats(goal, cursor);
    if (stats.isDone) {
      streak += 1;
      cursor = addDays(cursor, -1);
      guard += 1;
      continue;
    }
    const scheduled = isDateScheduledForGoal(goal, cursor);
    if (!scheduled) {
      cursor = addDays(cursor, -1);
      guard += 1;
      continue;
    }
    if (cursor === endDateStr && goal.completions[cursor] === undefined) {
      cursor = addDays(cursor, -1);
      guard += 1;
      continue;
    }
    break;
  }
  return streak;
}

export function getWeeklyWindowDates(
  anchorDateStr: string,
  mode: WeeklyStatsMode
): { rangeStart: string; rangeEnd: string; days: string[] } {
  const rangeStart =
    mode === 'full_week'
      ? getMondayOfWeek(anchorDateStr)
      : addDays(anchorDateStr, -6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i));
  return {
    rangeStart,
    rangeEnd: days[6],
    days,
  };
}

export function pickReflectiveQuote(
  pct: number,
  emptySchedule: boolean
): WeeklyQuoteInfo {
  if (emptySchedule) {
    return {
      quote: 'Un viaje de mil millas comienza con un solo paso.',
      author: 'Lao-Tse',
      role: 'Filósofo',
    };
  }
  if (pct >= 80) {
    return {
      quote:
        'Nuestra vida entera, en la medida en que tiene una forma definida, no es más que un conjunto de hábitos.',
      author: 'William James',
      role: 'Psicólogo',
    };
  }
  if (pct >= 60) {
    return {
      quote:
        'El entusiasmo es común; la resistencia sostenida en el tiempo es lo que distingue a quienes alcanzan sus metas.',
      author: 'Angela Duckworth',
      role: 'Psicóloga',
    };
  }
  if (pct >= 35) {
    return {
      quote:
        'Uno puede elegir en cada momento avanzar hacia el crecimiento o retroceder hacia la seguridad.',
      author: 'Abraham Maslow',
      role: 'Psicólogo',
    };
  }
  return {
    quote:
      'Cuando ya no podemos cambiar una situación, tenemos el desafío de cambiarnos a nosotros mismos.',
    author: 'Viktor Frankl',
    role: 'Psiquiatra y neurólogo',
  };
}

export function buildWeeklyReport(
  goals: Goal[],
  anchorDateStr: string,
  todayStr: string,
  mode: WeeklyStatsMode,
  dailyQuizLogs: Record<string, DailyQuizResponse>
): WeeklyReportSummary {
  const activeGoals = goals.filter((g) => !g.isArchived);
  const { rangeStart, rangeEnd, days } = getWeeklyWindowDates(anchorDateStr, mode);

  const cappedEnd =
    rangeEnd <= todayStr ? rangeEnd : todayStr >= rangeStart ? todayStr : rangeEnd;
  const isoInfo = getISOWeekInfo(cappedEnd);
  const monthInfo = getWeekOfMonthInfo(cappedEnd, todayStr);

  const weekKey = `${isoInfo.isoYear}-W${String(isoInfo.weekOfYear).padStart(2, '0')}`;
  const rangeLabel = `${formatShortSpanishDate(rangeStart)} – ${formatShortSpanishDate(
    rangeEnd
  )}`;

  let naturalFlowDays = 0;
  let resistanceDays = 0;
  let restOrPendingDays = 0;

  let totalCompletedActions = 0;
  let totalScheduledActions = 0;

  // 4 diagnostic questions counters across the week
  const energyCounts: Record<QuizEnergyLevel, number> = {
    flow: 0,
    regular: 0,
    low: 0,
  };
  const obstacleCounts: Record<QuizObstacle, number> = {
    friction_time: 0,
    energy_mood: 0,
    forgot: 0,
    external_interruption: 0,
    mental_saturation: 0,
    habit_substitution: 0,
  };
  const breakPointCounts: Record<QuizBreakPoint, number> = {
    start: 0,
    middle: 0,
    planning: 0,
  };
  const reactionCounts: Record<QuizReaction, number> = {
    emergency_rule: 0,
    all_or_nothing: 0,
    postponed: 0,
  };

  const ingestQuizResponse = (q: DailyQuizResponse) => {
    if (q.energyLevel && q.energyLevel in energyCounts) {
      energyCounts[q.energyLevel] += 1;
    }
    if (q.frictionTags && q.frictionTags.length > 0) {
      for (const tag of q.frictionTags) {
        if (tag === 'forgot_distraction') obstacleCounts.forgot += 1;
        if (tag === 'emergency_unexpected') obstacleCounts.external_interruption += 1;
        if (tag === 'tight_time') obstacleCounts.friction_time += 1;
      }
    } else if (q.obstacle && q.obstacle in obstacleCounts) {
      obstacleCounts[q.obstacle] += 1;
    }
    if (q.breakPoint && q.breakPoint in breakPointCounts) {
      breakPointCounts[q.breakPoint] += 1;
    }
    if (q.reaction && q.reaction in reactionCounts) {
      reactionCounts[q.reaction] += 1;
    }
  };

  for (const dStr of days) {
    if (dStr > todayStr) {
      restOrPendingDays += 1;
      continue;
    }

    let dayScheduled = 0;
    let dayCompletedEq = 0;
    let dayHasResistance = false;
    let dayHasExplicitSkip = false;

    const dQuiz = dailyQuizLogs[dStr];
    if (dQuiz) {
      ingestQuizResponse(dQuiz);
      if (
        dQuiz.energyLevel === 'low' ||
        dQuiz.executionMode === 'with_resistance' ||
        Boolean(dQuiz.obstacle) ||
        Boolean(dQuiz.frictionTags?.length)
      ) {
        dayHasResistance = true;
      }
    }

    for (const g of activeGoals) {
      if (!getGoalInRangeOnDate(g, dStr)) continue;
      const stats = getDayCompletionStats(g, dStr);
      const isScheduled = isDateScheduledForGoal(g, dStr);
      const isFlexible =
        g.frequency?.type === 'times_per_week' ||
        g.frequency?.type === 'times_per_month';

      if (isScheduled) {
        dayScheduled += 1;
        dayCompletedEq += Math.min(1, stats.value / stats.target);
      } else if (stats.value > 0) {
        dayCompletedEq += Math.min(1, stats.value / stats.target);
        if (isFlexible) {
          dayScheduled += 1;
        }
      }

      if (g.skipped?.[dStr]) {
        dayHasExplicitSkip = true;
      }

      const gQuiz = g.quizLogs?.[dStr];
      if (gQuiz) {
        ingestQuizResponse(gQuiz);
        if (
          gQuiz.energyLevel === 'low' ||
          gQuiz.executionMode === 'with_resistance' ||
          Boolean(gQuiz.obstacle) ||
          Boolean(gQuiz.frictionTags?.length)
        ) {
          dayHasResistance = true;
        }
      }
    }

    totalScheduledActions += dayScheduled;
    totalCompletedActions += dayCompletedEq;

    const dayRatio =
      dayScheduled > 0 ? dayCompletedEq / dayScheduled : dayCompletedEq > 0 ? 1 : 0;

    if (dayScheduled === 0 && dayCompletedEq === 0) {
      restOrPendingDays += 1;
    } else if (
      dStr === todayStr &&
      dayCompletedEq === 0 &&
      !dayHasResistance &&
      !dayHasExplicitSkip
    ) {
      restOrPendingDays += 1;
    } else if (dayRatio >= 0.7 && !dayHasResistance) {
      naturalFlowDays += 1;
    } else if (dayHasResistance || dayHasExplicitSkip || (dayScheduled > 0 && dayRatio < 0.7)) {
      resistanceDays += 1;
    } else {
      restOrPendingDays += 1;
    }
  }

  // Per-habit stats for Victory (Slide 4), Against Items (Slide 1), and Adjustment (Slide 5)
  const perHabitStats: WeeklyHabitStat[] = [];
  const habitVictoryCandidates: Array<
    WeeklyHabitStat & { streakDays: number }
  > = [];

  for (const g of activeGoals) {
    let completed = 0;
    let scheduled = 0;
    const origin = getGoalOriginDateStr(g);

    for (const dStr of days) {
      if (
        dStr > todayStr ||
        dStr < origin ||
        (!g.isPermanent && dStr > g.deadlineDate)
      ) {
        continue;
      }
      const stats = getDayCompletionStats(g, dStr);
      if (stats.isDone) completed += 1;

      const freqType = g.frequency?.type || 'everyday';
      if (freqType === 'everyday') {
        scheduled += 1;
      } else if (freqType === 'specific_days' || freqType === 'every_n_days') {
        if (isDateScheduledForGoal(g, dStr)) scheduled += 1;
      }
    }

    if (g.frequency?.type === 'times_per_week') {
      const activeDays = days.filter(
        (d) => d <= todayStr && d >= origin && (g.isPermanent || d <= g.deadlineDate)
      ).length;
      scheduled = Math.min(activeDays, g.frequency.count || 3);
    } else if (g.frequency?.type === 'times_per_month') {
      const activeDays = days.filter(
        (d) => d <= todayStr && d >= origin && (g.isPermanent || d <= g.deadlineDate)
      ).length;
      scheduled = Math.min(
        activeDays,
        Math.max(1, Math.round(((g.frequency.count || 10) / 30) * activeDays))
      );
    }

    if (scheduled === 0 && completed > 0) {
      scheduled = completed;
    }

    if (scheduled > 0 || completed > 0) {
      const missed = Math.max(0, scheduled - completed);
      const pct =
        scheduled > 0 ? Math.min(100, Math.round((completed / scheduled) * 100)) : 0;
      const entry: WeeklyHabitStat = { goal: g, completed, scheduled, missed, pct };
      perHabitStats.push(entry);
      if (completed > 0) {
        habitVictoryCandidates.push({
          ...entry,
          streakDays: getHabitStreakUpTo(g, cappedEnd),
        });
      }
    }
  }

  habitVictoryCandidates.sort(
    (a, b) =>
      b.pct - a.pct || b.completed - a.completed || b.streakDays - a.streakDays
  );

  const topCandidate = habitVictoryCandidates[0] || null;
  const victory: WeeklyVictorySummary | null = topCandidate
    ? {
        goal: topCandidate.goal,
        completedDays: topCandidate.completed,
        targetDays: Math.max(topCandidate.completed, topCandidate.scheduled),
        streakDays: topCandidate.streakDays,
        pct: topCandidate.pct,
        headline: `¡Constancia en '${topCandidate.goal.title}' (${topCandidate.completed}/${Math.max(
          topCandidate.completed,
          topCandidate.scheduled
        )} días)!`,
      }
    : null;

  // Adjustment / weakest habit (like Monthly Slide "En lo que puedes mejorar")
  const adjustmentOrdered = [...perHabitStats].sort(
    (a, b) => a.pct - b.pct || b.missed - a.missed
  );
  const adjustmentHabit = adjustmentOrdered[0] || null;
  const otherAdjustmentHabits = adjustmentOrdered
    .slice(1)
    .filter((h) => h.pct < 100 || h.missed > 0)
    .slice(0, 2);

  // Build 4-question diagnostic metrics
  const energyTotal = energyCounts.flow + energyCounts.regular + energyCounts.low;
  const energyMeta: Array<{
    id: QuizEnergyLevel;
    label: string;
    emoji: string;
    color: string;
  }> = [
    { id: 'flow', label: 'Energía Alta', emoji: '🔋', color: '#10B981' },
    { id: 'regular', label: 'Energía Media', emoji: '⚡', color: '#F59E0B' },
    { id: 'low', label: 'Energía Baja', emoji: '🪫', color: '#F43F5E' },
  ];
  const energyItems: WeeklyDiagnosticBarItem[] =
    energyTotal > 0
      ? energyMeta
          .filter((e) => energyCounts[e.id] > 0)
          .map((e) => ({
            id: e.id,
            label: `${e.emoji} ${e.label}`,
            count: energyCounts[e.id],
            pct: Math.round((energyCounts[e.id] / energyTotal) * 100),
            color: e.color,
          }))
      : [];

  const topEnergyEntry =
    energyTotal > 0
      ? [...energyMeta].sort((a, b) => energyCounts[b.id] - energyCounts[a.id])[0]
      : null;

  const dominantEnergy =
    topEnergyEntry && energyTotal > 0
      ? {
          id: topEnergyEntry.id,
          label: topEnergyEntry.label,
          emoji: topEnergyEntry.emoji,
          pct: Math.round((energyCounts[topEnergyEntry.id] / energyTotal) * 100),
        }
      : null;

  const obstacleTotal = Object.values(obstacleCounts).reduce((a, b) => a + b, 0);
  const obstacleItems: WeeklyDiagnosticBarItem[] = (
    Object.entries(obstacleCounts) as Array<[QuizObstacle, number]>
  )
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id, count]) => ({
      id,
      label: getObstacleLabel(id),
      count,
      pct: obstacleTotal > 0 ? Math.round((count / obstacleTotal) * 100) : 0,
      color: '#0D9488',
    }));

  const breakPointTotal = Object.values(breakPointCounts).reduce((a, b) => a + b, 0);
  const breakPointItems: WeeklyDiagnosticBarItem[] = (
    Object.entries(breakPointCounts) as Array<[QuizBreakPoint, number]>
  )
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      id,
      label: getBreakPointLabel(id),
      count,
      pct: breakPointTotal > 0 ? Math.round((count / breakPointTotal) * 100) : 0,
      color: '#6366F1',
    }));

  const reactionTotal = Object.values(reactionCounts).reduce((a, b) => a + b, 0);
  const reactionItems: WeeklyDiagnosticBarItem[] = (
    Object.entries(reactionCounts) as Array<[QuizReaction, number]>
  )
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      id,
      label: getReactionLabel(id),
      count,
      pct: reactionTotal > 0 ? Math.round((count / reactionTotal) * 100) : 0,
      color: '#F59E0B',
    }));

  // Slide 1 "Lo que jugó en tu contra" (mirroring Monthly Slide 3)
  const againstItems: WeeklyAgainstItem[] = [];
  for (const obs of obstacleItems.slice(0, 2)) {
    againstItems.push({
      id: `obs-${obs.id}`,
      emoji: '⚡',
      title: obs.label,
      subtitle: 'Obstáculo registrado',
      rightLabel: `${obs.count} ${obs.count === 1 ? 'vez' : 'veces'}`,
    });
  }
  const missedHabits = [...perHabitStats]
    .filter((h) => h.missed > 0)
    .sort((a, b) => b.missed - a.missed || a.pct - b.pct);
  for (const h of missedHabits) {
    if (againstItems.length >= 3) break;
    againstItems.push({
      id: `miss-${h.goal.id}`,
      emoji: h.goal.iconType === 'emoji' ? h.goal.iconValue : '📌',
      title: h.goal.title,
      subtitle: `${h.completed} de ${h.scheduled} cumplidos`,
      rightLabel: `${h.missed} ${h.missed === 1 ? 'falta' : 'faltas'}`,
      goalId: h.goal.id,
    });
  }

  // Slide 5 concrete friction-based intention
  const targetHabitTitle =
    adjustmentHabit?.goal.title ||
    victory?.goal.title ||
    activeGoals[0]?.title ||
    'tu hábito clave';
  const topObstacleId = obstacleItems[0]?.id as QuizObstacle | undefined;

  let focusIntention = `Mantener '${targetHabitTitle}'. Si la energía baja, haz la versión reducida, pero no lo saltes.`;
  if (topObstacleId === 'energy_mood' || dominantEnergy?.id === 'low') {
    focusIntention = `Protege '${targetHabitTitle}' en la semana ${isoInfo.nextWeekOfYear}: cuando baje tu energía, aplica una versión mínima de 5 minutos sin exigencia extra.`;
  } else if (topObstacleId === 'friction_time' || topObstacleId === 'mental_saturation') {
    focusIntention = `Reserva un bloque fijo y breve para '${targetHabitTitle}' antes de que el día se sature por falta de tiempo.`;
  } else if (topObstacleId === 'forgot') {
    focusIntention = `Ancla '${targetHabitTitle}' justo después de una rutina diaria fija para que no dependa de recordarlo.`;
  } else if (adjustmentHabit && adjustmentHabit.pct >= 80) {
    focusIntention = `Mantén el impulso en '${targetHabitTitle}' (${adjustmentHabit.pct}%): un pequeño ajuste lo llevará al 100% la próxima semana.`;
  }

  const overallPctExact =
    totalScheduledActions > 0
      ? Math.min(
          100,
          Math.round((totalCompletedActions / totalScheduledActions) * 1000) / 10
        )
      : 0;
  const overallPct = Math.round(overallPctExact);
  const missedPctExact =
    totalScheduledActions > 0
      ? Math.max(0, Math.round((100 - overallPctExact) * 10) / 10)
      : 0;

  // Compute month-to-date completion result for the reference month
  const refMonthDt = parseLocalDate(cappedEnd);
  const monthStartStr = toLocalDateStr(
    new Date(refMonthDt.getFullYear(), refMonthDt.getMonth(), 1)
  );
  let monthSched = 0;
  let monthCompEq = 0;
  let mCursor = monthStartStr;
  let mGuard = 0;
  while (mCursor <= cappedEnd && mGuard < 32) {
    for (const g of activeGoals) {
      if (!getGoalInRangeOnDate(g, mCursor)) continue;
      const stats = getDayCompletionStats(g, mCursor);
      const isScheduled = isDateScheduledForGoal(g, mCursor);
      const isFlexible =
        g.frequency?.type === 'times_per_week' ||
        g.frequency?.type === 'times_per_month';
      if (isScheduled) {
        monthSched += 1;
        monthCompEq += Math.min(1, stats.value / stats.target);
      } else if (stats.value > 0) {
        monthCompEq += Math.min(1, stats.value / stats.target);
        if (isFlexible) monthSched += 1;
      }
    }
    mCursor = addDays(mCursor, 1);
    mGuard += 1;
  }

  const monthResultPct =
    monthSched > 0 ? Math.min(100, Math.round((monthCompEq / monthSched) * 100)) : overallPct;

  const monthQuote = pickReflectiveQuote(
    monthResultPct,
    monthSched === 0 && totalScheduledActions === 0
  );

  // Detect any habit evolution (phase_up / became permanent) that happened inside this week
  const evolvedHabits: WeeklyHabitEvolution[] = [];
  for (const g of activeGoals) {
    const history = g.phaseHistory || [];
    for (let i = history.length - 1; i >= 0; i--) {
      const rec = history[i];
      if (rec.outcome !== 'evolved' && rec.outcome !== 'permanent') continue;
      const eventDate = rec.endedAt || rec.deadlineDate;
      if (eventDate >= rangeStart && eventDate <= cappedEnd) {
        const toPhase =
          i === history.length - 1
            ? Math.max(rec.phaseNumber + 1, g.phaseNumber || 2)
            : rec.phaseNumber + 1;
        evolvedHabits.push({
          goal: g,
          fromPhase: rec.phaseNumber,
          toPhase,
          fromTitle: rec.title,
          toTitle: g.title,
          fromSummary: rec.frequencySummary,
          toSummary: g.isPermanent
            ? `${formatFrequencySummary(g.frequency)} · Permanente`
            : formatFrequencySummary(g.frequency),
          outcome: rec.outcome,
          eventDate,
        });
        break;
      }
    }
  }

  return {
    weekKey,
    rangeStart,
    rangeEnd,
    rangeLabel,
    mode,
    weekOfYear: isoInfo.weekOfYear,
    nextWeekOfYear: isoInfo.nextWeekOfYear,
    weekOfMonth: monthInfo.weekOfMonth,
    weeksInMonth: monthInfo.weeksInMonth,
    monthElapsedPct: monthInfo.monthElapsedPct,
    monthName: monthInfo.monthName,
    monthResultPct,
    monthQuote,
    totalCompletedActions: Math.round(totalCompletedActions * 10) / 10,
    totalScheduledActions,
    overallPct,
    overallPctExact,
    missedPctExact,
    againstItems,
    naturalFlowDays,
    resistanceDays,
    restOrPendingDays,
    diagnostics: {
      dominantEnergy,
      energyTotal,
      energyItems,
      obstacleTotal,
      obstacleItems,
      breakPointTotal,
      breakPointItems,
      reactionTotal,
      reactionItems,
    },
    victory,
    evolvedHabits,
    adjustmentHabit,
    otherAdjustmentHabits,
    focusIntention,
  };
}

export function shouldTriggerFridayAnticipation(
  now: Date,
  enabled: boolean | undefined,
  dismissedDate: string | null
): boolean {
  if (!enabled) return false;
  if (now.getDay() !== 5 || now.getHours() < 17) return false;
  const todayStr = toLocalDateStr(now);
  return dismissedDate !== todayStr;
}

export function sendFridayAnticipationNotification(): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification('Viernes de Anticipación · Ritmo', {
      body: '¿Ya viste tu mapa de calor? Si completas el sábado, el domingo tu reporte se verá increíble. ¡Tú decides tu ritmo, sin culpa!',
    });
  }
}
