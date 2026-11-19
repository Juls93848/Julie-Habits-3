import {
  DailyQuizResponse,
  DailyReportItem,
  DailyReportSummary,
  GlobalProgressSummary,
  Goal,
  MascotStage,
  MascotTrackId,
} from '../types/tracker';
import {
  getConsecutiveSkipsCount,
  getEnergyLevelLabel,
  getObstacleLabel,
} from './diagnosticEngine';
import { getMascotStage } from './gamification';
import {
  addDays,
  calculateDailyTotalProgress,
  formatQuantity,
  formatShortSpanishDate,
  getDayCompletionStats,
  isDateScheduledForGoal,
  isDateWithinGoal,
} from './paceEngine';

export interface DailyHabitInsight {
  id: string;
  goalId: string;
  tone: 'reward' | 'alert' | 'neutral';
  emoji: string;
  headline: string;
  detail: string;
}

export interface DailyReportAnalytics {
  /** Consecutive days up to dateStr with >= 1 scheduled habit completed */
  globalActiveStreak: number;
  /** Best consecutive active-day streak in the last 60 days */
  bestGlobalStreak: number;
  /** Adherence % across scheduled habits over the last 7 days ending on dateStr */
  adherence7dPct: number;
  adherence7dDone: number;
  adherence7dTotal: number;
  /** Top active habit streak on dateStr */
  bestHabitStreakToday: { title: string; days: number } | null;
  /** Concrete objective insights ordered meaningfully */
  insights: DailyHabitInsight[];
}

export interface MascotDailyContribution {
  currentStage: MascotStage;
  previousStage: MascotStage;
  globalPct: number;
  beforeDayPct: number;
  deltaPct: number;
  evolvedToday: boolean;
  pctToNextStage: number | null;
}

