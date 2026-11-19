import {
  DailyQuizResponse,
  Goal,
  QuizBreakPoint,
  QuizEnergyLevel,
  QuizObstacle,
  QuizReaction,
} from '../types/tracker';
import {
  getBreakPointLabel,
  getObstacleLabel,
  getReactionLabel,
} from './diagnosticEngine';
import {
  addDays,
  enumerateDates,
  formatFrequencySummary,
  getDayCompletionStats,
  getGoalOriginDateStr,
  parseLocalDate,
  toLocalDateStr,
} from './paceEngine';
import {
  pickReflectiveQuote,
  WeeklyDiagnosticBarItem,
  WeeklyDiagnosticMetrics,
  WeeklyHabitEvolution,
  WeeklyQuoteInfo,
} from './weeklyReport';

export interface MonthlyWeekdayBar {
  dayOfWeek: number;
  short: string;
  completed: number;
  scheduled: number;
  pct: number;
}

export interface MonthlyWeekScore {
  label: string;
  range: string;
  pct: number | null;
  completed: number;
  scheduled: number;
}

export interface MonthlyHabitStat {
  goal: Goal;
  completed: number;
  scheduled: number;
  missed: number;
  pct: number;
  bestStreak: number;
}

export interface MonthlyObstacleStat {
  id: string;
  label: string;
  count: number;
}

export interface MonthlyHabitProgress {
  goal: Goal;
  kind: 'count_up' | 'rate_up' | 'phase_up';
  headline: string;
  subtext: string;
  deltaLabel: string;
  fromValue: number;
  toValue: number;
  fromLabel: string;
  toLabel: string;
  sortScore: number;
}

export interface MonthlyHeatmapCell {
  dateStr: string;
  dayNum: number;
  inMonth: boolean;
  isFuture: boolean;
  scheduled: number;
  completed: number;
  pct: number | null;
}

export interface MonthlyReportData {
  year: number;
  month: number; // 0-indexed
  monthNumber: number; // 1-12
  yearElapsedPct: number;
  monthDaysElapsed: number;
  monthDaysTotal: number;
  monthElapsedPct: number;
  monthQuote: WeeklyQuoteInfo;
  monthKey: string; // YYYY-MM
  monthName: string;
  monthTitle: string; // Capitalized e.g. "Noviembre 2026"
  rangeLabel: string; // e.g. "1–17 nov"
  isOngoing: boolean;
  totalDaysEvaluated: number;
  activeDaysCount: number;
  totalCompletedCount: number;
  totalScheduledCount: number;
  overallPct: number;
  overallPctExact: number;
  missedPctExact: number;
  bestStreakInMonth: number;
  scoreLabel: string;
  summarySubtitle: string;
  motivationalTitle: string;
  motivationalMessage: string;
  weekdayPatternNote: string;
  calendarCells: MonthlyHeatmapCell[];
  weekdayBars: MonthlyWeekdayBar[];
  weeklyScores: MonthlyWeekScore[];
  perHabitStats: MonthlyHabitStat[];
  bestHabit: MonthlyHabitStat | null;
  runnerUpHabits: MonthlyHabitStat[];
  weakestHabit: MonthlyHabitStat | null;
  otherImproveHabits: MonthlyHabitStat[];
  progressedHabits: MonthlyHabitProgress[];
  evolvedHabits: WeeklyHabitEvolution[];
  topObstacles: MonthlyObstacleStat[];
  naturalFlowDays: number;
  resistanceDays: number;
  diagnostics: WeeklyDiagnosticMetrics;
}

