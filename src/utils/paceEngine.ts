import {
  DailyTotalSummary,
  GlobalProgressSummary,
  Goal,
  GoalProgressSummary,
  HabitFrequency,
  HabitPhaseOutcome,
  HabitPhaseRecord,
  PaceStatus,
} from '../types/tracker';

const ACTIVE_START_HOUR = 8; // 8:00 AM
const ACTIVE_END_HOUR = 22; // 10:00 PM
const HOURS_PER_DAY = ACTIVE_END_HOUR - ACTIVE_START_HOUR;

export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function addDays(dateStr: string, delta: number): string {
  const dt = parseLocalDate(dateStr);
  dt.setDate(dt.getDate() + delta);
  return toLocalDateStr(dt);
}

export function diffDays(startStr: string, endStr: string): number {
  const s = parseLocalDate(startStr).getTime();
  const e = parseLocalDate(endStr).getTime();
  return Math.round((e - s) / 86400000);
}

export function getMondayOfWeek(dateStr: string): string {
  const dt = parseLocalDate(dateStr);
  const day = dt.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diffToMonday);
  return toLocalDateStr(dt);
}

export function enumerateDates(startDateStr: string, deadlineDateStr: string): string[] {
  const start = parseLocalDate(startDateStr);
  const end = parseLocalDate(deadlineDateStr);
  if (end.getTime() < start.getTime()) {
    return [startDateStr];
  }
  const dates: string[] = [];
  const cursor = new Date(start);
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 366) {
    dates.push(toLocalDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return dates;
}

export function formatShortSpanishDate(dateStr: string): string {
  const dt = parseLocalDate(dateStr);
  return dt.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  });
}

export function formatUpperSpanishDate(dateStr: string): string {
  const dt = parseLocalDate(dateStr);
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  return `${dt.getDate()} ${months[dt.getMonth()]}`;
}

export function getSpanishWeekday2(dateStr: string): string {
  const dt = parseLocalDate(dateStr);
  const names = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
  return names[dt.getDay()];
}

export function getSpanishWeekdayShort(dateStr: string): string {
  const dt = parseLocalDate(dateStr);
  const names = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return names[dt.getDay()];
}

export function isDateWithinGoal(goal: Goal, dateStr: string): boolean {
  return dateStr >= goal.startDate && dateStr <= goal.deadlineDate;
}

export function isDateScheduledForGoal(goal: Goal, dateStr: string): boolean {
  if (!isDateWithinGoal(goal, dateStr)) return false;
  const freq = goal.frequency || { type: 'everyday' };

  if (freq.type === 'specific_days') {
    const weekdays = freq.weekdays && freq.weekdays.length > 0 ? freq.weekdays : [1, 2, 3, 4, 5];
    const dayOfWeek = parseLocalDate(dateStr).getDay();
    return weekdays.includes(dayOfWeek);
  }

  if (freq.type === 'every_n_days') {
    const interval = Math.max(2, freq.intervalDays || 2);
    const delta = diffDays(goal.startDate, dateStr);
    return delta >= 0 && delta % interval === 0;
  }

  return true;
}

export function formatFrequencySummary(freq?: HabitFrequency): string {
  if (!freq || freq.type === 'everyday') return 'Todos los días';
  if (freq.type === 'specific_days') {
    const labels: Record<number, string> = {
      1: 'L',
      2: 'M',
      3: 'X',
      4: 'J',
      5: 'V',
      6: 'S',
      0: 'D',
    };
    const order = [1, 2, 3, 4, 5, 6, 0];
    const active = order.filter((d) => (freq.weekdays || []).includes(d));
    return active.length > 0
      ? `Días: ${active.map((d) => labels[d]).join(', ')}`
      : 'Días concretos';
  }
  if (freq.type === 'times_per_week') {
    const n = freq.count || 3;
    return `${n} ${n === 1 ? 'vez' : 'veces'} por semana`;
  }
  if (freq.type === 'times_per_month') {
    const n = freq.count || 10;
    return `${n} ${n === 1 ? 'vez' : 'veces'} al mes`;
  }
  if (freq.type === 'every_n_days') {
    const n = freq.intervalDays || 2;
    return `Cada ${n} días`;
  }
  return 'Todos los días';
}

export function getEffectiveTarget(goal: Goal): number {
  if (goal.trackingMode === 'boolean') return 1;
  return Math.max(0.1, Number(goal.dailyTarget) || 1);
}