export function calculateHabitCompletedStreak(
  goal: Goal,
  referenceDateStr: string
): number {
  if (referenceDateStr < goal.startDate) return 0;

  let cursor = referenceDateStr;
  let streak = 0;

  for (let i = 0; i < 120 && cursor >= goal.startDate; i++) {
    if (!isDateWithinGoal(goal, cursor) || !isDateScheduledForGoal(goal, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }

    const stats = getDayCompletionStats(goal, cursor);
    if (stats.isDone) {
      streak += 1;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }

  return streak;
}

function getPreviousScheduledGapBeforeCompletion(
  goal: Goal,
  dateStr: string
): number {
  let cursor = addDays(dateStr, -1);
  let missed = 0;
  for (let i = 0; i < 60 && cursor >= goal.startDate; i++) {
    if (!isDateWithinGoal(goal, cursor) || !isDateScheduledForGoal(goal, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    const stats = getDayCompletionStats(goal, cursor);
    if (stats.isDone) break;
    missed += 1;
    cursor = addDays(cursor, -1);
  }
  return missed;
}

function getHabitElapsedAdherence(
  goal: Goal,
  referenceDateStr: string
): { done: number; scheduled: number; pct: number } {
  const end = referenceDateStr <= goal.deadlineDate ? referenceDateStr : goal.deadlineDate;
  if (end < goal.startDate) {
    return { done: 0, scheduled: 0, pct: 0 };
  }

  let cursor = goal.startDate;
  let scheduled = 0;
  let doneEquivalent = 0;
  let guard = 0;

  while (cursor <= end && guard < 366) {
    if (isDateScheduledForGoal(goal, cursor)) {
      scheduled += 1;
      const stats = getDayCompletionStats(goal, cursor);
      doneEquivalent += Math.min(1, stats.value / stats.target);
    }
    cursor = addDays(cursor, 1);
    guard += 1;
  }

  const pct = scheduled > 0 ? Math.round((doneEquivalent / scheduled) * 100) : 0;
  return {
    done: Math.round(doneEquivalent * 10) / 10,
    scheduled,
    pct,
  };
}

export function buildDailyReportAnalytics(
  goals: Goal[],
  dateStr: string,
  dailyQuizLogs: Record<string, DailyQuizResponse> = {}
): DailyReportAnalytics {
  // 1. Global consecutive active-days streak ending on dateStr
  const hasAnyCompletionOnDate = (d: string): boolean => {
    const scheduled = goals.filter((g) => isDateScheduledForGoal(g, d));
    if (scheduled.length === 0) return false;
    return scheduled.some((g) => getDayCompletionStats(g, d).isDone);
  };

  const hasAnyScheduledOnDate = (d: string): boolean =>
    goals.some((g) => isDateScheduledForGoal(g, d));

  let globalActiveStreak = 0;
  {
    let cursor = dateStr;
    for (let i = 0; i < 90; i++) {
      if (!hasAnyScheduledOnDate(cursor)) {
        cursor = addDays(cursor, -1);
        continue;
      }
      if (hasAnyCompletionOnDate(cursor)) {
        globalActiveStreak += 1;
        cursor = addDays(cursor, -1);
      } else {
        break;
      }
    }
  }

  // Best global streak in last 60 days ending on dateStr
  let bestGlobalStreak = globalActiveStreak;
  {
    let running = 0;
    let cursor = addDays(dateStr, -59);
    while (cursor <= dateStr) {
      if (hasAnyScheduledOnDate(cursor)) {
        if (hasAnyCompletionOnDate(cursor)) {
          running += 1;
          if (running > bestGlobalStreak) bestGlobalStreak = running;
        } else {
          running = 0;
        }
      }
      cursor = addDays(cursor, 1);
    }
  }

  // 2. 7-day adherence up to dateStr
  let adherence7dDone = 0;
  let adherence7dTotal = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(dateStr, -i);
    for (const g of goals) {
      if (isDateScheduledForGoal(g, d)) {
        adherence7dTotal += 1;
        if (getDayCompletionStats(g, d).isDone) {
          adherence7dDone += 1;
        }
      }
    }
  }
  const adherence7dPct =
    adherence7dTotal > 0 ? Math.round((adherence7dDone / adherence7dTotal) * 100) : 0;

  // 3. Per-habit concrete insights
  const rewards: DailyHabitInsight[] = [];
  const alerts: DailyHabitInsight[] = [];
  const neutrals: DailyHabitInsight[] = [];

  let bestHabitStreakToday: { title: string; days: number } | null = null;

  for (const goal of goals) {
    if (!isDateWithinGoal(goal, dateStr)) continue;

    const scheduledToday = isDateScheduledForGoal(goal, dateStr);
    const todayStats = getDayCompletionStats(goal, dateStr);
    const streak = calculateHabitCompletedStreak(goal, dateStr);
    const consecutiveMissed = getConsecutiveSkipsCount(goal, dateStr, true);
    const adherence = getHabitElapsedAdherence(goal, dateStr);

    if (
      streak > 0 &&
      (!bestHabitStreakToday || streak > bestHabitStreakToday.days)
    ) {
      bestHabitStreakToday = { title: goal.title, days: streak };
    }

    if (scheduledToday && todayStats.isDone) {
      const prevGap = getPreviousScheduledGapBeforeCompletion(goal, dateStr);
      if (streak >= 2) {
        rewards.push({
          id: `streak-${goal.id}`,
          goalId: goal.id,
          tone: 'reward',
          emoji: streak >= 5 ? '🏆' : '🔥',
          headline: `Felicidades, llevas ${streak} días de racha en ${goal.title}.`,
          detail: `Adherencia acumulada: ${formatQuantity(adherence.done)} de ${adherence.scheduled} días (${adherence.pct}%).`,
        });
      } else if (prevGap >= 2) {
        rewards.push({
          id: `comeback-${goal.id}`,
          goalId: goal.id,
          tone: 'reward',
          emoji: '✨',
          headline: `Retomaste ${goal.title} tras ${prevGap} días de pausa.`,
          detail: `Hoy sumaste ${
            goal.trackingMode === 'boolean'
              ? '1 sesión'
              : `${formatQuantity(todayStats.value)}/${formatQuantity(todayStats.target)}`
          }. Adherencia total: ${adherence.pct}%.`,
        });
      } else if (adherence.scheduled >= 3 && adherence.pct >= 75) {
        rewards.push({
          id: `adherence-${goal.id}`,
          goalId: goal.id,
          tone: 'reward',
          emoji: '🎯',
          headline: `${goal.title}: ${adherence.pct}% de adherencia constante.`,
          detail: `Llevas ${formatQuantity(adherence.done)} de ${adherence.scheduled} días cumplidos.`,
        });
      }
      continue;
    }

    // Missed or inactive habit (2+ consecutive scheduled days without completion)
    if (consecutiveMissed >= 2) {
      // Find latest quiz/energy context from individual log or general day log
      let contextNote = `Adherencia acumulada: ${formatQuantity(adherence.done)} de ${adherence.scheduled} días (${adherence.pct}%).`;
      const recentQuiz =
        goal.quizLogs?.[dateStr] ||
        goal.quizLogs?.[addDays(dateStr, -1)] ||
        dailyQuizLogs[dateStr] ||
        dailyQuizLogs[addDays(dateStr, -1)];

      if (recentQuiz && (recentQuiz.obstacle || recentQuiz.energyLevel)) {
        const parts: string[] = [];
        if (recentQuiz.obstacle) {
          parts.push(getObstacleLabel(recentQuiz.obstacle));
        }
        if (recentQuiz.energyLevel) {
          parts.push(getEnergyLevelLabel(recentQuiz.energyLevel));
        }
        contextNote = `Último registro: ${parts.join(' · ')}.`;
      }

      alerts.push({
        id: `missed-${goal.id}`,
        goalId: goal.id,
        tone: 'alert',
        emoji: '📌',
        headline: `Llevas ${consecutiveMissed} días sin ${goal.title}.`,
        detail: contextNote,
      });
      continue;
    }

    // Single day partial or first missed day
    if (scheduledToday && !todayStats.isDone && adherence.scheduled >= 2) {
      if (todayStats.value > 0) {
        neutrals.push({
          id: `partial-${goal.id}`,
          goalId: goal.id,
          tone: 'neutral',
          emoji: '⏳',
          headline: `${goal.title} quedó al ${todayStats.pct}% hoy (${formatQuantity(todayStats.value)}/${formatQuantity(todayStats.target)}).`,
          detail: `Adherencia acumulada: ${adherence.pct}% (${formatQuantity(adherence.done)}/${adherence.scheduled} días).`,
        });
      } else if (streak > 0) {
        neutrals.push({
          id: `hold-${goal.id}`,
          goalId: goal.id,
          tone: 'neutral',
          emoji: '⚡',
          headline: `${goal.title} aún está pendiente hoy.`,
          detail: `Venías con ${streak} ${streak === 1 ? 'día cumplido' : 'días seguidos'} (${adherence.pct}% adherencia).`,
        });
      }
    }
  }

  return {
    globalActiveStreak,
    bestGlobalStreak,
    adherence7dPct,
    adherence7dDone,
    adherence7dTotal,
    bestHabitStreakToday,
    insights: [...rewards, ...alerts, ...neutrals],
  };
}

export function calculateMascotDailyContribution(
  goals: Goal[],
  dateStr: string,
  trackId: MascotTrackId,
  globalProgress: GlobalProgressSummary
): MascotDailyContribution {
  let dayCompletedEquivalent = 0;
  for (const goal of goals) {
    if (!isDateWithinGoal(goal, dateStr)) continue;
    const stats = getDayCompletionStats(goal, dateStr);
    dayCompletedEquivalent += Math.min(1, stats.value / stats.target);
  }

  const globalPct = globalProgress.actualPct;
  const deltaRaw =
    globalProgress.totalUnits > 0
      ? (dayCompletedEquivalent / globalProgress.totalUnits) * 100
      : 0;
  const beforeDayPct = Math.max(0, globalPct - deltaRaw);

  const currentStage = getMascotStage(trackId, globalPct);
  const previousStage = getMascotStage(trackId, beforeDayPct);

  const pctToNextStage =
    currentStage.nextMinPct !== null
      ? Math.max(0, Math.ceil((currentStage.nextMinPct - globalPct) * 10) / 10)
      : null;

  return {
    currentStage,
    previousStage,
    globalPct,
    beforeDayPct,
    deltaPct: Math.round(deltaRaw * 10) / 10,
    evolvedToday: currentStage.index > previousStage.index,
    pctToNextStage,
  };
}

export function buildDailyReport(
  goals: Goal[],
  dateStr: string,
  dailyNotes: Record<string, string> = {},
  dailyQuizLogs: Record<string, DailyQuizResponse> = {}
): DailyReportSummary {
  const scheduled = goals.filter((g) => isDateScheduledForGoal(g, dateStr));
  const dailyTotal = calculateDailyTotalProgress(goals, dateStr);
  const dailyNote = dailyNotes[dateStr]?.trim() || undefined;
  const dailyQuiz = dailyQuizLogs[dateStr];

  const completed: DailyReportItem[] = [];
  const partial: DailyReportItem[] = [];
  const missed: DailyReportItem[] = [];

  for (const goal of scheduled) {
    const stats = getDayCompletionStats(goal, dateStr);
    const note = goal.notes?.[dateStr]?.trim() || undefined;
    const item: DailyReportItem = {
      goal,
      value: stats.value,
      target: stats.target,
      pct: stats.pct,
      isDone: stats.isDone,
      note,
    };

    if (stats.isDone) {
      completed.push(item);
    } else if (stats.value > 0) {
      partial.push(item);
    } else {
      missed.push(item);
    }
  }

  let notificationTitle = `Reporte del día · ${formatShortSpanishDate(dateStr)}`;
  if (scheduled.length === 0) {
    notificationTitle = `Reporte del ${formatShortSpanishDate(dateStr)} · Día libre`;
  } else if (completed.length === scheduled.length) {
    notificationTitle = `¡Día completado al 100%! · ${formatShortSpanishDate(dateStr)}`;
  } else {
    notificationTitle = `Reporte del día · ${dailyTotal.pct}% (${completed.length}/${scheduled.length})`;
  }

  const lines: string[] = [];
  if (scheduled.length === 0) {
    lines.push('No tuviste hábitos programados para hoy.');
  } else {
    if (completed.length > 0) {
      lines.push(`Cumpliste con: ${completed.map((i) => i.goal.title).join(', ')}.`);
    }
    if (partial.length > 0) {
      lines.push(
        `Avance parcial: ${partial
          .map((i) => `${i.goal.title} (${formatQuantity(i.value)}/${formatQuantity(i.target)})`)
          .join(', ')}.`
      );
    }
    if (missed.length > 0) {
      lines.push(`No cumpliste con: ${missed.map((i) => i.goal.title).join(', ')}.`);
    }
  }

  return {
    dateStr,
    totalPct: dailyTotal.pct,
    completedCount: completed.length,
    totalCount: scheduled.length,
    completed,
    partial,
    missed,
    dailyNote,
    dailyQuiz,
    notificationTitle,
    notificationBody: lines.join('\n'),
  };
}

export function formatShareableReportText(report: DailyReportSummary): string {
  const parts: string[] = [
    `${report.notificationTitle}`,
    '────────────────────────',
  ];

  if (report.totalCount === 0) {
    parts.push('No hubo hábitos programados en esta fecha.');
    return parts.join('\n');
  }

  if (report.completed.length > 0) {
    parts.push('✅ Cumpliste con:');
    for (const item of report.completed) {
      const qty =
        item.goal.trackingMode === 'boolean'
          ? ''
          : ` (${formatQuantity(item.value)}/${formatQuantity(item.target)}${
              item.goal.trackingMode === 'measure' && item.goal.unit
                ? ` ${item.goal.unit}`
                : ''
            })`;
      parts.push(`  • ${item.goal.title}${qty}`);
    }
  }

  if (report.partial.length > 0) {
    parts.push('⏳ Avance parcial:');
    for (const item of report.partial) {
      parts.push(
        `  • ${item.goal.title} (${formatQuantity(item.value)}/${formatQuantity(item.target)}${
          item.goal.trackingMode === 'measure' && item.goal.unit
            ? ` ${item.goal.unit}`
            : ''
        })`
      );
    }
  }

  if (report.missed.length > 0) {
    parts.push('❌ No cumpliste con:');
    for (const item of report.missed) {
      parts.push(`  • ${item.goal.title}`);
    }
  }

  if (report.dailyNote) {
    parts.push('');
    parts.push(`📝 Notas del día: ${report.dailyNote}`);
  }

  return parts.join('\n');
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function sendBrowserNotification(report: DailyReportSummary): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }
  try {
    new Notification(report.notificationTitle, {
      body: report.notificationBody,
      tag: `ritmo-daily-report-${report.dateStr}`,
    });
    return true;
  } catch {
    return false;
  }
}
