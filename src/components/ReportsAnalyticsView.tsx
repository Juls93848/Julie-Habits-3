import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Layers,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { GlobalHabitTrendCard } from './GlobalHabitTrendCard';
import {
  HabitDetailedStatsContent,
  HabitDetailedStatsModal,
} from './HabitDetailedStatsModal';
import {
  AnalysisVisibilitySettings,
  AppSettings,
  DailyQuizResponse,
  GlobalProgressSummary,
  Goal,
  QuizBreakPoint,
  QuizFrictionTag,
  QuizObstacle,
  WeeklyStatsMode,
} from '../types/tracker';
import { getGoalPalette, GoalIconBadge, hexToRgba } from '../utils/colorAndIcons';
import { buildDailyReport, buildDailyReportAnalytics } from '../utils/dailyReport';
import {
  getBreakPointLabel,
  getEnergyLevelLabel,
  getFrictionTagLabel,
  getObstacleLabel,
  getReactionLabel,
} from '../utils/diagnosticEngine';
import {
  buildMonthlyReport,
  getMonthKey,
  getNextMonth,
  getPreviousMonth,
} from '../utils/monthlyReport';
import {
  addDays,
  calculateGoalProgress,
  formatFrequencySummary,
  formatQuantity,
  formatShortSpanishDate,
  getDayCompletionStats,
  getGoalOriginDateStr,
  getMondayOfWeek,
  isDateScheduledForGoal,
  parseLocalDate,
  toLocalDateStr,
} from '../utils/paceEngine';
import { getWeeklyWindowDates } from '../utils/weeklyReport';

export type ReportsSubTab = 'day' | 'week' | 'month' | 'analysis';

interface ReportsAnalyticsViewProps {
  goals: Goal[];
  now: Date;
  selectedDate: string;
  dailyNotes: Record<string, string>;
  dailyQuizLogs: Record<string, DailyQuizResponse>;
  settings: AppSettings;
  globalProgress: GlobalProgressSummary;
  activeSubTab?: ReportsSubTab;
  onChangeSubTab?: (tab: ReportsSubTab) => void;
  onUpdateWeeklyStatsMode: (mode: WeeklyStatsMode) => void;
  onInspectGoal: (goalId: string, dateStr?: string) => void;
  onOpenDailyReport: (dateStr: string) => void;
  onOpenWeeklyReport: (anchorDateStr: string) => void;
  onOpenMonthlyReport: (year: number, month: number) => void;
  onOpenSettings?: () => void;
}

const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const WEEKDAY_SHORT_BY_JS_DAY = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const MONTH_SHORT_CAP = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];
const MICRO_HEATMAP_WEEKS = 16;
const ALL_HABITS_OPTION_ID = '__ALL__';