export function getDayCompletionStats(goal: Goal, dateStr: string): {
  value: number;
  target: number;
  pct: number;
  isDone: boolean;
} {
  const target = getEffectiveTarget(goal);
  const raw = Number(goal.completions[dateStr] || 0);
  const value = Math.max(0, raw);
  const ratio = Math.min(1, value / target);
  const pct = Math.round(ratio * 100);
  return {
    value,
    target,
    pct,
    isDone: value >= target,
  };
}

export function formatQuantity(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, '');
}

export function getGoalCreationDateStr(goal: Goal): string {
  if (goal.createdAt) {
    const dt = new Date(goal.createdAt);
    if (!Number.isNaN(dt.getTime())) {
      return toLocalDateStr(dt);
    }
  }
  return goal.startDate;
}

export function getGoalOriginDateStr(goal: Goal): string {
  const firstPhaseStart = goal.phaseHistory?.[0]?.startDate;
  if (firstPhaseStart && firstPhaseStart < goal.startDate) {
    return firstPhaseStart;
  }
  return goal.startDate;
}

export function calculateGoalProgress(
  goal: Goal,
  now: Date = new Date()
): GoalProgressSummary {
  const dates = enumerateDates(goal.startDate, goal.deadlineDate);
  const totalDays = dates.length;
  const freq = goal.frequency || { type: 'everyday' };
  const target = getEffectiveTarget(goal);

  let scheduledDaysCount = totalDays;
  if (freq.type === 'specific_days' || freq.type === 'every_n_days') {
    scheduledDaysCount = Math.max(
      1,
      dates.filter((d) => isDateScheduledForGoal(goal, d)).length
    );
  } else if (freq.type === 'times_per_week') {
    const perWeek = Math.max(1, Math.min(7, freq.count || 3));
    scheduledDaysCount = Math.max(1, Math.round((totalDays / 7) * perWeek));
  } else if (freq.type === 'times_per_month') {
    const perMonth = Math.max(1, Math.min(31, freq.count || 10));
    scheduledDaysCount = Math.max(1, Math.round((totalDays / 30) * perMonth));
  }

  let completedDaysEquivalent = 0;
  for (const dStr of dates) {
    const val = Math.max(0, Number(goal.completions[dStr] || 0));
    completedDaysEquivalent += Math.min(1, val / target);
  }

  const totalEffectiveHours = totalDays * HOURS_PER_DAY;
  const todayStr = toLocalDateStr(now);
  const currentDecimalHour =
    now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const isBeforeStart = todayStr < goal.startDate;
  const isAfterDeadline = todayStr > goal.deadlineDate;

  let elapsedEffectiveHours = 0;
  if (isBeforeStart) {
    elapsedEffectiveHours = 0;
  } else if (isAfterDeadline) {
    elapsedEffectiveHours = totalEffectiveHours;
  } else {
    for (const dStr of dates) {
      if (dStr < todayStr) {
        elapsedEffectiveHours += HOURS_PER_DAY;
      } else if (dStr === todayStr) {
        elapsedEffectiveHours += Math.max(
          0,
          Math.min(HOURS_PER_DAY, currentDecimalHour - ACTIVE_START_HOUR)
        );
        break;
      }
    }
  }

  const daysRemaining = isAfterDeadline
    ? 0
    : isBeforeStart
    ? totalDays
    : Math.max(0, dates.filter((d) => d >= todayStr).length);

  const expectedPct =
    totalEffectiveHours > 0
      ? Math.min(100, Math.max(0, (elapsedEffectiveHours / totalEffectiveHours) * 100))
      : 0;

  const actualPct =
    scheduledDaysCount > 0
      ? Math.min(100, Math.max(0, (completedDaysEquivalent / scheduledDaysCount) * 100))
      : 0;

  const diffPct = actualPct - expectedPct;

  let status: PaceStatus = 'ontrack';
  if (diffPct > 5) {
    status = 'ahead';
  } else if (diffPct < -5) {
    status = 'behind';
  }

  return {
    actualPct,
    expectedPct,
    diffPct,
    status,
    completedDaysEquivalent,
    totalScheduledDays: scheduledDaysCount,
    totalDays,
    daysRemaining,
    isBeforeStart,
    isAfterDeadline,
  };
}

export function getPaceLabel(status: PaceStatus): string {
  if (status === 'ahead') return '🟢 Adelantada';
  if (status === 'behind') return '🔴 Atrasada';
  return '🔵 Al corriente';
}