const MONTH_NAMES_LOWER = [
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

const MONTH_SHORT = [
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

const WEEKDAYS_MON_FIRST: Array<{ id: number; short: string }> = [
  { id: 1, short: 'L' },
  { id: 2, short: 'M' },
  { id: 3, short: 'M' },
  { id: 4, short: 'J' },
  { id: 5, short: 'V' },
  { id: 6, short: 'S' },
  { id: 0, short: 'D' },
];

export function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function getPreviousMonth(year: number, month: number): {
  year: number;
  month: number;
} {
  if (month === 0) return { year: year - 1, month: 11 };
  return { year, month: month - 1 };
}

export function getNextMonth(year: number, month: number): {
  year: number;
  month: number;
} {
  if (month === 11) return { year: year + 1, month: 0 };
  return { year, month: month + 1 };
}

function wasGoalActiveOnDate(goal: Goal, dateStr: string): boolean {
  if (dateStr >= goal.startDate && dateStr <= goal.deadlineDate) return true;
  if (Array.isArray(goal.phaseHistory)) {
    for (const rec of goal.phaseHistory) {
      if (dateStr >= rec.startDate && dateStr <= rec.deadlineDate) {
        return true;
      }
    }
  }
  const origin = getGoalOriginDateStr(goal);
  return Number(goal.completions[dateStr] || 0) > 0 && dateStr >= origin;
}

function isGoalScheduledOnHistoricalDate(goal: Goal, dateStr: string): boolean {
  if (!wasGoalActiveOnDate(goal, dateStr)) return false;

  const freq = goal.frequency || { type: 'everyday' };
  if (freq.type === 'specific_days') {
    const weekdays =
      freq.weekdays && freq.weekdays.length > 0 ? freq.weekdays : [1, 2, 3, 4, 5];
    const dayOfWeek = parseLocalDate(dateStr).getDay();
    return weekdays.includes(dayOfWeek);
  }
  if (freq.type === 'every_n_days') {
    const interval = Math.max(2, freq.intervalDays || 2);
    const baseTime = parseLocalDate(goal.startDate).getTime();
    const curTime = parseLocalDate(dateStr).getTime();
    const delta = Math.round((curTime - baseTime) / 86400000);
    return Math.abs(delta) % interval === 0;
  }
  return true;
}

export function buildMonthlyReport(
  goals: Goal[],
  year: number,
  month: number,
  todayStr: string,
  dailyQuizLogs: Record<string, DailyQuizResponse> = {}
): MonthlyReportData {
  const monthKey = getMonthKey(year, month);
  const monthName = MONTH_NAMES_LOWER[month] || 'mes';
  const monthTitle = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`;

  const firstDayDate = new Date(year, month, 1);
  const lastDayDate = new Date(year, month + 1, 0);
  const firstDayStr = toLocalDateStr(firstDayDate);
  const lastDayOfMonthStr = toLocalDateStr(lastDayDate);

  const todayKey = todayStr.slice(0, 7);
  const isOngoing = monthKey === todayKey;
  const evalEndStr =
    monthKey > todayKey
      ? addDays(firstDayStr, -1)
      : isOngoing
      ? todayStr
      : lastDayOfMonthStr;

  const evalDates =
    evalEndStr >= firstDayStr ? enumerateDates(firstDayStr, evalEndStr) : [];

  const lastEvaluatedDayNum =
    evalDates.length > 0
      ? Number(evalDates[evalDates.length - 1].split('-')[2])
      : lastDayDate.getDate();

  const rangeLabel = `1–${lastEvaluatedDayNum} ${MONTH_SHORT[month]}`;

  // Weekday accumulators
  const weekdayMap = new Map<number, { completed: number; scheduled: number }>();
  for (const wd of WEEKDAYS_MON_FIRST) {
    weekdayMap.set(wd.id, { completed: 0, scheduled: 0 });
  }

  // Week buckets inside the month (days 1-7, 8-14, 15-21, 22-28, 29-end)
  const totalDaysInCalendarMonth = lastDayDate.getDate();
  const weekBuckets: Array<{
    label: string;
    range: string;
    startDay: number;
    endDay: number;
    completedEq: number;
    scheduled: number;
  }> = [
    { label: 'S1', range: '1–7', startDay: 1, endDay: 7, completedEq: 0, scheduled: 0 },
    { label: 'S2', range: '8–14', startDay: 8, endDay: 14, completedEq: 0, scheduled: 0 },
    { label: 'S3', range: '15–21', startDay: 15, endDay: 21, completedEq: 0, scheduled: 0 },
    { label: 'S4', range: '22–28', startDay: 22, endDay: 28, completedEq: 0, scheduled: 0 },
  ];
  if (totalDaysInCalendarMonth > 28) {
    weekBuckets.push({
      label: 'S5',
      range: `29–${totalDaysInCalendarMonth}`,
      startDay: 29,
      endDay: totalDaysInCalendarMonth,
      completedEq: 0,
      scheduled: 0,
    });
  }

  // Per-habit accumulators
  const habitAcc = new Map<
    string,
    {
      goal: Goal;
      completedEq: number;
      scheduled: number;
      currentStreak: number;
      bestStreak: number;
    }
  >();

  let totalCompletedEq = 0;
  let totalScheduledCount = 0;
  let activeDaysCount = 0;
  let runningGlobalStreak = 0;
  let bestStreakInMonth = 0;

  // Obstacle & diagnostic counters in this month
  const obstacleCounts: Record<QuizObstacle, number> = {
    friction_time: 0,
    energy_mood: 0,
    forgot: 0,
    external_interruption: 0,
    mental_saturation: 0,
    habit_substitution: 0,
  };
  const energyCounts: Record<QuizEnergyLevel, number> = {
    flow: 0,
    regular: 0,
    low: 0,
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

  let naturalFlowDays = 0;
  let resistanceDays = 0;

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

  // Daily adherence map for heatmap
  const dailyHeatmapStats = new Map<
    string,
    { scheduled: number; completedEq: number; completed: number }
  >();

  for (const dStr of evalDates) {
    const dt = parseLocalDate(dStr);
    const dow = dt.getDay();
    const dayNum = dt.getDate();
    const weekIdx = Math.min(weekBuckets.length - 1, Math.floor((dayNum - 1) / 7));

    let dayScheduled = 0;
    let dayCompletedEq = 0;
    let dayCompleted = 0;

    let anyScheduledToday = false;
    let anyCompletedToday = false;
    let dayHasResistance = false;
    let dayHasExplicitSkip = false;

    const dayQuiz = dailyQuizLogs[dStr];
    if (dayQuiz) {
      ingestQuizResponse(dayQuiz);
      if (
        dayQuiz.energyLevel === 'low' ||
        dayQuiz.executionMode === 'with_resistance' ||
        Boolean(dayQuiz.obstacle) ||
        Boolean(dayQuiz.frictionTags?.length)
      ) {
        dayHasResistance = true;
      }
    }

    for (const goal of goals) {
      const goalQuiz = goal.quizLogs?.[dStr];
      if (goalQuiz) {
        ingestQuizResponse(goalQuiz);
        if (
          goalQuiz.energyLevel === 'low' ||
          goalQuiz.executionMode === 'with_resistance' ||
          Boolean(goalQuiz.obstacle) ||
          Boolean(goalQuiz.frictionTags?.length)
        ) {
          dayHasResistance = true;
        }
      }

      if (goal.skipped?.[dStr]) {
        dayHasExplicitSkip = true;
      }

      const isScheduled = isGoalScheduledOnHistoricalDate(goal, dStr);
      const stats = getDayCompletionStats(goal, dStr);
      const hasCompletion = stats.value > 0;
      if (!isScheduled && !hasCompletion) continue;

      if (isScheduled) {
        anyScheduledToday = true;
      }

      const eq = Math.min(1, stats.value / stats.target);

      if (isScheduled) {
        totalScheduledCount += 1;
        dayScheduled += 1;
      }
      totalCompletedEq += eq;
      dayCompletedEq += eq;
      if (stats.isDone) dayCompleted += 1;

      const wdEntry = weekdayMap.get(dow);
      if (wdEntry) {
        if (isScheduled) wdEntry.scheduled += 1;
        if (stats.isDone) wdEntry.completed += 1;
      }

      if (isScheduled) weekBuckets[weekIdx].scheduled += 1;
      weekBuckets[weekIdx].completedEq += eq;

      let hEntry = habitAcc.get(goal.id);
      if (!hEntry) {
        hEntry = {
          goal,
          completedEq: 0,
          scheduled: 0,
          currentStreak: 0,
          bestStreak: 0,
        };
        habitAcc.set(goal.id, hEntry);
      }

      if (isScheduled) hEntry.scheduled += 1;
      hEntry.completedEq += eq;

      if (stats.isDone) {
        anyCompletedToday = true;
        hEntry.currentStreak += 1;
        if (hEntry.currentStreak > hEntry.bestStreak) {
          hEntry.bestStreak = hEntry.currentStreak;
        }
      } else if (isScheduled) {
        hEntry.currentStreak = 0;
      }
    }

    dailyHeatmapStats.set(dStr, {
      scheduled: dayScheduled,
      completedEq: dayCompletedEq,
      completed: dayCompleted,
    });

    const dayRatio =
      dayScheduled > 0 ? dayCompletedEq / dayScheduled : dayCompletedEq > 0 ? 1 : 0;
    if (dayScheduled > 0 || dayCompletedEq > 0) {
      if (
        dStr === todayStr &&
        dayCompletedEq === 0 &&
        !dayHasResistance &&
        !dayHasExplicitSkip
      ) {
        // Pending current day without resistance
      } else if (dayRatio >= 0.7 && !dayHasResistance) {
        naturalFlowDays += 1;
      } else if (dayHasResistance || dayHasExplicitSkip || (dayScheduled > 0 && dayRatio < 0.7)) {
        resistanceDays += 1;
      }
    }

    if (anyCompletedToday) {
      activeDaysCount += 1;
    }
    if (anyScheduledToday) {
      if (anyCompletedToday) {
        runningGlobalStreak += 1;
        if (runningGlobalStreak > bestStreakInMonth) {
          bestStreakInMonth = runningGlobalStreak;
        }
      } else {
        runningGlobalStreak = 0;
      }
    }
  }

  const overallPctExact =
    totalScheduledCount > 0
      ? Math.min(100, Math.round((totalCompletedEq / totalScheduledCount) * 1000) / 10)
      : 0;
  const overallPct = Math.round(overallPctExact);
  const missedPctExact =
    totalScheduledCount > 0
      ? Math.round(Math.max(0, 100 - overallPctExact) * 10) / 10
      : 0;

  let scoreLabel = 'Sin registros';
  if (totalScheduledCount > 0) {
    if (overallPct >= 85) scoreLabel = 'Sobresaliente';
    else if (overallPct >= 70) scoreLabel = 'Muy bien';
    else if (overallPct >= 50) scoreLabel = 'Constante';
    else if (overallPct >= 25) scoreLabel = 'Regular';
    else scoreLabel = 'En inicio';
  }

  let summarySubtitle = 'Sigues registrando y eso cuenta';
  if (totalScheduledCount === 0) {
    summarySubtitle = 'No hubo hábitos programados en este periodo';
  } else if (overallPct >= 85) {
    summarySubtitle = 'Mes sólido: tu disciplina sostuvo el ritmo';
  } else if (overallPct >= 65) {
    summarySubtitle = 'Buen balance mensual, avanzando con constancia';
  } else if (activeDaysCount > 0) {
    summarySubtitle = 'Cada día que sumaste mantuvo vivo tu proceso';
  } else {
    summarySubtitle = 'Un mes en pausa siempre puede retomarse paso a paso';
  }

  const weekdayBars: MonthlyWeekdayBar[] = WEEKDAYS_MON_FIRST.map((wd) => {
    const entry = weekdayMap.get(wd.id) || { completed: 0, scheduled: 0 };
    return {
      dayOfWeek: wd.id,
      short: wd.short,
      completed: entry.completed,
      scheduled: entry.scheduled,
      pct:
        entry.scheduled > 0
          ? Math.min(100, Math.round((entry.completed / entry.scheduled) * 100))
          : 0,
    };
  });

  const weeklyScores: MonthlyWeekScore[] = weekBuckets.map((wb) => ({
    label: wb.label,
    range: wb.range,
    pct:
      wb.scheduled > 0
        ? Math.min(100, Math.round((wb.completedEq / wb.scheduled) * 100))
        : null,
    completed: Math.round(wb.completedEq),
    scheduled: wb.scheduled,
  }));

  const perHabitStats: MonthlyHabitStat[] = Array.from(habitAcc.values())
    .filter((h) => h.scheduled > 0)
    .map((h) => {
      const completed = Math.round(h.completedEq);
      const pct = Math.min(100, Math.round((h.completedEq / h.scheduled) * 100));
      return {
        goal: h.goal,
        completed,
        scheduled: h.scheduled,
        missed: Math.max(0, h.scheduled - completed),
        pct,
        bestStreak: h.bestStreak,
      };
    });

  const sortedDesc = [...perHabitStats].sort(
    (a, b) => b.pct - a.pct || b.completed - a.completed
  );
  const bestHabit = sortedDesc[0] || null;
  const runnerUpHabits = sortedDesc.slice(1, 4);

  const sortedAsc = [...perHabitStats].sort(
    (a, b) => a.pct - b.pct || b.missed - a.missed
  );
  const weakestPool =
    sortedAsc.length > 1 && bestHabit
      ? sortedAsc.filter((h) => h.goal.id !== bestHabit.goal.id)
      : sortedAsc;
  const weakestHabit = weakestPool[0] || null;
  const otherImproveHabits = weakestPool.slice(1, 4);

  // Detect habits that progressed compared to previous month or evolved phase
  const prevRef = getPreviousMonth(year, month);
  const prevMonthName = MONTH_NAMES_LOWER[prevRef.month] || 'mes anterior';
  const prevFirstStr = toLocalDateStr(new Date(prevRef.year, prevRef.month, 1));
  const prevLastStr = toLocalDateStr(new Date(prevRef.year, prevRef.month + 1, 0));
  const prevDates = enumerateDates(prevFirstStr, prevLastStr);

  const progressedHabits: MonthlyHabitProgress[] = [];
  const evolvedHabits: WeeklyHabitEvolution[] = [];
  const evolvedGoalIds = new Set<string>();

  for (const goal of goals) {
    if (goal.isArchived) continue;
    const history = goal.phaseHistory || [];
    for (let i = history.length - 1; i >= 0; i--) {
      const rec = history[i];
      if (rec.outcome !== 'evolved' && rec.outcome !== 'permanent') continue;
      const eventDate = rec.endedAt || rec.deadlineDate;
      if (eventDate >= firstDayStr && eventDate <= evalEndStr) {
        const toPhase =
          i === history.length - 1
            ? Math.max(rec.phaseNumber + 1, goal.phaseNumber || 2)
            : rec.phaseNumber + 1;
        evolvedHabits.push({
          goal,
          fromPhase: rec.phaseNumber,
          toPhase,
          fromTitle: rec.title,
          toTitle: goal.title,
          fromSummary: rec.frequencySummary,
          toSummary: goal.isPermanent
            ? `${formatFrequencySummary(goal.frequency)} · Permanente`
            : formatFrequencySummary(goal.frequency),
          outcome: rec.outcome,
          eventDate,
        });
        evolvedGoalIds.add(goal.id);
        break;
      }
    }
  }

  for (const h of perHabitStats) {
    if (h.completed <= 0 && !evolvedGoalIds.has(h.goal.id)) continue;

    let added = false;

    const evo = evolvedHabits.find((e) => e.goal.id === h.goal.id);
    if (evo) {
      progressedHabits.push({
        goal: h.goal,
        kind: 'phase_up',
        headline: `Evolucionaste de Fase ${evo.fromPhase} a Fase ${evo.toPhase}`,
        subtext: `Antes: ${evo.fromSummary} · Ahora: ${evo.toSummary}`,
        deltaLabel: `Fase ${evo.toPhase}`,
        fromValue: Math.max(1, evo.fromPhase),
        toValue: evo.toPhase,
        fromLabel: `Fase ${evo.fromPhase}`,
        toLabel: `Fase ${evo.toPhase}`,
        sortScore: 500 + h.pct,
      });
      added = true;
    }

    let prevScheduled = 0;
    let prevCompletedEq = 0;
    for (const pDate of prevDates) {
      if (!isGoalScheduledOnHistoricalDate(h.goal, pDate)) continue;
      prevScheduled += 1;
      const stats = getDayCompletionStats(h.goal, pDate);
      prevCompletedEq += Math.min(1, stats.value / stats.target);
    }

    const prevCompleted = Math.round(prevCompletedEq);
    const prevPct =
      prevScheduled > 0 ? Math.round((prevCompletedEq / prevScheduled) * 100) : 0;

    if (!added && (prevScheduled > 0 || prevCompleted > 0) && h.completed > prevCompleted) {
      const diff = h.completed - prevCompleted;
      progressedHabits.push({
        goal: h.goal,
        kind: 'count_up',
        headline: `Pasaste de ${prevCompleted} ${
          prevCompleted === 1 ? 'vez' : 'veces'
        } a ${h.completed} en ${monthName}`,
        subtext:
          prevScheduled > 0
            ? `En ${prevMonthName}: ${prevCompleted} (${prevPct}%) · En ${monthName}: ${h.completed} (${h.pct}%)`
            : `En ${prevMonthName}: ${prevCompleted} · En ${monthName}: ${h.completed}`,
        deltaLabel: `+${diff} ${diff === 1 ? 'vez' : 'veces'}`,
        fromValue: prevCompleted,
        toValue: h.completed,
        fromLabel: `${prevCompleted} (${prevMonthName})`,
        toLabel: `${h.completed} (${monthName})`,
        sortScore: diff * 100 + (h.pct - prevPct),
      });
      continue;
    }

    if (!added && prevScheduled > 0 && h.pct >= prevPct + 10) {
      const pctDiff = h.pct - prevPct;
      progressedHabits.push({
        goal: h.goal,
        kind: 'rate_up',
        headline: `Subiste de ${prevPct}% a ${h.pct}% en ${monthName}`,
        subtext: `Mayor constancia frente a ${prevMonthName} (${prevCompleted}/${prevScheduled} → ${h.completed}/${h.scheduled})`,
        deltaLabel: `+${pctDiff}%`,
        fromValue: prevPct,
        toValue: h.pct,
        fromLabel: `${prevPct}% (${prevMonthName})`,
        toLabel: `${h.pct}% (${monthName})`,
        sortScore: pctDiff * 10,
      });
    }
  }

  progressedHabits.sort((a, b) => b.sortScore - a.sortScore);

  const sortedObstacleEntries = (
    Object.entries(obstacleCounts) as Array<[QuizObstacle, number]>
  )
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  const topObstacles: MonthlyObstacleStat[] = sortedObstacleEntries
    .slice(0, 3)
    .map(([id, count]) => ({
      id,
      label: getObstacleLabel(id),
      count,
    }));

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

  const obstacleTotal = sortedObstacleEntries.reduce((acc, [, c]) => acc + c, 0);
  const obstacleItems: WeeklyDiagnosticBarItem[] = sortedObstacleEntries
    .slice(0, 4)
    .map(([id, count]) => ({
      id,
      label: getObstacleLabel(id),
      count,
      pct: obstacleTotal > 0 ? Math.round((count / obstacleTotal) * 100) : 0,
      color: '#3B4DF5',
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

  const totalCompletedRounded = Math.round(totalCompletedEq);

  let motivationalTitle = `Tu avance en ${monthName}`;
  let motivationalMessage =
    'Cada día registrado construye conciencia y te acerca a tus objetivos.';

  if (totalScheduledCount === 0) {
    motivationalTitle = `Nuevo ciclo en ${monthName}`;
    motivationalMessage =
      'Aún no hay hábitos programados en este mes. Un primer paso sencillo activa tu ritmo.';
  } else if (overallPct >= 85) {
    motivationalTitle = `¡Mes sobresaliente en ${monthName}!`;
    motivationalMessage = `Sostuviste un ${overallPct}% de cumplimiento con ${totalCompletedRounded} hábitos logrados. Tu constancia ya es parte de tu identidad.`;
  } else if (overallPct >= 65) {
    motivationalTitle = `Gran progreso en ${monthName}`;
    motivationalMessage = `Alcanzaste un ${overallPct}% de avance en ${activeDaysCount} días activos. Vas construyendo resultados reales paso a paso.`;
  } else if (overallPct >= 40) {
    motivationalTitle = `Avance constante en ${monthName}`;
    motivationalMessage = `Sumaste ${totalCompletedRounded} hábitos cumplidos en ${activeDaysCount} días activos. Sostener el ritmo en días retadores es lo que marca la diferencia.`;
  } else if (totalCompletedRounded > 0) {
    motivationalTitle = `Cada paso cuenta en ${monthName}`;
    motivationalMessage = `Lograste ${totalCompletedRounded} hábitos${
      bestStreakInMonth >= 2 ? ` y una racha de ${bestStreakInMonth} días` : ''
    }. Cada vez que vuelves a intentarlo fortaleces tu disciplina.`;
  } else {
    motivationalTitle = `Un mes en pausa en ${monthName}`;
    motivationalMessage =
      'Los momentos de pausa no borran tu camino; retomar con una meta pequeña vuelve a encender tu progreso.';
  }

  // Build Monday-first calendar heatmap cells for the entire target month
  const startWeekdayIdx = (firstDayDate.getDay() + 6) % 7; // 0=Mon..6=Sun
  const totalSlots = Math.ceil((startWeekdayIdx + totalDaysInCalendarMonth) / 7) * 7;
  const calendarCells: MonthlyHeatmapCell[] = [];

  for (let i = 0; i < totalSlots; i++) {
    const dayOffset = i - startWeekdayIdx;
    if (dayOffset < 0 || dayOffset >= totalDaysInCalendarMonth) {
      calendarCells.push({
        dateStr: `pad-${i}`,
        dayNum: 0,
        inMonth: false,
        isFuture: false,
        scheduled: 0,
        completed: 0,
        pct: null,
      });
      continue;
    }

    const d = new Date(year, month, 1 + dayOffset);
    const dStr = toLocalDateStr(d);
    const isFuture = dStr > todayStr;
    const dayStat = dailyHeatmapStats.get(dStr);
    const scheduled = dayStat?.scheduled || 0;
    const completed = dayStat?.completed || 0;
    const pct =
      !isFuture && scheduled > 0 && dayStat
        ? Math.round((dayStat.completedEq / scheduled) * 100)
        : null;

    calendarCells.push({
      dateStr: dStr,
      dayNum: 1 + dayOffset,
      inMonth: true,
      isFuture,
      scheduled,
      completed,
      pct,
    });
  }

  // Identify strongest / weakest days of the week
  const WEEKDAY_NAMES_FULL: Record<number, string> = {
    1: 'Lun',
    2: 'Mar',
    3: 'Mié',
    4: 'Jue',
    5: 'Vie',
    6: 'Sáb',
    0: 'Dom',
  };
  const evaluatedWeekdays = weekdayBars.filter((b) => b.scheduled > 0);
  let weekdayPatternNote = 'Registra más días para detectar patrones semanales.';
  if (evaluatedWeekdays.length >= 2) {
    const byPctDesc = [...evaluatedWeekdays].sort(
      (a, b) => b.pct - a.pct || b.completed - a.completed
    );
    const best = byPctDesc[0];
    const second = byPctDesc[1];
    const weakest = byPctDesc[byPctDesc.length - 1];

    if (best.pct - weakest.pct <= 12) {
      weekdayPatternNote = `Ritmo muy parejo toda la semana (entre ${weakest.pct}% y ${best.pct}%).`;
    } else {
      const topTwoSame = second && best.pct - second.pct <= 10;
      const bestText = topTwoSame
        ? `${WEEKDAY_NAMES_FULL[best.dayOfWeek]} (${best.pct}%) y ${WEEKDAY_NAMES_FULL[second.dayOfWeek]} (${second.pct}%)`
        : `${WEEKDAY_NAMES_FULL[best.dayOfWeek]} (${best.pct}%)`;
      weekdayPatternNote = `Días más exitosos: ${bestText} · Menor adherencia: ${WEEKDAY_NAMES_FULL[weakest.dayOfWeek]} (${weakest.pct}%).`;
    }
  } else if (evaluatedWeekdays.length === 1) {
    const only = evaluatedWeekdays[0];
    weekdayPatternNote = `Por ahora solo hay registros en ${WEEKDAY_NAMES_FULL[only.dayOfWeek]} (${only.pct}%).`;
  }

  const monthNumber = month + 1;
  const monthDaysTotal = totalDaysInCalendarMonth;
  const monthDaysElapsed =
    monthKey > todayKey
      ? 0
      : isOngoing
      ? Math.min(monthDaysTotal, Math.max(1, parseLocalDate(todayStr).getDate()))
      : monthDaysTotal;
  const monthElapsedPct = Math.min(
    100,
    Math.max(0, Math.round((monthDaysElapsed / Math.max(1, monthDaysTotal)) * 100))
  );
  const yearElapsedPct = Math.min(
    100,
    Math.max(1, Math.round((monthNumber / 12) * 100))
  );
  const monthQuote = pickReflectiveQuote(overallPct, totalScheduledCount === 0);

  return {
    year,
    month,
    monthNumber,
    yearElapsedPct,
    monthDaysElapsed,
    monthDaysTotal,
    monthElapsedPct,
    monthQuote,
    monthKey,
    monthName,
    monthTitle,
    rangeLabel,
    isOngoing,
    totalDaysEvaluated: evalDates.length,
    activeDaysCount,
    totalCompletedCount: totalCompletedRounded,
    totalScheduledCount,
    overallPct,
    overallPctExact,
    missedPctExact,
    bestStreakInMonth,
    scoreLabel,
    summarySubtitle,
    motivationalTitle,
    motivationalMessage,
    weekdayPatternNote,
    calendarCells,
    weekdayBars,
    weeklyScores,
    perHabitStats,
    bestHabit,
    runnerUpHabits,
    weakestHabit,
    otherImproveHabits,
    progressedHabits,
    evolvedHabits,
    topObstacles,
    naturalFlowDays,
    resistanceDays,
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
  };
}

export function formatMonthlyShareText(report: MonthlyReportData): string {
  const lines = [
    `Resumen mensual · ${report.monthTitle} (${report.rangeLabel})`,
    `Score del mes: ${report.overallPct}/100 (${report.scoreLabel})`,
    `Hábitos cumplidos: ${report.totalCompletedCount}/${report.totalScheduledCount} (${report.overallPctExact}%)`,
    `Días activos: ${report.activeDaysCount} · Mejor racha: ${report.bestStreakInMonth} días`,
  ];

  if (report.bestHabit) {
    lines.push(
      `Mejor hábito: ${report.bestHabit.goal.title} (${report.bestHabit.pct}%)`
    );
  }
  if (report.weakestHabit && report.weakestHabit.pct < 100) {
    lines.push(
      `A reforzar: ${report.weakestHabit.goal.title} (${report.weakestHabit.pct}%)`
    );
  }

  return lines.join('\n');
}