function getGoalInRangeOnDate(goal: Goal, dStr: string): boolean {
  const origin = getGoalOriginDateStr(goal);
  if (goal.isPermanent && dStr >= origin) return true;
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

export const ReportsAnalyticsView: React.FC<ReportsAnalyticsViewProps> = ({
  goals,
  now,
  selectedDate,
  dailyNotes,
  dailyQuizLogs,
  settings,
  activeSubTab,
  onChangeSubTab,
  onUpdateWeeklyStatsMode,
  onInspectGoal,
  onOpenDailyReport,
  onOpenWeeklyReport,
  onOpenMonthlyReport,
  onOpenSettings,
}) => {
  const todayStr = toLocalDateStr(now);
  const weeklyStatsMode: WeeklyStatsMode = settings.weeklyStatsMode ?? 'full_week';
  const analysisVis: AnalysisVisibilitySettings = {
    showGlobalChart: true,
    showFrictionDetail: true,
    showFrictionHistory: true,
    showDetailedHabitStats: true,
    ...(settings.analysisVisibility || {}),
  };
  const activeGoals = useMemo(
    () => goals.filter((g) => !g.isArchived),
    [goals]
  );

  // 4-option top selector inside Reports view: Día | Semana | Mes | Análisis
  const [internalSubTab, setInternalSubTab] = useState<ReportsSubTab>('analysis');
  const subTab = activeSubTab ?? internalSubTab;
  const setSubTab = (tab: ReportsSubTab) => {
    setInternalSubTab(tab);
    onChangeSubTab?.(tab);
  };

  // Temporal cursors for Día / Semana / Mes tabs
  const [dayCursor, setDayCursor] = useState<string>(selectedDate || todayStr);
  const [weekAnchorCursor, setWeekAnchorCursor] = useState<string>(todayStr);
  const [monthYearCursor, setMonthYearCursor] = useState<{ year: number; month: number }>(
    () => ({
      year: now.getFullYear(),
      month: now.getMonth(),
    })
  );

  // Detailed per-habit stats modal (Día/Semana/Mes rows) & inline dropdown in Análisis
  const [detailedStatsGoal, setDetailedStatsGoal] = useState<Goal | null>(null);
  const [statsDropdownOpen, setStatsDropdownOpen] = useState(false);
  const [detailedStatsExpanded, setDetailedStatsExpanded] = useState(true);
  const [detailedStatsHabitId, setDetailedStatsHabitId] = useState<string>(
    () => goals.find((g) => !g.isArchived)?.id || goals[0]?.id || ''
  );

  // Combined Global Panel view mode in Análisis tab ('trend' | 'heatmap') & shared habit filter
  const [globalChartMode, setGlobalChartMode] = useState<'trend' | 'heatmap'>(
    'trend'
  );
  const [selectedGlobalHabitId, setSelectedGlobalHabitId] = useState<string | null>(
    null
  );
  const [selectedGlobalHeatmapDate, setSelectedGlobalHeatmapDate] = useState<string>(
    () => toLocalDateStr(now)
  );

  // Bottom habit selector dropdown state in Análisis tab
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedHabitId, setSelectedHabitId] = useState<string>(
    () => goals.find((g) => !g.isArchived)?.id || goals[0]?.id || ''
  );

  // ---------------- DÍA TAB DATA ----------------
  const dailyReport = useMemo(
    () => buildDailyReport(activeGoals, dayCursor, dailyNotes, dailyQuizLogs),
    [activeGoals, dayCursor, dailyNotes, dailyQuizLogs]
  );
  const dailyAnalytics = useMemo(
    () => buildDailyReportAnalytics(activeGoals, dayCursor, dailyQuizLogs),
    [activeGoals, dayCursor, dailyQuizLogs]
  );

  // ---------------- SEMANA TAB DATA ----------------
  const weeklyData = useMemo(() => {
    const { rangeStart, rangeEnd, days } = getWeeklyWindowDates(
      weekAnchorCursor,
      weeklyStatsMode
    );

    const dayBars = days.map((dStr) => {
      const isFuture = dStr > todayStr;
      let scheduled = 0;
      let completedEq = 0;

      if (!isFuture) {
        for (const g of activeGoals) {
          const inRange = getGoalInRangeOnDate(g, dStr);
          if (!inRange) continue;
          const stats = getDayCompletionStats(g, dStr);
          const isScheduled =
            isDateScheduledForGoal(g, dStr) ||
            g.frequency?.type === 'times_per_week' ||
            g.frequency?.type === 'times_per_month';

          if (isScheduled) {
            scheduled += 1;
            completedEq += Math.min(1, stats.value / stats.target);
          } else if (stats.value > 0) {
            completedEq += Math.min(1, stats.value / stats.target);
          }
        }
      }

      const pct =
        scheduled > 0
          ? Math.min(100, Math.round((completedEq / scheduled) * 100))
          : 0;
      const dt = parseLocalDate(dStr);

      return {
        dateStr: dStr,
        label: WEEKDAY_SHORT_BY_JS_DAY[dt.getDay()],
        isFuture,
        scheduled,
        completedEq,
        pct,
      };
    });

    let totalScheduled = 0;
    let totalCompletedEq = 0;
    const habitBreakdown = activeGoals
      .map((g) => {
        const origin = getGoalOriginDateStr(g);
        let hSched = 0;
        let hComp = 0;
        for (const dStr of days) {
          if (dStr > todayStr || dStr < origin || dStr > g.deadlineDate) continue;
          const stats = getDayCompletionStats(g, dStr);
          const freqType = g.frequency?.type || 'everyday';
          if (freqType === 'specific_days' || freqType === 'every_n_days') {
            if (isDateScheduledForGoal(g, dStr)) {
              hSched += 1;
            }
            if (stats.value > 0) {
              hComp += Math.min(1, stats.value / stats.target);
            }
          } else if (freqType === 'everyday') {
            hSched += 1;
            hComp += Math.min(1, stats.value / stats.target);
          } else {
            if (stats.value > 0) {
              hComp += Math.min(1, stats.value / stats.target);
            }
          }
        }

        if (g.frequency?.type === 'times_per_week') {
          const activeDaysInWeek = days.filter(
            (d) => d <= todayStr && d >= origin && d <= g.deadlineDate
          ).length;
          hSched = Math.min(activeDaysInWeek, g.frequency.count || 3);
        } else if (g.frequency?.type === 'times_per_month') {
          const activeDaysInWeek = days.filter(
            (d) => d <= todayStr && d >= origin && d <= g.deadlineDate
          ).length;
          hSched = Math.min(
            activeDaysInWeek,
            Math.max(1, Math.round(((g.frequency.count || 10) / 30) * activeDaysInWeek))
          );
        }

        totalScheduled += hSched;
        totalCompletedEq += Math.min(hSched > 0 ? hSched : hComp, hComp);
        const pct =
          hSched > 0 ? Math.min(100, Math.round((hComp / hSched) * 100)) : 0;

        return {
          goal: g,
          scheduled: hSched,
          completedEq: Math.round(hComp * 10) / 10,
          pct,
        };
      })
      .filter((item) => item.scheduled > 0 || item.completedEq > 0)
      .sort((a, b) => b.pct - a.pct);

    const overallPct =
      totalScheduled > 0
        ? Math.min(100, Math.round((totalCompletedEq / totalScheduled) * 100))
        : 0;

    const bestDay = [...dayBars]
      .filter((d) => !d.isFuture && d.scheduled > 0)
      .sort((a, b) => b.pct - a.pct)[0];

    return {
      weekStart: rangeStart,
      weekEnd: rangeEnd,
      dayBars,
      habitBreakdown,
      overallPct,
      totalScheduled,
      totalCompletedEq: Math.round(totalCompletedEq * 10) / 10,
      bestDay,
    };
  }, [activeGoals, weekAnchorCursor, weeklyStatsMode, todayStr]);

  // ---------------- MES TAB DATA ----------------
  const monthlyReport = useMemo(
    () =>
      buildMonthlyReport(
        goals,
        monthYearCursor.year,
        monthYearCursor.month,
        todayStr,
        dailyQuizLogs
      ),
    [goals, monthYearCursor, todayStr, dailyQuizLogs]
  );

  const currentMonthKey = getMonthKey(now.getFullYear(), now.getMonth());
  const canGoNextMonth =
    getMonthKey(monthYearCursor.year, monthYearCursor.month) < currentMonthKey;
  const canGoNextWeek =
    weeklyStatsMode === 'full_week'
      ? getMondayOfWeek(weekAnchorCursor) < getMondayOfWeek(todayStr)
      : weekAnchorCursor < todayStr && addDays(weekAnchorCursor, 7) <= todayStr;

  // ---------------- ANÁLISIS TAB: SELECTED HABIT DETAIL ----------------
  const selectableGoals = useMemo(() => {
    const sorted = [...goals].sort((a, b) => {
      if (Boolean(a.isArchived) !== Boolean(b.isArchived)) {
        return a.isArchived ? 1 : -1;
      }
      return 0;
    });
    return sorted;
  }, [goals]);

  const selectedDetailedStatsHabit = useMemo(
    () =>
      selectableGoals.find((g) => g.id === detailedStatsHabitId) ||
      selectableGoals[0] ||
      null,
    [selectableGoals, detailedStatsHabitId]
  );

  const isAllHabitsSelected =
    selectedHabitId === ALL_HABITS_OPTION_ID && selectableGoals.length > 0;

  const selectedHabit = useMemo(
    () =>
      isAllHabitsSelected
        ? null
        : selectableGoals.find((g) => g.id === selectedHabitId) ||
          selectableGoals[0] ||
          null,
    [isAllHabitsSelected, selectableGoals, selectedHabitId]
  );

  const selectedHeatmapGoal = useMemo(
    () =>
      selectedGlobalHabitId
        ? activeGoals.find((g) => g.id === selectedGlobalHabitId) || null
        : null,
    [activeGoals, selectedGlobalHabitId]
  );

  // ---------------- ANÁLISIS TAB: GLOBAL / PER-HABIT HEATMAP ----------------
  const globalHeatmapData = useMemo(() => {
    const scopeGoals = selectedHeatmapGoal ? [selectedHeatmapGoal] : activeGoals;
    const isSingleGoal = Boolean(selectedHeatmapGoal);

    const currentMon = getMondayOfWeek(todayStr);
    const startMon = addDays(currentMon, -7 * (MICRO_HEATMAP_WEEKS - 1));
    const weekColumns = Array.from({ length: MICRO_HEATMAP_WEEKS }, (_, w) => {
      const colStart = addDays(startMon, w * 7);
      return Array.from({ length: 7 }, (_, d) => addDays(colStart, d));
    });

    const monthHeaders: Array<string | null> = Array(MICRO_HEATMAP_WEEKS).fill(null);
    let lastPlacedCol = -4;
    let lastPlacedMonth = -1;
    for (let w = 0; w < weekColumns.length; w++) {
      const week = weekColumns[w];
      const firstOfMonthDay = week.find((dStr) => dStr.endsWith('-01'));
      const refDateStr = firstOfMonthDay || week[0];
      const monthIdx = Number(refDateStr.split('-')[1]) - 1;
      if (w === 0 || (monthIdx !== lastPlacedMonth && w - lastPlacedCol >= 3)) {
        monthHeaders[w] = MONTH_SHORT_CAP[monthIdx] || '';
        lastPlacedCol = w;
        lastPlacedMonth = monthIdx;
      } else if (
        monthIdx !== lastPlacedMonth &&
        firstOfMonthDay &&
        w - lastPlacedCol >= 2
      ) {
        monthHeaders[w] = MONTH_SHORT_CAP[monthIdx] || '';
        lastPlacedCol = w;
        lastPlacedMonth = monthIdx;
      }
    }

    let earliestOrigin = todayStr;
    for (const g of scopeGoals) {
      const origin = getGoalOriginDateStr(g);
      if (origin < earliestOrigin) earliestOrigin = origin;
    }

    interface GlobalHeatmapDaySummary {
      dateStr: string;
      isFuture: boolean;
      hasAnyGoalInRange: boolean;
      isFlexibleRestDay: boolean;
      scheduledCount: number;
      doneCount: number;
      completedEq: number;
      pct: number | null;
      goalEntries: Array<{
        goal: Goal;
        isScheduled: boolean;
        isDone: boolean;
        pct: number;
        value: number;
      }>;
    }

    const dayMap = new Map<string, GlobalHeatmapDaySummary>();
    for (const week of weekColumns) {
      for (const dStr of week) {
        const isFuture = dStr > todayStr;
        let hasAnyGoalInRange = false;
        let scheduledCount = 0;
        let doneCount = 0;
        let completedEq = 0;
        let hasFlexibleInRange = false;
        const goalEntries: GlobalHeatmapDaySummary['goalEntries'] = [];

        for (const g of scopeGoals) {
          const inRange = getGoalInRangeOnDate(g, dStr);
          const stats = getDayCompletionStats(g, dStr);
          if (!inRange && stats.value === 0) continue;
          hasAnyGoalInRange = true;

          const freqType = g.frequency?.type || 'everyday';
          const isFlexible =
            freqType === 'times_per_week' || freqType === 'times_per_month';
          if (isFlexible) {
            hasFlexibleInRange = true;
          }

          // For single flexible-habit heatmap, rest days with 0 don't penalize as 0% error
          const isScheduled =
            freqType === 'everyday' ||
            (!isSingleGoal && isFlexible) ||
            ((freqType === 'specific_days' || freqType === 'every_n_days') &&
              isDateScheduledForGoal(g, dStr));

          const eq = Math.min(1, stats.value / stats.target);
          if (isScheduled) {
            scheduledCount += 1;
            completedEq += eq;
          } else if (stats.value > 0) {
            completedEq += eq;
          }

          if (stats.isDone) {
            doneCount += 1;
          }

          if (isScheduled || stats.value > 0 || (isSingleGoal && isFlexible)) {
            goalEntries.push({
              goal: g,
              isScheduled,
              isDone: stats.isDone,
              pct: stats.pct,
              value: stats.value,
            });
          }
        }

        const isFlexibleRestDay =
          isSingleGoal &&
          !isFuture &&
          hasAnyGoalInRange &&
          hasFlexibleInRange &&
          scheduledCount === 0 &&
          completedEq === 0;

        const pct =
          !isFuture && scheduledCount > 0
            ? Math.min(100, Math.round((completedEq / scheduledCount) * 100))
            : !isFuture && completedEq > 0
            ? Math.min(100, Math.round(completedEq * 100))
            : null;

        dayMap.set(dStr, {
          dateStr: dStr,
          isFuture,
          hasAnyGoalInRange:
            hasAnyGoalInRange || (!isSingleGoal && dStr >= earliestOrigin),
          isFlexibleRestDay,
          scheduledCount,
          doneCount,
          completedEq,
          pct,
          goalEntries,
        });
      }
    }

    return {
      weekColumns,
      monthHeaders,
      dayMap,
    };
  }, [activeGoals, selectedHeatmapGoal, todayStr]);

  const habitAnalytics = useMemo(() => {
    const scopeGoals = isAllHabitsSelected
      ? activeGoals.length > 0
        ? activeGoals
        : selectableGoals
      : selectedHabit
      ? [selectedHabit]
      : [];

    if (scopeGoals.length === 0) return null;

    let scheduledCount = 0;
    let completedCount = 0;
    let missedCount = 0;
    let explicitlySkippedCount = 0;

    // Transparent correlation across questionnaire Q2-Q5 -> 4 horizontal failure categories (unique failed days)
    const forgotDays = new Set<string>();
    const energyDays = new Set<string>();
    const timeDays = new Set<string>();
    const environmentDays = new Set<string>();

    const breakPointCounts: Record<QuizBreakPoint, number> = {
      start: 0,
      middle: 0,
      planning: 0,
    };
    const reactionCounts: Record<NonNullable<DailyQuizResponse['reaction']>, number> = {
      emergency_rule: 0,
      all_or_nothing: 0,
      postponed: 0,
    };

    interface FrictionEvent {
      dateStr: string;
      goalId?: string;
      goalTitle?: string;
      statusLabel: string;
      statusTone: 'missed' | 'partial' | 'skipped' | 'done';
      energyLevel?: DailyQuizResponse['energyLevel'];
      frictionTags?: QuizFrictionTag[];
      obstacle?: QuizObstacle;
      breakPoint?: QuizBreakPoint;
      reaction?: DailyQuizResponse['reaction'];
      note?: string;
      source: 'individual' | 'daily' | 'skip';
    }

    const events: FrictionEvent[] = [];

    const classifyFailureSignals = (dateStr: string, q: DailyQuizResponse) => {
      if (q.breakPoint) {
        breakPointCounts[q.breakPoint] += 1;
      }
      if (q.reaction) {
        reactionCounts[q.reaction] += 1;
      }

      const hasTags = Boolean(q.frictionTags && q.frictionTags.length > 0);

      // 1. Fricción: Olvido / Distracción
      if (
        q.obstacle === 'forgot' ||
        (hasTags && q.frictionTags?.includes('forgot_distraction')) ||
        q.breakPoint === 'middle' ||
        q.reaction === 'postponed'
      ) {
        forgotDays.add(dateStr);
      }

      // 2. Energía: Baja energía / Ánimo
      if (
        q.obstacle === 'energy_mood' ||
        q.obstacle === 'mental_saturation' ||
        q.energyLevel === 'low' ||
        (q.breakPoint === 'start' && q.reaction === 'all_or_nothing')
      ) {
        energyDays.add(dateStr);
      }

      // 3. Tiempo: Falta de tiempo / Emergencia
      if (
        q.obstacle === 'friction_time' ||
        q.obstacle === 'external_interruption' ||
        (hasTags &&
          (q.frictionTags?.includes('tight_time') ||
            q.frictionTags?.includes('emergency_unexpected'))) ||
        q.reaction === 'emergency_rule'
      ) {
        timeDays.add(dateStr);
      }

      // 4. Entorno: Falta de recursos / Logística
      if (
        q.obstacle === 'habit_substitution' ||
        q.breakPoint === 'planning'
      ) {
        environmentDays.add(dateStr);
      }
    };

    const dailyDaysLoggedWithFailure = new Set<string>();
    const minWindowStart = addDays(todayStr, -399);

    for (const targetGoal of scopeGoals) {
      const rawOrigin = getGoalOriginDateStr(targetGoal);
      const origin = rawOrigin > minWindowStart ? rawOrigin : minWindowStart;
      const endRange =
        targetGoal.deadlineDate < todayStr ? targetGoal.deadlineDate : todayStr;
      const freqType = targetGoal.frequency?.type || 'everyday';

      if (origin <= endRange) {
        let cursor = origin;
        let guard = 0;
        while (cursor <= endRange && guard < 400) {
          const stats = getDayCompletionStats(targetGoal, cursor);
          const isScheduled =
            freqType === 'everyday' ||
            ((freqType === 'specific_days' || freqType === 'every_n_days') &&
              isDateScheduledForGoal(targetGoal, cursor));

          if (isScheduled) {
            scheduledCount += 1;
            if (stats.isDone) {
              completedCount += 1;
            } else {
              missedCount += 1;
            }
          } else if (stats.isDone) {
            completedCount += 1;
          }

          const isExplicitSkip = Boolean(targetGoal.skipped?.[cursor]);
          if (isExplicitSkip) {
            explicitlySkippedCount += 1;
          }

          const indQuiz = targetGoal.quizLogs?.[cursor];
          const dayQuiz = dailyQuizLogs[cursor];
          const habitNote = targetGoal.notes?.[cursor]?.trim();
          const isFailureDay =
            !stats.isDone && (isScheduled || isExplicitSkip || Boolean(indQuiz));

          if (indQuiz && isFailureDay) {
            classifyFailureSignals(cursor, indQuiz);
          } else if (
            !indQuiz &&
            !stats.isDone &&
            isScheduled &&
            dayQuiz &&
            (!isAllHabitsSelected || !dailyDaysLoggedWithFailure.has(cursor))
          ) {
            dailyDaysLoggedWithFailure.add(cursor);
            classifyFailureSignals(cursor, dayQuiz);
          }

          const effectiveQuiz =
            indQuiz ||
            (!isAllHabitsSelected && !stats.isDone && isScheduled && dayQuiz
              ? dayQuiz
              : undefined);

          if (effectiveQuiz || isExplicitSkip || (habitNote && !stats.isDone)) {
            events.push({
              dateStr: cursor,
              goalId: targetGoal.id,
              goalTitle: targetGoal.title,
              statusLabel: stats.isDone
                ? 'Completado'
                : isExplicitSkip
                ? 'Omitido (saltado)'
                : stats.value > 0
                ? `Parcial (${stats.pct}%)`
                : 'No completado',
              statusTone: stats.isDone
                ? 'done'
                : isExplicitSkip
                ? 'skipped'
                : stats.value > 0
                ? 'partial'
                : 'missed',
              energyLevel: effectiveQuiz?.energyLevel,
              frictionTags: effectiveQuiz?.frictionTags,
              obstacle: effectiveQuiz?.obstacle,
              breakPoint: effectiveQuiz?.breakPoint,
              reaction: effectiveQuiz?.reaction,
              note: effectiveQuiz?.note?.trim() || habitNote || undefined,
              source: indQuiz ? 'individual' : effectiveQuiz ? 'daily' : 'skip',
            });
          }

          cursor = addDays(cursor, 1);
          guard += 1;
        }
      }
    }

    if (isAllHabitsSelected) {
      for (const [dStr, dQuiz] of Object.entries(dailyQuizLogs)) {
        if (dStr > todayStr || dStr < minWindowStart) continue;
        if (!dailyDaysLoggedWithFailure.has(dStr)) {
          const hasFailureSignals =
            dQuiz.energyLevel === 'low' ||
            dQuiz.executionMode === 'with_resistance' ||
            Boolean(dQuiz.obstacle) ||
            Boolean(dQuiz.frictionTags?.length) ||
            Boolean(dQuiz.breakPoint) ||
            Boolean(dQuiz.reaction);
          if (hasFailureSignals) {
            classifyFailureSignals(dStr, dQuiz);
          }
        }
        const hasDetails =
          dQuiz.executionMode === 'with_resistance' ||
          Boolean(dQuiz.obstacle) ||
          Boolean(dQuiz.frictionTags?.length) ||
          Boolean(dQuiz.breakPoint) ||
          Boolean(dQuiz.reaction) ||
          Boolean(dQuiz.note?.trim());
        if (hasDetails) {
          events.push({
            dateStr: dStr,
            goalTitle: 'Check-in general del día',
            statusLabel:
              dQuiz.executionMode === 'with_resistance'
                ? 'Día con resistencia'
                : 'Check-in diario',
            statusTone:
              dQuiz.executionMode === 'with_resistance' ? 'partial' : 'done',
            energyLevel: dQuiz.energyLevel,
            frictionTags: dQuiz.frictionTags,
            obstacle: dQuiz.obstacle,
            breakPoint: dQuiz.breakPoint,
            reaction: dQuiz.reaction,
            note: dQuiz.note?.trim() || undefined,
            source: 'daily',
          });
        }
      }
    }

    events.sort((a, b) => b.dateStr.localeCompare(a.dateStr));

    const failureDistribution = [
      {
        id: 'friction_forgot' as const,
        emoji: '⚠️',
        title: 'Fricción: Olvido / Distracción',
        count: forgotDays.size,
        color: '#F59E0B',
      },
      {
        id: 'energy_low' as const,
        emoji: '🔋',
        title: 'Energía: Baja energía / Ánimo',
        count: energyDays.size,
        color: '#F43F5E',
      },
      {
        id: 'time_emergency' as const,
        emoji: '⏳',
        title: 'Tiempo: Falta de tiempo / Emergencia',
        count: timeDays.size,
        color: '#3B4DF5',
      },
      {
        id: 'environment_logistics' as const,
        emoji: '🛠️',
        title: 'Entorno: Falta de recursos / Logística',
        count: environmentDays.size,
        color: '#0D9488',
      },
    ];

    const maxFailureBarCount = Math.max(
      1,
      ...failureDistribution.map((b) => b.count)
    );
    const totalCategorizedSignals = failureDistribution.reduce(
      (sum, item) => sum + item.count,
      0
    );

    const topBreakPoint = (
      Object.entries(breakPointCounts) as Array<[QuizBreakPoint, number]>
    )
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])[0];

    const topReaction = (
      Object.entries(reactionCounts) as Array<
        [NonNullable<DailyQuizResponse['reaction']>, number]
      >
    )
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])[0];

    // Simple, easy-to-scan failure interpretation
    const SIMPLE_CAUSE_LABELS: Record<
      (typeof failureDistribution)[number]['id'],
      string
    > = {
      friction_forgot: 'olvido o distracción',
      energy_low: 'baja energía o ánimo',
      time_emergency: 'falta de tiempo o imprevistos',
      environment_logistics: 'falta de preparación',
    };

    let failureSummary: { headline: string; detail?: string; tip?: string };

    if (missedCount === 0) {
      failureSummary = {
        headline: isAllHabitsSelected
          ? 'Sin fallos acumulados en los días programados.'
          : 'Vas al 100% en los días programados de este hábito.',
      };
    } else if (totalCategorizedSignals === 0) {
      failureSummary = {
        headline: `Llevas ${missedCount} ${
          missedCount === 1 ? 'fallo' : 'fallos'
        } sin motivo registrado.`,
        tip: 'Usa el cuestionario rápido cuando ocurra un fallo para ver qué lo provoca.',
      };
    } else {
      const sortedCauses = [...failureDistribution]
        .filter((c) => c.count > 0)
        .sort((a, b) => b.count - a.count);
      const topCause = sortedCauses[0];
      const secondCause = sortedCauses[1];

      const headline = `Motivo principal: ${SIMPLE_CAUSE_LABELS[topCause.id]} (${
        topCause.count
      } ${topCause.count === 1 ? 'día' : 'días'}).`;

      let detail: string | undefined;
      if (secondCause && secondCause.count > 0) {
        detail = `Segundo motivo: ${SIMPLE_CAUSE_LABELS[secondCause.id]} (${
          secondCause.count
        }d).`;
      } else if (topBreakPoint) {
        const simpleBreakMap: Record<QuizBreakPoint, string> = {
          start: 'Suele costar trabajo al momento de empezar.',
          middle: 'Suele cortarse a mitad de la tarea.',
          planning: 'Suele caerse por falta de espacio en el día.',
        };
        detail = simpleBreakMap[topBreakPoint[0]];
      }

      let tip = '';
      if (topCause.id === 'friction_forgot') {
        tip = 'Pon un recordatorio o hazlo justo después de otra rutina fija.';
      } else if (topCause.id === 'energy_low') {
        tip = 'Usa una versión corta de 2 a 5 minutos los días pesados.';
      } else if (topCause.id === 'time_emergency') {
        tip = 'Muévelo a un horario más libre o baja un poco la meta.';
      } else {
        tip = 'Deja todo listo desde antes para empezar sin pensar.';
      }

      failureSummary = { headline, detail, tip };
    }

    const progress = selectedHabit ? calculateGoalProgress(selectedHabit, now) : null;

    return {
      isAllHabits: isAllHabitsSelected,
      progress,
      scheduledCount,
      completedCount,
      missedCount,
      explicitlySkippedCount,
      failureDistribution,
      maxFailureBarCount,
      totalCategorizedSignals,
      failureSummary,
      events,
    };
  }, [
    isAllHabitsSelected,
    activeGoals,
    selectableGoals,
    selectedHabit,
    dailyQuizLogs,
    todayStr,
    now,
  ]);

  return (
    <div className="space-y-4">
      {/* 1. Evolution Selector: 4 Options [ Día | Semana | Mes | Análisis 📊 ] */}
      <div
        role="tablist"
        aria-label="Secciones de reportes"
        className="bg-white rounded-2xl border border-slate-200/80 p-1 grid grid-cols-4 gap-1 shadow-2xs"
      >
        {(
          [
            { id: 'day', label: 'Día' },
            { id: 'week', label: 'Semana' },
            { id: 'month', label: 'Mes' },
            { id: 'analysis', label: 'Análisis' },
          ] as const
        ).map((tab) => {
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubTab(tab.id)}
              className={`h-11 px-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 transition-colors ${
                active
                  ? 'bg-[#3B4DF5] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span>{tab.label}</span>
              {tab.id === 'analysis' && (
                <BarChart2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      {/* ---------------- TAB: DÍA ---------------- */}
      {subTab === 'day' && (
        <div className="space-y-4">
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDayCursor(addDays(dayCursor, -1))}
                aria-label="Día anterior"
                className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 shrink-0"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>

              <div className="text-center min-w-0">
                <h2 className="font-display text-base font-bold text-slate-900 truncate">
                  {dayCursor === todayStr
                    ? `Hoy · ${formatShortSpanishDate(dayCursor)}`
                    : formatShortSpanishDate(dayCursor)}
                </h2>
                <p className="text-xs text-slate-500 tabular-nums">
                  {dailyReport.completedCount}/{dailyReport.totalCount} hábitos completados
                  {dailyAnalytics.globalActiveStreak > 0
                    ? ` · Racha ${dailyAnalytics.globalActiveStreak}d`
                    : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (dayCursor < todayStr) setDayCursor(addDays(dayCursor, 1));
                }}
                disabled={dayCursor >= todayStr}
                aria-label="Día siguiente"
                className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center text-slate-700 shrink-0"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-600">
                  Cumplimiento del día
                </span>
                <span className="font-mono text-2xl font-bold text-[#3B4DF5] tabular-nums">
                  {dailyReport.totalPct}%
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#3B4DF5] transition-[width] duration-200"
                  style={{ width: `${dailyReport.totalPct}%` }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenDailyReport(dayCursor)}
              className="w-full h-11 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors"
            >
              Abrir reporte completo y check-in del día
            </button>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100 shadow-2xs overflow-hidden">
            {dailyReport.totalCount === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No había hábitos programados para este día.
              </div>
            ) : (
              [...dailyReport.completed, ...dailyReport.partial, ...dailyReport.missed].map(
                (item) => {
                  const palette = getGoalPalette(item.goal.colorHex);
                  return (
                    <div
                      key={item.goal.id}
                      className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50/70 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => onInspectGoal(item.goal.id, dayCursor)}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      >
                        <GoalIconBadge
                          iconType={item.goal.iconType}
                          iconValue={item.goal.iconValue}
                          colorHex={item.goal.colorHex}
                          sizeClass="w-9 h-9"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {item.goal.title}
                          </div>
                          <div className="text-xs text-slate-500 tabular-nums">
                            {item.goal.trackingMode === 'boolean'
                              ? item.isDone
                                ? 'Completado'
                                : 'Sin registro'
                              : `${formatQuantity(item.value)} / ${formatQuantity(item.target)}${
                                  item.goal.unit ? ` ${item.goal.unit}` : ''
                                }`}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="font-mono text-xs font-bold tabular-nums"
                          style={{
                            color: item.isDone
                              ? palette.iconFg
                              : item.pct > 0
                              ? '#D97706'
                              : '#94A3B8',
                          }}
                        >
                          {item.pct}%
                        </span>
                        <button
                          type="button"
                          onClick={() => setDetailedStatsGoal(item.goal)}
                          aria-label={`Ver estadísticas de ${item.goal.title}`}
                          title="Ver estadísticas del hábito"
                          className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-[#3B4DF5] flex items-center justify-center transition-colors shrink-0"
                        >
                          <BarChart2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                }
              )
            )}
          </section>

          {dailyReport.dailyQuiz?.energyLevel && (
            <section className="bg-white rounded-2xl border border-slate-200/80 px-4 py-3 shadow-2xs flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 font-medium">Energía registrada</span>
              <span className="font-semibold text-slate-900">
                {getEnergyLevelLabel(dailyReport.dailyQuiz.energyLevel)}
              </span>
            </section>
          )}
        </div>
      )}

      {/* ---------------- TAB: SEMANA ---------------- */}
      {subTab === 'week' && (
        <div className="space-y-4">
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setWeekAnchorCursor(addDays(weekAnchorCursor, -7))}
                aria-label="Semana anterior"
                className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 shrink-0"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>

              <div className="text-center min-w-0">
                <h2 className="font-display text-base font-bold text-slate-900 truncate">
                  {formatShortSpanishDate(weeklyData.weekStart)} –{' '}
                  {formatShortSpanishDate(weeklyData.weekEnd)}
                </h2>
                <p className="text-xs text-slate-500 tabular-nums">
                  Cumplimiento semanal: {weeklyData.totalCompletedEq}/
                  {weeklyData.totalScheduled} acciones
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (canGoNextWeek) {
                    setWeekAnchorCursor(addDays(weekAnchorCursor, 7));
                  }
                }}
                disabled={!canGoNextWeek}
                aria-label="Semana siguiente"
                className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center text-slate-700 shrink-0"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Synced Weekly Window Selector (Últimos 7 días vs Semana completa) */}
            <div className="flex justify-center">
              <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/80 gap-1">
                {(
                  [
                    { id: 'last_7', label: 'Últimos 7 días' },
                    { id: 'full_week', label: 'Semana completa' },
                  ] as const
                ).map((opt) => {
                  const active = weeklyStatsMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onUpdateWeeklyStatsMode(opt.id)}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3">
                <div className="text-xs text-slate-500">Promedio semanal</div>
                <div className="font-mono text-2xl font-bold text-[#3B4DF5] tabular-nums mt-0.5">
                  {weeklyData.overallPct}%
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3">
                <div className="text-xs text-slate-500">Mejor día</div>
                <div className="text-sm font-bold text-slate-900 mt-1 truncate">
                  {weeklyData.bestDay
                    ? `${formatShortSpanishDate(weeklyData.bestDay.dateStr)} (${weeklyData.bestDay.pct}%)`
                    : 'Sin datos'}
                </div>
              </div>
            </div>

            {/* 7-day bar chart */}
            <div className="grid grid-cols-7 gap-2 items-end h-32 pt-4">
              {weeklyData.dayBars.map((bar) => (
                <div
                  key={bar.dateStr}
                  className="flex flex-col items-center justify-end h-full gap-1.5"
                >
                  <span className="font-mono text-[10px] font-semibold text-slate-500 tabular-nums">
                    {bar.isFuture || bar.scheduled === 0 ? '—' : `${bar.pct}%`}
                  </span>
                  <div className="w-full max-w-[30px] flex-1 rounded-lg bg-slate-100 flex items-end overflow-hidden">
                    <div
                      className="w-full rounded-lg transition-[height] duration-200"
                      style={{
                        height: bar.isFuture ? '0%' : `${Math.max(bar.pct > 0 ? 8 : 0, bar.pct)}%`,
                        backgroundColor:
                          bar.pct >= 80
                            ? '#3B4DF5'
                            : bar.pct >= 40
                            ? '#60A5FA'
                            : '#CBD5E1',
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600">
                    {bar.label}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onOpenWeeklyReport(weekAnchorCursor)}
              className="w-full h-11 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>Abrir resumen semanal en historias</span>
            </button>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100 shadow-2xs overflow-hidden">
            {weeklyData.habitBreakdown.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                Sin actividad programada en esta semana.
              </div>
            ) : (
              weeklyData.habitBreakdown.map(({ goal, scheduled, completedEq, pct }) => {
                const palette = getGoalPalette(goal.colorHex);
                return (
                  <div
                    key={goal.id}
                    className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onInspectGoal(goal.id)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      <GoalIconBadge
                        iconType={goal.iconType}
                        iconValue={goal.iconValue}
                        colorHex={goal.colorHex}
                        sizeClass="w-9 h-9"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {goal.title}
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden max-w-[180px]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: palette.fillBg,
                            }}
                          />
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right tabular-nums">
                        <div className="font-mono text-xs font-bold text-slate-900">
                          {pct}%
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {completedEq}/{scheduled}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDetailedStatsGoal(goal)}
                        aria-label={`Ver estadísticas de ${goal.title}`}
                        title="Ver estadísticas del hábito"
                        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-[#3B4DF5] flex items-center justify-center transition-colors shrink-0"
                      >
                        <BarChart2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </div>
      )}

      {/* ---------------- TAB: MES ---------------- */}
      {subTab === 'month' && (
        <div className="space-y-4">
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  setMonthYearCursor(
                    getPreviousMonth(monthYearCursor.year, monthYearCursor.month)
                  )
                }
                aria-label="Mes anterior"
                className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 shrink-0"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>

              <div className="text-center min-w-0">
                <h2 className="font-display text-base font-bold text-slate-900 capitalize truncate">
                  {monthlyReport.monthTitle}
                </h2>
                <p className="text-xs text-slate-500 tabular-nums">
                  Realizaste tus hábitos {Math.round(monthlyReport.totalCompletedCount)}/
                  {monthlyReport.totalScheduledCount}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (canGoNextMonth) {
                    setMonthYearCursor(
                      getNextMonth(monthYearCursor.year, monthYearCursor.month)
                    );
                  }
                }}
                disabled={!canGoNextMonth}
                aria-label="Mes siguiente"
                className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center text-slate-700 shrink-0"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3">
                <div className="text-[11px] text-slate-500">Global</div>
                <div className="font-mono text-xl font-bold text-[#3B4DF5] tabular-nums mt-0.5">
                  {monthlyReport.overallPct}%
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3">
                <div className="text-[11px] text-slate-500">Mejor día</div>
                <div className="text-sm font-bold text-slate-900 mt-1 truncate">
                  {(() => {
                    const bestBar = [...monthlyReport.weekdayBars]
                      .filter((b) => b.scheduled > 0)
                      .sort((a, b) => b.pct - a.pct)[0];
                    return bestBar ? `${bestBar.short} · ${bestBar.pct}%` : '—';
                  })()}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3">
                <div className="text-[11px] text-slate-500">Días activos</div>
                <div className="font-mono text-xl font-bold text-slate-900 tabular-nums mt-0.5">
                  {monthlyReport.activeDaysCount}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                onOpenMonthlyReport(monthYearCursor.year, monthYearCursor.month)
              }
              className="w-full h-11 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>Abrir resumen mensual en historias</span>
            </button>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100 shadow-2xs overflow-hidden">
            {monthlyReport.perHabitStats.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No hubo hábitos activos en este mes.
              </div>
            ) : (
              monthlyReport.perHabitStats.map((entry) => {
                const palette = getGoalPalette(entry.goal.colorHex);
                return (
                  <div
                    key={entry.goal.id}
                    className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onInspectGoal(entry.goal.id)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      <GoalIconBadge
                        iconType={entry.goal.iconType}
                        iconValue={entry.goal.iconValue}
                        colorHex={entry.goal.colorHex}
                        sizeClass="w-9 h-9"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {entry.goal.title}
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden max-w-[180px]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${entry.pct}%`,
                              backgroundColor: palette.fillBg,
                            }}
                          />
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right tabular-nums">
                        <div className="font-mono text-xs font-bold text-slate-900">
                          {entry.pct}%
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {Math.round(entry.completed)}/{entry.scheduled}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDetailedStatsGoal(entry.goal)}
                        aria-label={`Ver estadísticas de ${entry.goal.title}`}
                        title="Ver estadísticas del hábito"
                        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-[#3B4DF5] flex items-center justify-center transition-colors shrink-0"
                      >
                        <BarChart2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          {/* Gráfica mensual / global de todos los hábitos (estilo Foto 2, preseleccionado Mensual) */}
          <GlobalHabitTrendCard
            goals={goals}
            todayStr={todayStr}
            dailyQuizLogs={dailyQuizLogs}
            anchorMonth={monthYearCursor}
            weeklyStatsMode={weeklyStatsMode}
            onChangeWeeklyStatsMode={onUpdateWeeklyStatsMode}
          />
        </div>
      )}

      {/* ---------------- TAB: ANÁLISIS ---------------- */}
      {subTab === 'analysis' && (
        <div className="space-y-4">
          {!analysisVis.showGlobalChart &&
            !analysisVis.showFrictionDetail &&
            !analysisVis.showDetailedHabitStats && (
              <section className="bg-white rounded-2xl border border-slate-200/80 p-6 text-center space-y-3 shadow-2xs">
                <p className="text-sm font-semibold text-slate-800">
                  Todas las secciones de Análisis están ocultas.
                </p>
                <p className="text-xs text-slate-500">
                  Activa las tarjetas que quieras ver desde Configuración.
                </p>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="h-10 px-4 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Editar visualización</span>
                  </button>
                )}
              </section>
            )}

          {/* SECCIÓN SUPERIOR COMBINADA: Tendencia | Mapa de calor (global o por hábito) */}
          {analysisVis.showGlobalChart && (
            <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate">
                    {globalChartMode === 'trend'
                      ? 'Tendencia global de hábitos'
                      : selectedHeatmapGoal
                      ? `Mapa de calor · ${selectedHeatmapGoal.title}`
                      : 'Mapa de calor global'}
                  </h2>
                </div>

                <div
                  role="tablist"
                  aria-label="Modo de visualización global"
                  className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/80 gap-1 shrink-0"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={globalChartMode === 'trend'}
                    onClick={() => setGlobalChartMode('trend')}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                      globalChartMode === 'trend'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Tendencia</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={globalChartMode === 'heatmap'}
                    onClick={() => setGlobalChartMode('heatmap')}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                      globalChartMode === 'heatmap'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Mapa de calor</span>
                  </button>
                </div>
              </div>

              {globalChartMode === 'trend' ? (
                <GlobalHabitTrendCard
                  embedded
                  goals={goals}
                  todayStr={todayStr}
                  dailyQuizLogs={dailyQuizLogs}
                  weeklyStatsMode={weeklyStatsMode}
                  onChangeWeeklyStatsMode={onUpdateWeeklyStatsMode}
                  selectedSeriesGoalId={selectedGlobalHabitId}
                  onChangeSeriesGoalId={setSelectedGlobalHabitId}
                />
              ) : activeGoals.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Crea al menos un hábito activo para ver el mapa de calor.
                </div>
              ) : (
                (() => {
                  const heatmapColor = selectedHeatmapGoal?.colorHex || '#3B4DF5';
                  const getHeatmapFillStyle = (pct: number): React.CSSProperties => {
                    if (pct < 25) {
                      return {
                        backgroundColor: hexToRgba(heatmapColor, 0.2),
                        borderColor: hexToRgba(heatmapColor, 0.35),
                        borderWidth: '1px',
                      };
                    }
                    if (pct < 50) {
                      return { backgroundColor: hexToRgba(heatmapColor, 0.38) };
                    }
                    if (pct < 75) {
                      return { backgroundColor: hexToRgba(heatmapColor, 0.58) };
                    }
                    if (pct < 100) {
                      return { backgroundColor: hexToRgba(heatmapColor, 0.78) };
                    }
                    return { backgroundColor: heatmapColor };
                  };

                  return (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500">
                        {selectedHeatmapGoal
                          ? `Últimas ${MICRO_HEATMAP_WEEKS} semanas de «${selectedHeatmapGoal.title}». La intensidad del color refleja el % cumplido.`
                          : `Consistencia combinada de las últimas ${MICRO_HEATMAP_WEEKS} semanas. La intensidad del color refleja el % diario cumplido.`}
                      </p>

                      <div className="rounded-xl bg-slate-50/70 border border-slate-200/70 p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-3 shrink-0" aria-hidden="true" />
                          <div
                            className="flex-1 min-w-0 grid gap-[3px] sm:gap-1"
                            style={{
                              gridTemplateColumns: `repeat(${MICRO_HEATMAP_WEEKS}, minmax(0, 1fr))`,
                            }}
                          >
                            {globalHeatmapData.monthHeaders.map((lbl, idx) => (
                              <div key={idx} className="relative h-3 overflow-visible">
                                {lbl && (
                                  <span className="absolute left-0 top-0 text-[9px] font-medium text-slate-400 leading-none whitespace-nowrap">
                                    {lbl}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-stretch gap-1.5">
                          <div className="w-3 shrink-0 grid grid-rows-7 gap-[3px] sm:gap-1 items-center">
                            {WEEKDAY_LABELS.map((lbl, idx) => (
                              <span
                                key={`${lbl}-${idx}`}
                                className="text-[8.5px] font-medium text-slate-400 leading-none text-center select-none"
                              >
                                {lbl}
                              </span>
                            ))}
                          </div>

                          <div
                            className="flex-1 min-w-0 grid gap-[3px] sm:gap-1"
                            style={{
                              gridTemplateColumns: `repeat(${MICRO_HEATMAP_WEEKS}, minmax(0, 1fr))`,
                            }}
                          >
                            {globalHeatmapData.weekColumns.map((week, wIdx) => (
                              <div
                                key={wIdx}
                                className="grid grid-rows-7 gap-[3px] sm:gap-1 justify-items-center"
                              >
                                {week.map((dStr) => {
                                  const info = globalHeatmapData.dayMap.get(dStr);
                                  const cellShape =
                                    'w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-[3px] transition-all';
                                  const isSelected = selectedGlobalHeatmapDate === dStr;

                                  if (!info || !info.hasAnyGoalInRange) {
                                    return (
                                      <span
                                        key={dStr}
                                        className={`${cellShape} bg-transparent`}
                                        aria-hidden="true"
                                      />
                                    );
                                  }

                                  if (info.isFuture) {
                                    return (
                                      <span
                                        key={dStr}
                                        title={`${formatShortSpanishDate(dStr)} · Próximo`}
                                        className={`${cellShape} bg-white border border-slate-200/90`}
                                        aria-hidden="true"
                                      />
                                    );
                                  }

                                  if (info.isFlexibleRestDay) {
                                    return (
                                      <button
                                        key={dStr}
                                        type="button"
                                        onClick={() => setSelectedGlobalHeatmapDate(dStr)}
                                        title={`${formatShortSpanishDate(dStr)} · Sin registro`}
                                        aria-label={`${formatShortSpanishDate(dStr)}: sin registro`}
                                        className={`${cellShape} bg-white border border-slate-200/90 cursor-pointer ${
                                          isSelected
                                            ? 'ring-2 ring-slate-900 ring-offset-1'
                                            : 'hover:opacity-85'
                                        }`}
                                      />
                                    );
                                  }

                                  if (
                                    info.scheduledCount === 0 &&
                                    info.doneCount === 0 &&
                                    info.completedEq === 0
                                  ) {
                                    return (
                                      <span
                                        key={dStr}
                                        className={`${cellShape} bg-transparent`}
                                        aria-hidden="true"
                                      />
                                    );
                                  }

                                  const pct = info.pct ?? 0;
                                  const isZero = pct === 0;

                                  return (
                                    <button
                                      key={dStr}
                                      type="button"
                                      onClick={() => setSelectedGlobalHeatmapDate(dStr)}
                                      title={`${formatShortSpanishDate(dStr)} · ${
                                        selectedHeatmapGoal
                                          ? `${pct}% cumplido`
                                          : `${info.doneCount}/${info.scheduledCount} (${pct}%)`
                                      }`}
                                      aria-label={`${formatShortSpanishDate(dStr)}: ${pct}% cumplido`}
                                      style={isZero ? undefined : getHeatmapFillStyle(pct)}
                                      className={`${cellShape} cursor-pointer ${
                                        isZero
                                          ? 'border-[1.5px] border-rose-400/80 bg-rose-50/40'
                                          : ''
                                      } ${
                                        isSelected
                                          ? 'ring-2 ring-slate-900 ring-offset-1'
                                          : 'hover:opacity-85'
                                      }`}
                                    />
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* % Intensity Legend */}
                        <div className="mt-2.5 pt-2 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                          <div className="flex items-center gap-2.5">
                            <span className="inline-flex items-center gap-1">
                              <span className="w-2.5 h-2.5 rounded-[2.5px] border border-rose-400 bg-rose-50/40" />
                              0%
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span>Menos</span>
                              {[15, 35, 60, 85, 100].map((samplePct) => (
                                <span
                                  key={samplePct}
                                  className="w-2.5 h-2.5 rounded-[2.5px]"
                                  style={getHeatmapFillStyle(samplePct)}
                                />
                              ))}
                              <span>100%</span>
                            </span>
                          </div>
                          <span>Toca un día para ver el detalle</span>
                        </div>
                      </div>

                      {/* Series Selector Tabs matching Tendencia (Promedio global | Habit 1 | Habit 2...) */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setSelectedGlobalHabitId(null)}
                          className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                            selectedGlobalHabitId === null
                              ? 'bg-slate-900 text-white shadow-2xs'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          Promedio global
                        </button>

                        {activeGoals.map((g) => {
                          const isSelected = selectedGlobalHabitId === g.id;
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() =>
                                setSelectedGlobalHabitId((cur) =>
                                  cur === g.id ? null : g.id
                                )
                              }
                              className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors truncate max-w-[160px] ${
                                isSelected
                                  ? 'text-white shadow-2xs'
                                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                              }`}
                              style={
                                isSelected
                                  ? { backgroundColor: g.colorHex || '#3B4DF5' }
                                  : undefined
                              }
                            >
                              {g.title}
                            </button>
                          );
                        })}
                      </div>

                      {/* Selected Day Readout */}
                      {(() => {
                        const selInfo = globalHeatmapData.dayMap.get(
                          selectedGlobalHeatmapDate
                        );
                        if (!selInfo || selInfo.goalEntries.length === 0) {
                          return (
                            <div className="text-[11px] text-slate-500 px-1">
                              {formatShortSpanishDate(selectedGlobalHeatmapDate)}: sin hábitos programados.
                            </div>
                          );
                        }
                        return (
                          <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-bold text-slate-900 capitalize">
                                {formatShortSpanishDate(selInfo.dateStr)}
                              </span>
                              <span
                                className="font-mono font-bold tabular-nums"
                                style={{ color: heatmapColor }}
                              >
                                {selectedHeatmapGoal
                                  ? selInfo.isFlexibleRestDay
                                    ? 'Sin registro'
                                    : `${selInfo.pct ?? 0}% cumplido`
                                  : `${selInfo.doneCount}/${selInfo.scheduledCount} cumplidos (${
                                      selInfo.pct ?? 0
                                    }%)`}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {selInfo.goalEntries.map((entry) => (
                                <button
                                  key={entry.goal.id}
                                  type="button"
                                  onClick={() =>
                                    onInspectGoal(entry.goal.id, selInfo.dateStr)
                                  }
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                                    entry.isDone
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                      : entry.value > 0
                                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                                      : 'bg-white border-slate-200 text-slate-600'
                                  }`}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{
                                      backgroundColor: entry.isDone
                                        ? entry.goal.colorHex || '#10B981'
                                        : '#CBD5E1',
                                    }}
                                  />
                                  <span className="truncate max-w-[140px]">
                                    {entry.goal.title}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()
              )}
            </section>
          )}

          {/* SECCIÓN MEDIA (Intercambiada): Detalle individual y fricción (incluye Todos los hábitos) */}
          {analysisVis.showFrictionDetail && (
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm sm:text-base font-bold text-slate-900">
                Detalle y fricción
              </h3>
              {!isAllHabitsSelected && selectedHabit && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setDetailedStatsGoal(selectedHabit)}
                    aria-label={`Ver estadísticas de ${selectedHabit.title}`}
                    title="Estadísticas detalladas"
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-[#3B4DF5] flex items-center justify-center transition-colors"
                  >
                    <BarChart2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onInspectGoal(selectedHabit.id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#3B4DF5] hover:underline whitespace-nowrap"
                  >
                    <span>Abrir hábito</span>
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            {/* Minimalist Dropdown Habit Selector (Todos los hábitos + cada hábito) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                aria-expanded={dropdownOpen}
                aria-haspopup="listbox"
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/90 flex items-center justify-between gap-3 text-left transition-colors"
              >
                {isAllHabitsSelected ? (
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 text-[#3B4DF5] flex items-center justify-center shrink-0">
                      <Layers className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">
                        Todos los hábitos
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        Fricciones a nivel general ({activeGoals.length || selectableGoals.length} hábitos)
                      </div>
                    </div>
                  </div>
                ) : selectedHabit ? (
                  <div className="flex items-center gap-3 min-w-0">
                    <GoalIconBadge
                      iconType={selectedHabit.iconType}
                      iconValue={selectedHabit.iconValue}
                      colorHex={selectedHabit.colorHex}
                      sizeClass="w-8 h-8"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">
                        {selectedHabit.title}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {formatFrequencySummary(selectedHabit.frequency)}
                        {selectedHabit.isArchived ? ' · Archivado' : ''}
                      </div>
                    </div>
                  </div>
                ) : (
                  <span className="text-sm text-slate-500 font-medium">
                    Seleccionar hábito para detallar...
                  </span>
                )}

                <ChevronDown
                  className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${
                    dropdownOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {dropdownOpen && (
                <div
                  role="listbox"
                  aria-label="Seleccionar hábito o vista general"
                  className="mt-2 rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 max-h-64 overflow-y-auto shadow-md"
                >
                  {selectableGoals.length === 0 ? (
                    <div className="p-4 text-xs text-slate-500 text-center">
                      No hay hábitos disponibles.
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isAllHabitsSelected}
                        onClick={() => {
                          setSelectedHabitId(ALL_HABITS_OPTION_ID);
                          setDropdownOpen(false);
                        }}
                        className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
                          isAllHabitsSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 text-[#3B4DF5] flex items-center justify-center shrink-0">
                            <Layers className="w-4 h-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900 truncate">
                              Todos los hábitos
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              Fricciones y motivos a nivel general
                            </div>
                          </div>
                        </div>

                        {isAllHabitsSelected && (
                          <Check className="w-4 h-4 text-[#3B4DF5] shrink-0" aria-hidden="true" />
                        )}
                      </button>

                      {selectableGoals.map((g) => {
                        const prog = calculateGoalProgress(g, now);
                        const isSelected =
                          !isAllHabitsSelected && g.id === selectedHabit?.id;
                        return (
                          <button
                            key={g.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              setSelectedHabitId(g.id);
                              setDropdownOpen(false);
                            }}
                            className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
                              isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <GoalIconBadge
                                iconType={g.iconType}
                                iconValue={g.iconValue}
                                colorHex={g.colorHex}
                                sizeClass="w-8 h-8"
                              />
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-900 truncate">
                                  {g.title}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {g.area} · {formatFrequencySummary(g.frequency)}
                                  {g.isArchived ? ' · Archivado' : ''}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-xs font-bold text-slate-700 tabular-nums">
                                {Math.round(prog.actualPct)}%
                              </span>
                              {isSelected && (
                                <Check className="w-4 h-4 text-[#3B4DF5]" aria-hidden="true" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Friction & Failure Analytics Panel (Single habit or All habits) */}
            {habitAnalytics && (
              <div className="space-y-4 pt-2">
                {/* Tarjeta mantenida: Días fallados / Fallos acumulados */}
                <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                      <AlertTriangle
                        className="w-4 h-4 text-rose-500 shrink-0"
                        aria-hidden="true"
                      />
                      <span>
                        {habitAnalytics.isAllHabits
                          ? 'Fallos totales (todos los hábitos)'
                          : 'Días fallados'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      de {habitAnalytics.scheduledCount} programados ·{' '}
                      {habitAnalytics.completedCount} cumplidos
                    </div>
                  </div>
                  <div className="text-right tabular-nums shrink-0">
                    <div className="font-mono text-2xl font-extrabold text-slate-900 leading-none">
                      {habitAnalytics.missedCount}
                    </div>
                    <div className="font-mono text-[11px] font-semibold text-rose-600 mt-0.5">
                      {habitAnalytics.scheduledCount > 0
                        ? `${Math.round(
                            (habitAnalytics.missedCount /
                              habitAnalytics.scheduledCount) *
                              100
                          )}% fallo`
                        : '0% fallo'}
                    </div>
                  </div>
                </div>

                {/* Única Gráfica de Barras Horizontal: Distribución de fallos (Preguntas 2 a 5) */}
                <div className="rounded-xl bg-slate-50/70 border border-slate-200/70 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        Distribución de fallos (Preguntas 2 a 5)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {habitAnalytics.isAllHabits
                          ? 'Conteo global de días por motivo registrado en tus cuestionarios.'
                          : 'Conteo de días por motivo registrado en el cuestionario.'}
                      </p>
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-slate-400 tabular-nums shrink-0">
                      {habitAnalytics.totalCategorizedSignals}{' '}
                      {habitAnalytics.totalCategorizedSignals === 1
                        ? 'registro'
                        : 'registros'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {habitAnalytics.failureDistribution.map((bar) => {
                      const widthPct =
                        bar.count > 0
                          ? Math.max(
                              10,
                              Math.round(
                                (bar.count / habitAnalytics.maxFailureBarCount) * 100
                              )
                            )
                          : 0;
                      return (
                        <div key={bar.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-slate-800 truncate">
                              {bar.emoji} {bar.title}
                            </span>
                            <span className="font-mono font-bold text-slate-900 tabular-nums shrink-0">
                              {bar.count} {bar.count === 1 ? 'día' : 'días'}
                            </span>
                          </div>
                          <div className="h-2.5 rounded-full bg-slate-200/75 overflow-hidden">
                            {bar.count > 0 && (
                              <div
                                className="h-full rounded-full transition-[width] duration-300"
                                style={{
                                  width: `${widthPct}%`,
                                  backgroundColor: bar.color,
                                }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Interpretación sencilla del fallo */}
                <div className="rounded-xl bg-indigo-50/60 border border-indigo-200/70 p-3.5 space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#3B4DF5]">
                    Resumen del fallo
                  </div>
                  <p className="text-xs font-semibold text-slate-900 leading-snug">
                    {habitAnalytics.failureSummary.headline}
                  </p>
                  {habitAnalytics.failureSummary.detail && (
                    <p className="text-xs text-slate-600 leading-snug">
                      {habitAnalytics.failureSummary.detail}
                    </p>
                  )}
                  {habitAnalytics.failureSummary.tip && (
                    <p className="text-xs text-[#3B4DF5] font-medium leading-snug pt-0.5">
                      Consejo: {habitAnalytics.failureSummary.tip}
                    </p>
                  )}
                </div>

                {/* Historial cronológico de fricción */}
                {analysisVis.showFrictionHistory && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">
                      Historial de fricción
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {habitAnalytics.events.length}{' '}
                      {habitAnalytics.events.length === 1 ? 'registro' : 'registros'}
                    </span>
                  </div>

                  {habitAnalytics.events.length === 0 ? (
                    <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-4 text-xs text-slate-500 text-center">
                      {habitAnalytics.isAllHabits
                        ? 'Aún no hay eventos de fricción o check-in registrados en tus hábitos.'
                        : 'Aún no hay eventos de fricción o check-in registrados para este hábito.'}{' '}
                      Cuando respondas el cuestionario rápido en días con omisión o baja energía, aparecerán aquí.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden">
                      {habitAnalytics.events.slice(0, 12).map((ev, idx) => (
                        <button
                          key={`${ev.dateStr}-${ev.source}-${ev.goalId || 'day'}-${idx}`}
                          type="button"
                          onClick={() => {
                            if (ev.goalId) {
                              onInspectGoal(ev.goalId, ev.dateStr);
                            } else if (selectedHabit) {
                              onInspectGoal(selectedHabit.id, ev.dateStr);
                            }
                          }}
                          className="w-full px-3.5 py-3 text-left hover:bg-slate-50/80 transition-colors space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-bold text-slate-900 tabular-nums shrink-0">
                                {formatShortSpanishDate(ev.dateStr)}
                              </span>
                              {habitAnalytics.isAllHabits && ev.goalTitle && (
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-semibold text-slate-700 truncate">
                                  {ev.goalTitle}
                                </span>
                              )}
                            </div>
                            <span
                              className={`font-semibold shrink-0 ${
                                ev.statusTone === 'done'
                                  ? 'text-emerald-600'
                                  : ev.statusTone === 'partial'
                                  ? 'text-amber-600'
                                  : 'text-rose-600'
                              }`}
                            >
                              {ev.statusLabel}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
                            {ev.energyLevel && (
                              <span>{getEnergyLevelLabel(ev.energyLevel)}</span>
                            )}
                            {ev.frictionTags && ev.frictionTags.length > 0 ? (
                              ev.frictionTags.map((tag) => (
                                <React.Fragment key={tag}>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-medium text-slate-800">
                                    {getFrictionTagLabel(tag)}
                                  </span>
                                </React.Fragment>
                              ))
                            ) : (
                              ev.obstacle && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-medium text-slate-800">
                                    {getObstacleLabel(ev.obstacle)}
                                  </span>
                                </>
                              )
                            )}
                            {ev.breakPoint && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{getBreakPointLabel(ev.breakPoint)}</span>
                              </>
                            )}
                            {ev.reaction && ev.reaction !== 'emergency_rule' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{getReactionLabel(ev.reaction)}</span>
                              </>
                            )}
                          </div>

                          {ev.note && (
                            <p className="text-xs text-slate-500 italic line-clamp-2">
                              «{ev.note}»
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                )}
              </div>
            )}
          </section>
          )}

          {/* SECCIÓN INFERIOR (Intercambiada): Estadísticas detalladas por hábito */}
          {analysisVis.showDetailedHabitStats && selectableGoals.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display text-sm sm:text-base font-bold text-slate-900">
                    Estadísticas detalladas por hábito
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Elige un hábito para consultar debajo sus métricas y gráficas.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {selectedDetailedStatsHabit && (
                    <button
                      type="button"
                      onClick={() => onInspectGoal(selectedDetailedStatsHabit.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#3B4DF5] hover:underline whitespace-nowrap px-2 py-1"
                    >
                      <span>Abrir hábito</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDetailedStatsExpanded((v) => !v)}
                    aria-expanded={detailedStatsExpanded}
                    aria-label={
                      detailedStatsExpanded
                        ? 'Minimizar estadísticas detalladas'
                        : 'Expandir estadísticas detalladas'
                    }
                    title={
                      detailedStatsExpanded
                        ? 'Minimizar estadísticas'
                        : 'Mostrar estadísticas'
                    }
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors shrink-0"
                  >
                    {detailedStatsExpanded ? (
                      <ChevronUp className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setStatsDropdownOpen((o) => !o)}
                  aria-expanded={statsDropdownOpen}
                  aria-haspopup="listbox"
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/90 flex items-center justify-between gap-3 text-left transition-colors"
                >
                  {selectedDetailedStatsHabit ? (
                    <div className="flex items-center gap-3 min-w-0">
                      <GoalIconBadge
                        iconType={selectedDetailedStatsHabit.iconType}
                        iconValue={selectedDetailedStatsHabit.iconValue}
                        colorHex={selectedDetailedStatsHabit.colorHex}
                        sizeClass="w-8 h-8"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">
                          {selectedDetailedStatsHabit.title}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {formatFrequencySummary(selectedDetailedStatsHabit.frequency)}
                          {selectedDetailedStatsHabit.isArchived ? ' · Archivado' : ''}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-500 font-medium">
                      Seleccionar hábito para ver estadísticas...
                    </span>
                  )}
                  <ChevronDown
                    className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${
                      statsDropdownOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>

                {statsDropdownOpen && (
                  <div
                    role="listbox"
                    aria-label="Seleccionar hábito para estadísticas detalladas"
                    className="mt-2 rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 max-h-64 overflow-y-auto shadow-md"
                  >
                    {selectableGoals.map((g) => {
                      const prog = calculateGoalProgress(g, now);
                      const isSelected = g.id === selectedDetailedStatsHabit?.id;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            setDetailedStatsHabitId(g.id);
                            setStatsDropdownOpen(false);
                            setDetailedStatsExpanded(true);
                          }}
                          className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
                            isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <GoalIconBadge
                              iconType={g.iconType}
                              iconValue={g.iconValue}
                              colorHex={g.colorHex}
                              sizeClass="w-8 h-8"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900 truncate">
                                {g.title}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {g.area} · {formatFrequencySummary(g.frequency)}
                                {g.isArchived ? ' · Archivado' : ''}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-xs font-bold text-slate-700 tabular-nums">
                              {Math.round(prog.actualPct)}%
                            </span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-[#3B4DF5]" aria-hidden="true" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {detailedStatsExpanded && selectedDetailedStatsHabit && (
                <div className="rounded-2xl bg-[#F7F7FA] border border-slate-200/70 p-3 sm:p-4">
                  <HabitDetailedStatsContent
                    key={selectedDetailedStatsHabit.id}
                    goal={selectedDetailedStatsHabit}
                    now={now}
                  />
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Detailed Habit Statistics Modal (Photo 1) */}
      {detailedStatsGoal && (
        <HabitDetailedStatsModal
          goal={detailedStatsGoal}
          now={now}
          onClose={() => setDetailedStatsGoal(null)}
          onInspectGoal={onInspectGoal}
        />
      )}
    </div>
  );
};