export function calculateGlobalProgress(
  goals: Goal[],
  now: Date = new Date()
): GlobalProgressSummary {
  if (goals.length === 0) {
    return { actualPct: 0, completedUnits: 0, totalUnits: 0, activeGoalsCount: 0 };
  }
  let completedUnits = 0;
  let totalUnits = 0;
  for (const goal of goals) {
    const progress = calculateGoalProgress(goal, now);
    completedUnits += Math.round(progress.completedDaysEquivalent * 10) / 10;
    totalUnits += progress.totalScheduledDays;
  }
  const actualPct =
    totalUnits > 0 ? Math.min(100, Math.max(0, (completedUnits / totalUnits) * 100)) : 0;

  return {
    actualPct,
    completedUnits: Math.round(completedUnits),
    totalUnits,
    activeGoalsCount: goals.length,
  };
}

export function calculateDailyTotalProgress(
  goals: Goal[],
  dateStr: string
): DailyTotalSummary {
  const active = goals.filter((g) => isDateScheduledForGoal(g, dateStr));
  if (active.length === 0) {
    return { pct: 0, completedHabits: 0, totalHabits: 0 };
  }
  let sumRatios = 0;
  let completedHabits = 0;
  for (const g of active) {
    const stats = getDayCompletionStats(g, dateStr);
    sumRatios += Math.min(1, stats.value / stats.target);
    if (stats.isDone) completedHabits++;
  }
  const pct = Math.round((sumRatios / active.length) * 100);
  return { pct, completedHabits, totalHabits: active.length };
}

export function buildPhaseRecordFromGoal(
  goal: Goal,
  outcome: HabitPhaseOutcome,
  endedAtDateStr?: string
): HabitPhaseRecord {
  const progress = calculateGoalProgress(goal);
  return {
    id: `phase-${goal.phaseNumber || 1}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}`,
    phaseNumber: goal.phaseNumber || 1,
    title: goal.title,
    frequencySummary: formatFrequencySummary(goal.frequency),
    startDate: goal.startDate,
    deadlineDate: goal.deadlineDate,
    completedDays: Math.round(progress.completedDaysEquivalent),
    scheduledDays: progress.totalScheduledDays,
    pct: Math.round(progress.actualPct),
    outcome,
    endedAt: endedAtDateStr || goal.deadlineDate,
  };
}

export function getPermanentCycleDays(goal?: Partial<Goal> | null): number {
  const raw = Number(goal?.permanentCycleDays);
  if (!Number.isFinite(raw) || raw < 1) return 30;
  return Math.min(365, Math.round(raw));
}

export function formatPermanentCycleLabel(days: number): string {
  const d = Math.max(1, Math.min(365, Math.round(days)));
  if (d === 1) return 'Diario (1 día)';
  if (d === 7) return 'Semanal (7 días)';
  if (d === 14) return 'Quincenal (14 días)';
  if (d === 15) return 'Quincenal (15 días)';
  if (d === 30) return 'Mensual (30 días)';
  if (d === 90) return 'Trimestral (90 días)';
  return `Cada ${d} días`;
}

export function formatShortPermanentCycleLabel(days: number): string {
  const d = Math.max(1, Math.min(365, Math.round(days)));
  if (d === 1) return 'Ciclo diario';
  if (d === 7) return 'Ciclo semanal';
  if (d === 14) return 'Ciclo quincenal (14d)';
  if (d === 15) return 'Ciclo quincenal (15d)';
  if (d === 30) return 'Ciclo mensual';
  if (d === 90) return 'Ciclo trimestral';
  return `Ciclo de ${d} días`;
}

export function renewPermanentGoalCycleIfNeeded(
  goal: Goal,
  todayStr: string
): Goal {
  if (!goal.isPermanent || goal.isArchived || todayStr <= goal.deadlineDate) {
    return goal;
  }

  const cycleDays = getPermanentCycleDays(goal);
  let current = goal;
  let guard = 0;

  while (current.deadlineDate < todayStr && guard < 400) {
    const snapshot = buildPhaseRecordFromGoal(
      current,
      'cycle_renewed',
      current.deadlineDate
    );
    const nextStart = addDays(current.deadlineDate, 1);
    const nextDeadline = addDays(nextStart, cycleDays - 1);

    current = {
      ...current,
      startDate: nextStart,
      deadlineDate: nextDeadline,
      phaseHistory: [...(current.phaseHistory || []), snapshot],
    };
    guard += 1;
  }

  return current;
}

export function isPhaseCompletedPromptNeeded(
  goal: Goal,
  todayStr: string
): boolean {
  if (goal.isArchived || goal.isPermanent) return false;
  if (todayStr > goal.deadlineDate) return true;
  if (todayStr === goal.deadlineDate) {
    const stats = getDayCompletionStats(goal, todayStr);
    if (stats.isDone) return true;
  }
  return false;
}
