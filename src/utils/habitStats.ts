import { Goal } from '../types/tracker';
import {
  addDays,
  diffDays,
  formatQuantity,
  formatShortSpanishDate,
  getDayCompletionStats,
  getGoalOriginDateStr,
  getMondayOfWeek,
  isDateScheduledForGoal,
  parseLocalDate,
  toLocalDateStr,
} from './paceEngine';

export interface PeriodCounts {
  week: number;
  month: number;
  year: number;
  allTime: number;
}

export interface MonthlyDailyBar {
  day: number;
  dateStr: string;
  value: number;
  isDone: boolean;
  isPartial: boolean;
  isScheduled: boolean;
  isFuture: boolean;
}

export interface PeriodBarItem {
  key: string;
  label: string;
  fullLabel: string;
  totalValue: number;
  avgValue: number;
  achievedCount: number;
  elapsedDays: number;
}

export interface HabitDetailedStats {
  score: number;
  currentStreak: number;
  bestStreak: number;
  totals: PeriodCounts;
  achieved: PeriodCounts;
  donutAchieved: number;
  donutFailed: number;
  scheduledUpToToday: number;
}

export const STREAK_MILESTONES = [1, 7, 15, 30, 60, 100];

const MONTH_ABBR_LOWER = [
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

function isDateActiveAndScheduled(goal: Goal, dateStr: string): boolean {
  const origin = getGoalOriginDateStr(goal);
  if (dateStr < origin) return false;
  if (!goal.isPermanent && dateStr > goal.deadlineDate) return false;

  const freqType = goal.frequency?.type || 'everyday';
  if (freqType === 'everyday') return true;
  if (freqType === 'specific_days') {
    const weekdays =
      goal.frequency?.weekdays && goal.frequency.weekdays.length > 0
        ? goal.frequency.weekdays
        : [1, 2, 3, 4, 5];
    return weekdays.includes(parseLocalDate(dateStr).getDay());
  }
  if (freqType === 'every_n_days') {
    const interval = Math.max(2, goal.frequency?.intervalDays || 2);
    const delta = diffDays(origin, dateStr);
    return delta >= 0 && delta % interval === 0;
  }
  // Flexible frequency: check scheduled via paceEngine when within current cycle,
  // or count days with activity / general days
  return isDateScheduledForGoal(goal, dateStr);
}

export function computeHabitDetailedStats(
  goal: Goal,
  now: Date = new Date()
): HabitDetailedStats {
  const todayStr = toLocalDateStr(now);
  const origin = getGoalOriginDateStr(goal);
  const weekMonday = getMondayOfWeek(todayStr);
  const monthPrefix = todayStr.slice(0, 7);
  const yearPrefix = todayStr.slice(0, 4);

  const totals: PeriodCounts = { week: 0, month: 0, year: 0, allTime: 0 };
  const achieved: PeriodCounts = { week: 0, month: 0, year: 0, allTime: 0 };

  // Collect all unique dates from completions and from origin..todayStr
  const allDatesSet = new Set<string>(Object.keys(goal.completions || {}));
  let cursor = origin;
  let guard = 0;
  const endHorizon =
    !goal.isPermanent && goal.deadlineDate < todayStr
      ? goal.deadlineDate
      : todayStr;

  while (cursor <= endHorizon && guard < 1200) {
    allDatesSet.add(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }

  for (const dStr of allDatesSet) {
    const stats = getDayCompletionStats(goal, dStr);
    if (stats.value > 0) {
      totals.allTime += stats.value;
      if (dStr.startsWith(yearPrefix)) totals.year += stats.value;
      if (dStr.startsWith(monthPrefix)) totals.month += stats.value;
      if (dStr >= weekMonday && dStr <= addDays(weekMonday, 6)) {
        totals.week += stats.value;
      }
    }
    if (stats.isDone) {
      achieved.allTime += 1;
      if (dStr.startsWith(yearPrefix)) achieved.year += 1;
      if (dStr.startsWith(monthPrefix)) achieved.month += 1;
      if (dStr >= weekMonday && dStr <= addDays(weekMonday, 6)) {
        achieved.week += 1;
      }
    }
  }

  totals.week = Math.round(totals.week * 100) / 100;
  totals.month = Math.round(totals.month * 100) / 100;
  totals.year = Math.round(totals.year * 100) / 100;
  totals.allTime = Math.round(totals.allTime * 100) / 100;

  // Streaks & Logrado / Fallido across origin..endHorizon
  let scheduledUpToToday = 0;
  let completedEquivUpToToday = 0;
  let donutAchieved = 0;
  let donutFailed = 0;

  let runningStreak = 0;
  let bestStreak = 0;
  const scheduledDaysList: Array<{ dateStr: string; isDone: boolean }> = [];

  if (origin <= endHorizon) {
    let day = origin;
    let dayGuard = 0;
    const freqType = goal.frequency?.type || 'everyday';
    const isFlexible =
      freqType === 'times_per_week' || freqType === 'times_per_month';

    while (day <= endHorizon && dayGuard < 1200) {
      const stats = getDayCompletionStats(goal, day);
      const scheduled = isFlexible ? false : isDateActiveAndScheduled(goal, day);

      if (scheduled) {
        scheduledUpToToday += 1;
        completedEquivUpToToday += Math.min(1, stats.value / stats.target);

        if (stats.isDone) {
          donutAchieved += 1;
          runningStreak += 1;
          if (runningStreak > bestStreak) bestStreak = runningStreak;
          scheduledDaysList.push({ dateStr: day, isDone: true });
        } else {
          // Today isn't counted as failed yet if day isn't over, unless skipped
          if (day < todayStr || goal.skipped?.[day]) {
            donutFailed += 1;
          }
          if (day < todayStr || goal.skipped?.[day]) {
            runningStreak = 0;
          }
          scheduledDaysList.push({ dateStr: day, isDone: false });
        }
      } else if (stats.isDone) {
        // Make-up / flexible completion counts toward totals, donutAchieved & streak!
        donutAchieved += 1;
        if (isFlexible) {
          scheduledUpToToday += 1;
          completedEquivUpToToday += 1;
        } else {
          completedEquivUpToToday += 1;
        }
        runningStreak += 1;
        if (runningStreak > bestStreak) bestStreak = runningStreak;
        scheduledDaysList.push({ dateStr: day, isDone: true });
      } else if (isFlexible) {
        // For flexible goals, track completed vs weekly/monthly pace cleanly
        if (day < todayStr && goal.skipped?.[day]) {
          donutFailed += 1;
          runningStreak = 0;
        }
      }

      day = addDays(day, 1);
      dayGuard += 1;
    }
  }

  // Current streak: walk backwards from end of scheduledDaysList;
  // allow today to still be open (pending) without breaking yesterday's streak
  let currentStreak = 0;
  for (let i = scheduledDaysList.length - 1; i >= 0; i--) {
    const item = scheduledDaysList[i];
    if (item.isDone) {
      currentStreak += 1;
    } else if (item.dateStr === todayStr && !goal.skipped?.[todayStr]) {
      continue;
    } else {
      break;
    }
  }

  if (currentStreak > bestStreak) {
    bestStreak = currentStreak;
  }

  // Score (0-100)
  let score = 0;
  if (scheduledUpToToday > 0) {
    score = Math.min(
      100,
      Math.max(0, Math.round((completedEquivUpToToday / scheduledUpToToday) * 100))
    );
  } else if (achieved.allTime > 0) {
    score = 100;
  }

  return {
    score,
    currentStreak,
    bestStreak,
    totals,
    achieved,
    donutAchieved,
    donutFailed,
    scheduledUpToToday,
  };
}

export function getMonthlyDailyBars(
  goal: Goal,
  year: number,
  month: number,
  todayStr: string
): MonthlyDailyBar[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const origin = getGoalOriginDateStr(goal);
  const bars: MonthlyDailyBar[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dt = new Date(year, month, day);
    const dateStr = toLocalDateStr(dt);
    const stats = getDayCompletionStats(goal, dateStr);
    const isFuture = dateStr > todayStr;
    const inRange =
      dateStr >= origin && (goal.isPermanent || dateStr <= goal.deadlineDate);

    bars.push({
      day,
      dateStr,
      value: stats.value,
      isDone: stats.isDone,
      isPartial: stats.value > 0 && !stats.isDone,
      isScheduled: inRange && isDateActiveAndScheduled(goal, dateStr),
      isFuture,
    });
  }

  return bars;
}

export function getHabitPeriodBars(
  goal: Goal,
  granularity: 'week' | 'month' | 'year',
  cursorYear: number,
  todayStr: string
): {
  title: string;
  totalForPeriod: number;
  bars: PeriodBarItem[];
} {
  const origin = getGoalOriginDateStr(goal);

  if (granularity === 'week') {
    // Last 8 weeks ending on current week (or Dec 31 of cursorYear if cursorYear < currentYear)
    const todayYear = Number(todayStr.slice(0, 4));
    const anchorDate =
      cursorYear < todayYear
        ? `${cursorYear}-12-28`
        : cursorYear > todayYear
        ? `${cursorYear}-02-15`
        : todayStr;
    const anchorMon = getMondayOfWeek(anchorDate);
    const numWeeks = 8;
    const startMon = addDays(anchorMon, -7 * (numWeeks - 1));
    const bars: PeriodBarItem[] = [];
    let totalForPeriod = 0;

    for (let w = 0; w < numWeeks; w++) {
      const wStart = addDays(startMon, w * 7);
      const wEnd = addDays(wStart, 6);
      let sumVal = 0;
      let achievedCount = 0;
      let elapsedDays = 0;

      for (let d = 0; d < 7; d++) {
        const dStr = addDays(wStart, d);
        const stats = getDayCompletionStats(goal, dStr);
        if (stats.value > 0) sumVal += stats.value;
        if (stats.isDone) achievedCount += 1;
        if (dStr <= todayStr && dStr >= origin) elapsedDays += 1;
      }

      sumVal = Math.round(sumVal * 100) / 100;
      totalForPeriod += sumVal;
      const dt = parseLocalDate(wStart);
      const label = `${dt.getDate()} ${MONTH_ABBR_LOWER[dt.getMonth()]}`;

      bars.push({
        key: wStart,
        label,
        fullLabel: `${formatShortSpanishDate(wStart)} – ${formatShortSpanishDate(wEnd)}`,
        totalValue: sumVal,
        avgValue:
          elapsedDays > 0 ? Math.round((sumVal / elapsedDays) * 10) / 10 : 0,
        achievedCount,
        elapsedDays,
      });
    }

    return {
      title: `Últimas ${numWeeks} semanas`,
      totalForPeriod: Math.round(totalForPeriod * 100) / 100,
      bars,
    };
  }

  if (granularity === 'year') {
    const startYear = Math.min(cursorYear - 4, Number(origin.slice(0, 4)));
    const endYear = Math.max(cursorYear, startYear + 4);
    const years: number[] = [];
    for (let y = endYear - 4; y <= endYear; y++) {
      years.push(y);
    }

    let totalForPeriod = 0;
    const bars: PeriodBarItem[] = years.map((y) => {
      const prefix = String(y);
      let sumVal = 0;
      let achievedCount = 0;
      for (const [dStr, rawVal] of Object.entries(goal.completions || {})) {
        if (!dStr.startsWith(prefix)) continue;
        const val = Math.max(0, Number(rawVal || 0));
        if (val > 0) {
          sumVal += val;
          const stats = getDayCompletionStats(goal, dStr);
          if (stats.isDone) achievedCount += 1;
        }
      }
      const yearStart = `${y}-01-01`;
      const yearEnd = `${y}-12-31`;
      const effectiveStart = origin > yearStart ? origin : yearStart;
      const effectiveEnd = todayStr < yearEnd ? todayStr : yearEnd;
      const elapsedDays =
        effectiveStart <= effectiveEnd
          ? diffDays(effectiveStart, effectiveEnd) + 1
          : 0;

      sumVal = Math.round(sumVal * 100) / 100;
      totalForPeriod += sumVal;

      return {
        key: prefix,
        label: prefix,
        fullLabel: `Año ${prefix}`,
        totalValue: sumVal,
        avgValue:
          elapsedDays > 0 ? Math.round((sumVal / elapsedDays) * 10) / 10 : 0,
        achievedCount,
        elapsedDays,
      };
    });

    return {
      title: `${years[0]} – ${years[years.length - 1]}`,
      totalForPeriod: Math.round(totalForPeriod * 100) / 100,
      bars,
    };
  }

  // 'month': 12 months ene..dic for cursorYear
  let totalForPeriod = 0;
  const bars: PeriodBarItem[] = MONTH_ABBR_LOWER.map((lbl, monthIdx) => {
    const prefix = `${cursorYear}-${String(monthIdx + 1).padStart(2, '0')}`;
    const daysInMonth = new Date(cursorYear, monthIdx + 1, 0).getDate();
    let sumVal = 0;
    let achievedCount = 0;

    for (const [dStr, rawVal] of Object.entries(goal.completions || {})) {
      if (!dStr.startsWith(prefix)) continue;
      const val = Math.max(0, Number(rawVal || 0));
      if (val > 0) {
        sumVal += val;
        if (getDayCompletionStats(goal, dStr).isDone) achievedCount += 1;
      }
    }

    const mStart = `${prefix}-01`;
    const mEnd = `${prefix}-${String(daysInMonth).padStart(2, '0')}`;
    const effectiveStart = origin > mStart ? origin : mStart;
    const effectiveEnd = todayStr < mEnd ? todayStr : mEnd;
    const elapsedDays =
      effectiveStart <= effectiveEnd
        ? diffDays(effectiveStart, effectiveEnd) + 1
        : 0;

    sumVal = Math.round(sumVal * 100) / 100;
    totalForPeriod += sumVal;

    return {
      key: prefix,
      label: lbl,
      fullLabel: `${lbl} ${cursorYear}`,
      totalValue: sumVal,
      avgValue:
        elapsedDays > 0 ? Math.round((sumVal / elapsedDays) * 10) / 10 : 0,
      achievedCount,
      elapsedDays,
    };
  });

  return {
    title: String(cursorYear),
    totalForPeriod: Math.round(totalForPeriod * 100) / 100,
    bars,
  };
}

export function formatStatValue(val: number): string {
  return formatQuantity(Math.round(val * 100) / 100);
}
