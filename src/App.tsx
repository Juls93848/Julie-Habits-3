import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  BarChart2,
  BarChart3,
  BellRing,
  CalendarClock,
  CalendarDays,
  Download,
  LayoutGrid,
  ListChecks,
  Plus,
  Settings,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import {
  AppSettings,
  DailyQuizResponse,
  DailyReportSummary,
  Goal,
  PRESET_AREAS,
} from './types/tracker';
import { createInitialGoals } from './data/presets';
import {
  addDays,
  buildPhaseRecordFromGoal,
  calculateGlobalProgress,
  formatPermanentCycleLabel,
  formatQuantity,
  getDayCompletionStats,
  getEffectiveTarget,
  getPermanentCycleDays,
  isDateScheduledForGoal,
  isPhaseCompletedPromptNeeded,
  renewPermanentGoalCycleIfNeeded,
  toLocalDateStr,
} from './utils/paceEngine';
import {
  getMascotStage,
  launchCanvasConfetti,
  pickMotivationalPhrase,
  playVictoryChime,
} from './utils/gamification';
import { buildDailyReport, sendBrowserNotification } from './utils/dailyReport';
import {
  buildMonthlyReport,
  getMonthKey,
  getPreviousMonth,
} from './utils/monthlyReport';
import {
  getConsecutiveSkipsCount,
  getGoalsWithDiagnostic,
} from './utils/diagnosticEngine';
import {
  createBackupPayload,
  downloadJsonBackup,
  exportHabitsToExcel,
  isWeeklyBackupDue,
  ParsedBackupPreview,
} from './utils/backupAndExport';
import { MatrixGridView } from './components/MatrixGridView';
import { DailyChecklistView } from './components/DailyChecklistView';
import { GoalsListView } from './components/GoalsListView';
import {
  ReportsAnalyticsView,
  ReportsSubTab,
} from './components/ReportsAnalyticsView';
import { GoalBuilderModal } from './components/GoalBuilderModal';
import { MascotSettingsModal } from './components/MascotSettingsModal';
import { MascotViewerModal } from './components/MascotViewerModal';
import { CounterModal } from './components/CounterModal';
import { HabitDetailView } from './components/HabitDetailView';
import { HabitDetailedStatsModal } from './components/HabitDetailedStatsModal';
import { DailyReportModal } from './components/DailyReportModal';
import { MonthlyReportModal } from './components/MonthlyReportModal';
import { WeeklyReportModal } from './components/WeeklyReportModal';
import {
  buildWeeklyReport,
  getISOWeekInfo,
  sendFridayAnticipationNotification,
  shouldTriggerFridayAnticipation,
} from './utils/weeklyReport';
import { EvolveGoalPayload, HabitEvolveModal } from './components/HabitEvolveModal';
import {
  IndividualQuizQueueItem,
  QuickCheckInQuizModal,
} from './components/QuickCheckInQuizModal';

const GOALS_STORAGE_KEY = 'ritmo_goals_v3';
const SETTINGS_STORAGE_KEY = 'ritmo_settings_v2';
const LAST_REPORT_DATE_KEY = 'ritmo_last_report_date_v1';
const LAST_WEEKLY_REPORT_KEY = 'ritmo_last_weekly_report_v1';
const LAST_MONTHLY_REPORT_KEY = 'ritmo_last_monthly_report_v1';
const FRIDAY_ANTICIPATION_DISMISSED_KEY = 'ritmo_friday_anticipation_date_v1';
const DAILY_NOTES_STORAGE_KEY = 'ritmo_daily_notes_v1';
const DAILY_QUIZ_STORAGE_KEY = 'ritmo_daily_quiz_v1';
const CLOSED_DAYS_STORAGE_KEY = 'ritmo_closed_days_v1';
const AREAS_STORAGE_KEY = 'ritmo_areas_v1';

type ActiveView = 'today' | 'grid' | 'goals' | 'reports';

interface QuizSessionState {
  dateStr: string;
  initialDayMode: boolean;
  incompleteGoalsForDay: Goal[];
  habitQueue: IndividualQuizQueueItem[];
  openReportAfter: boolean;
}

function loadGoals(): Goal[] {
  const todayStr = toLocalDateStr(new Date());
  try {
    const raw = localStorage.getItem(GOALS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((g: Partial<Goal>) => {
          const normalized: Goal = {
            ...(g as Goal),
            area: g.area || 'Personal',
            habitType: g.habitType || 'build',
            trackingMode: g.trackingMode || 'boolean',
            dailyTarget: g.dailyTarget || 1,
            tapAction: g.tapAction || 'add_1',
            colorHex: g.colorHex || '#3B4DF5',
            iconType: g.iconType || 'icon',
            iconValue: g.iconValue || 'activity',
            frequency: g.frequency || { type: 'everyday' },
            trackPace: Boolean(g.trackPace),
            phaseNumber: g.phaseNumber || 1,
            isPermanent: Boolean(g.isPermanent),
            permanentCycleDays: getPermanentCycleDays(g),
            isArchived: Boolean(g.isArchived),
            phaseHistory: Array.isArray(g.phaseHistory) ? g.phaseHistory : [],
            completions: g.completions || {},
            notes: g.notes || {},
            skipped: g.skipped || {},
            quizLogs: g.quizLogs || {},
          };
          return renewPermanentGoalCycleIfNeeded(normalized, todayStr);
        });
      }
    }
  } catch {
    // Fallback
  }
  return createInitialGoals();
}

function getDefaultSettings(): AppSettings {
  return {
    mascotTrackId: 'horse',
    soundEnabled: true,
    gridDaysMode: 'last_5',
    weeklyStatsMode: 'full_week',
    analysisVisibility: {
      showGlobalChart: true,
      showFrictionDetail: true,
      showFrictionHistory: true,
      showDetailedHabitStats: true,
    },
    dailyReportEnabled: true,
    dailyReportHour: 22,
    fridayAnticipationEnabled: true,
    weeklyBackupReminderEnabled: false,
  };
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.mascotTrackId) {
        return {
          mascotTrackId: parsed.mascotTrackId,
          soundEnabled: parsed.soundEnabled ?? true,
          gridDaysMode: parsed.gridDaysMode || 'last_5',
          weeklyStatsMode:
            parsed.weeklyStatsMode === 'last_7' || parsed.weeklyStatsMode === 'full_week'
              ? parsed.weeklyStatsMode
              : 'full_week',
          dailyReportEnabled: parsed.dailyReportEnabled ?? true,
          dailyReportHour:
            typeof parsed.dailyReportHour === 'number' ? parsed.dailyReportHour : 22,
          fridayAnticipationEnabled:
            parsed.fridayAnticipationEnabled !== undefined
              ? Boolean(parsed.fridayAnticipationEnabled)
              : true,
          weeklyBackupReminderEnabled: Boolean(parsed.weeklyBackupReminderEnabled),
          lastBackupAt:
            typeof parsed.lastBackupAt === 'string' ? parsed.lastBackupAt : undefined,
          backupReminderDismissedDate:
            typeof parsed.backupReminderDismissedDate === 'string'
              ? parsed.backupReminderDismissedDate
              : undefined,
          analysisVisibility: {
            showGlobalChart:
              parsed.analysisVisibility?.showGlobalChart !== undefined
                ? Boolean(parsed.analysisVisibility.showGlobalChart)
                : true,
            showFrictionDetail:
              parsed.analysisVisibility?.showFrictionDetail !== undefined
                ? Boolean(parsed.analysisVisibility.showFrictionDetail)
                : true,
            showFrictionHistory:
              parsed.analysisVisibility?.showFrictionHistory !== undefined
                ? Boolean(parsed.analysisVisibility.showFrictionHistory)
                : true,
            showDetailedHabitStats:
              parsed.analysisVisibility?.showDetailedHabitStats !== undefined
                ? Boolean(parsed.analysisVisibility.showDetailedHabitStats)
                : true,
          },
        };
      }
    }
  } catch {
    // Fallback
  }
  return getDefaultSettings();
}

function loadDailyNotes(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DAILY_NOTES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, string>;
      }
    }
  } catch {
    // Fallback
  }
  return {};
}

function loadDailyQuizLogs(): Record<string, DailyQuizResponse> {
  try {
    const raw = localStorage.getItem(DAILY_QUIZ_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, DailyQuizResponse>;
      }
    }
  } catch {
    // Fallback
  }
  return {};
}

function loadClosedDays(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CLOSED_DAYS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, string>;
      }
    }
  } catch {
    // Fallback
  }
  return {};
}

function loadPresetAreas(initialGoals: Goal[]): string[] {
  let base: string[] = [...PRESET_AREAS];
  try {
    const raw = localStorage.getItem(AREAS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed
          .filter((item): item is string => typeof item === 'string')
          .map((s) => s.trim())
          .filter(Boolean);
        if (cleaned.length > 0) {
          base = cleaned;
        }
      }
    }
  } catch {
    // Fallback
  }

  const seen = new Set(base.map((a) => a.toLowerCase()));
  for (const g of initialGoals) {
    const area = (g.area || '').trim();
    if (area && !seen.has(area.toLowerCase())) {
      base.push(area);
      seen.add(area.toLowerCase());
    }
  }
  return base;
}

export default function App() {
  const [goals, setGoals] = useState<Goal[]>(() => loadGoals());
  const [presetAreas, setPresetAreas] = useState<string[]>(() =>
    loadPresetAreas(loadGoals())
  );
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [dailyNotes, setDailyNotes] = useState<Record<string, string>>(() =>
    loadDailyNotes()
  );
  const [dailyQuizLogs, setDailyQuizLogs] = useState<Record<string, DailyQuizResponse>>(
    () => loadDailyQuizLogs()
  );
  const [activeView, setActiveView] = useState<ActiveView>('today');
  const [now, setNow] = useState<Date>(() => new Date());

  const todayStr = toLocalDateStr(now);
  const [windowEndDate, setWindowEndDate] = useState<string>(todayStr);
  const [selectedDay, setSelectedDay] = useState<string>(todayStr);

  const [inspectedState, setInspectedState] = useState<{
    goalId: string;
    initialDate?: string;
  } | null>(null);
  const [counterModalState, setCounterModalState] = useState<{
    goalId: string;
    dateStr: string;
  } | null>(null);

  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [evolvingGoalId, setEvolvingGoalId] = useState<string | null>(null);
  const [mascotModalOpen, setMascotModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [reportModalDate, setReportModalDate] = useState<string | null>(null);
  const [weeklyReportAnchorDate, setWeeklyReportAnchorDate] = useState<string | null>(
    null
  );
  const [weeklyReadyBanner, setWeeklyReadyBanner] = useState<{
    anchorDate: string;
    weekKey: string;
    weekOfYear: number;
  } | null>(null);
  const [fridayAnticipationBanner, setFridayAnticipationBanner] = useState<boolean>(
    false
  );
  const [monthlyReportTarget, setMonthlyReportTarget] = useState<{
    year: number;
    month: number;
  } | null>(null);
  const [monthlyReadyBanner, setMonthlyReadyBanner] = useState<{
    year: number;
    month: number;
    monthKey: string;
    monthTitle: string;
  } | null>(null);
  const [notificationBanner, setNotificationBanner] =
    useState<DailyReportSummary | null>(null);
  const [reportsSubTab, setReportsSubTab] = useState<ReportsSubTab>('analysis');
  const [detailedStatsGoal, setDetailedStatsGoal] = useState<Goal | null>(null);
  const [reportPickerOpen, setReportPickerOpen] = useState(false);
  const reportPickerRef = useRef<HTMLDivElement | null>(null);
  const [quizSession, setQuizSession] = useState<QuizSessionState | null>(null);
  const [closedDays, setClosedDays] = useState<Record<string, string>>(() =>
    loadClosedDays()
  );
  const [dismissedDiagnostics, setDismissedDiagnostics] = useState<
    Record<string, number>
  >({});
  const [dismissedPhaseNotices, setDismissedPhaseNotices] = useState<
    Record<string, string>
  >({});

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!reportPickerOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (
        reportPickerRef.current &&
        !reportPickerRef.current.contains(e.target as Node)
      ) {
        setReportPickerOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReportPickerOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [reportPickerOpen]);

  // Auto-renew monthly cycles for permanent habits when a new day starts
  useEffect(() => {
    setGoals((prev) => {
      let changed = false;
      const next = prev.map((g) => {
        const renewed = renewPermanentGoalCycleIfNeeded(g, todayStr);
        if (renewed !== g) changed = true;
        return renewed;
      });
      return changed ? next : prev;
    });
  }, [todayStr]);

  // Automatic daily 10:00 PM (configurable) report notification trigger
  useEffect(() => {
    const nonArchivedGoals = goals.filter((g) => !g.isArchived);
    if (!settings.dailyReportEnabled || nonArchivedGoals.length === 0) return;
    const currentDateStr = toLocalDateStr(now);
    const currentHour = now.getHours();
    if (currentHour < settings.dailyReportHour) return;

    try {
      const lastSent = localStorage.getItem(LAST_REPORT_DATE_KEY);
      if (lastSent === currentDateStr) return;
      localStorage.setItem(LAST_REPORT_DATE_KEY, currentDateStr);
    } catch {
      // Ignore storage failures
    }

    const report = buildDailyReport(
      nonArchivedGoals,
      currentDateStr,
      dailyNotes,
      dailyQuizLogs
    );
    setNotificationBanner(report);
    sendBrowserNotification(report);
    if (settings.soundEnabled) {
      playVictoryChime('day');
    }
  }, [
    now,
    goals,
    dailyNotes,
    dailyQuizLogs,
    settings.dailyReportEnabled,
    settings.dailyReportHour,
    settings.soundEnabled,
  ]);

  // Monthly report prompt when previous month finished (or last day of current month >= reportHour)
  useEffect(() => {
    if (goals.length === 0) return;
    let lastViewedMonth = '';
    try {
      lastViewedMonth = localStorage.getItem(LAST_MONTHLY_REPORT_KEY) || '';
    } catch {
      // Ignore
    }

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isLastDayOfMonthTonight =
      tomorrow.getMonth() !== now.getMonth() &&
      now.getHours() >= settings.dailyReportHour;

    const candidate = isLastDayOfMonthTonight
      ? { year: now.getFullYear(), month: now.getMonth() }
      : getPreviousMonth(now.getFullYear(), now.getMonth());
    const candidateKey = getMonthKey(candidate.year, candidate.month);

    if (lastViewedMonth === candidateKey) return;

    const summary = buildMonthlyReport(
      goals,
      candidate.year,
      candidate.month,
      todayStr,
      dailyQuizLogs
    );

    if (summary.totalScheduledCount > 0 && summary.totalCompletedCount > 0) {
      setMonthlyReadyBanner({
        year: candidate.year,
        month: candidate.month,
        monthKey: candidateKey,
        monthTitle: summary.monthTitle,
      });
    }
  }, [now, todayStr, goals, dailyQuizLogs, settings.dailyReportHour]);

  // Weekly report prompt on Sunday (or previous week if not yet viewed)
  useEffect(() => {
    const active = goals.filter((g) => !g.isArchived);
    if (active.length === 0) return;

    let lastViewedWeek = '';
    try {
      lastViewedWeek = localStorage.getItem(LAST_WEEKLY_REPORT_KEY) || '';
    } catch {
      // Ignore
    }

    const isSundayEvening =
      now.getDay() === 0 && now.getHours() >= settings.dailyReportHour;
    const candidateAnchor = isSundayEvening ? todayStr : addDays(todayStr, -7);
    const isoInfo = getISOWeekInfo(candidateAnchor);
    const candidateKey = `${isoInfo.isoYear}-W${String(isoInfo.weekOfYear).padStart(
      2,
      '0'
    )}`;

    if (lastViewedWeek === candidateKey) return;

    // Only prompt automatically on Sunday evening or Monday for the just-finished week
    if (!isSundayEvening && now.getDay() !== 1) return;

    const summary = buildWeeklyReport(
      active,
      candidateAnchor,
      todayStr,
      settings.weeklyStatsMode ?? 'full_week',
      dailyQuizLogs
    );

    if (summary.totalCompletedActions > 0) {
      setWeeklyReadyBanner({
        anchorDate: candidateAnchor,
        weekKey: summary.weekKey,
        weekOfYear: summary.weekOfYear,
      });
    }
  }, [
    now,
    todayStr,
    goals,
    dailyQuizLogs,
    settings.dailyReportHour,
    settings.weeklyStatsMode,
  ]);

  // "Viernes de Anticipación" (Optional Friday >= 17:00 preview banner + notification)
  useEffect(() => {
    const active = goals.filter((g) => !g.isArchived);
    if (active.length === 0) {
      setFridayAnticipationBanner(false);
      return;
    }

    let dismissedDate: string | null = null;
    try {
      dismissedDate = localStorage.getItem(FRIDAY_ANTICIPATION_DISMISSED_KEY);
    } catch {
      // Ignore
    }

    const shouldShow = shouldTriggerFridayAnticipation(
      now,
      settings.fridayAnticipationEnabled ?? true,
      dismissedDate
    );
    setFridayAnticipationBanner(shouldShow);

    if (shouldShow) {
      try {
        const notifKey = `ritmo_friday_notif_${todayStr}`;
        if (!localStorage.getItem(notifKey)) {
          localStorage.setItem(notifKey, '1');
          sendFridayAnticipationNotification();
        }
      } catch {
        // Ignore
      }
    }
  }, [now, todayStr, goals, settings.fridayAnticipationEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
    } catch {
      // Ignore
    }
  }, [goals]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(DAILY_NOTES_STORAGE_KEY, JSON.stringify(dailyNotes));
    } catch {
      // Ignore
    }
  }, [dailyNotes]);

  useEffect(() => {
    try {
      localStorage.setItem(DAILY_QUIZ_STORAGE_KEY, JSON.stringify(dailyQuizLogs));
    } catch {
      // Ignore
    }
  }, [dailyQuizLogs]);

  useEffect(() => {
    try {
      localStorage.setItem(CLOSED_DAYS_STORAGE_KEY, JSON.stringify(closedDays));
    } catch {
      // Ignore
    }
  }, [closedDays]);

  useEffect(() => {
    try {
      localStorage.setItem(AREAS_STORAGE_KEY, JSON.stringify(presetAreas));
    } catch {
      // Ignore
    }
  }, [presetAreas]);

  const activeGoals = useMemo(
    () => goals.filter((g) => !g.isArchived),
    [goals]
  );

  const areaCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of activeGoals) {
      const area = g.area || 'Personal';
      counts[area] = (counts[area] || 0) + 1;
    }
    return counts;
  }, [activeGoals]);

  const globalProgress = useMemo(
    () => calculateGlobalProgress(activeGoals, now),
    [activeGoals, now]
  );

  const globalMascot = useMemo(
    () => getMascotStage(settings.mascotTrackId, globalProgress.actualPct),
    [settings.mascotTrackId, globalProgress.actualPct]
  );

  const inspectedGoal = useMemo(
    () => (inspectedState ? goals.find((g) => g.id === inspectedState.goalId) ?? null : null),
    [goals, inspectedState]
  );

  const evolvingGoal = useMemo(
    () => (evolvingGoalId ? goals.find((g) => g.id === evolvingGoalId) ?? null : null),
    [goals, evolvingGoalId]
  );

  const counterModalGoal = useMemo(
    () =>
      counterModalState
        ? goals.find((g) => g.id === counterModalState.goalId) ?? null
        : null,
    [goals, counterModalState]
  );

  const selectedDayDiagnostics = useMemo(() => {
    const includeReferenceDayIfIncomplete =
      selectedDay < todayStr || now.getHours() >= settings.dailyReportHour;
    return getGoalsWithDiagnostic(
      activeGoals,
      selectedDay,
      includeReferenceDayIfIncomplete,
      dailyQuizLogs
    ).filter((diag) => dismissedDiagnostics[diag.goal.id] !== diag.consecutiveSkips);
  }, [
    activeGoals,
    selectedDay,
    todayStr,
    now,
    settings.dailyReportHour,
    dailyQuizLogs,
    dismissedDiagnostics,
  ]);

  const finishedPhaseGoals = useMemo(
    () =>
      activeGoals.filter(
        (g) =>
          isPhaseCompletedPromptNeeded(g, todayStr) &&
          dismissedPhaseNotices[g.id] !== g.deadlineDate
      ),
    [activeGoals, todayStr, dismissedPhaseNotices]
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2600);
  };

  const weeklyBackupDue = useMemo(
    () => isWeeklyBackupDue(settings, todayStr),
    [settings, todayStr]
  );

  const handleExportJsonBackup = () => {
    const payload = createBackupPayload({
      goals,
      settings,
      dailyNotes,
      dailyQuizLogs,
      closedDays,
      presetAreas,
    });
    downloadJsonBackup(payload, todayStr);
    const nowIso = new Date().toISOString();
    setSettings((prev) => ({
      ...prev,
      lastBackupAt: nowIso,
      backupReminderDismissedDate: todayStr,
    }));
    showToast('Copia de seguridad descargada');
  };

  const handleImportJsonBackup = (preview: ParsedBackupPreview) => {
    const { payload } = preview;
    const restoredGoals = payload.goals.map((g) =>
      renewPermanentGoalCycleIfNeeded(g, todayStr)
    );
    setGoals(restoredGoals);
    if (payload.dailyNotes) setDailyNotes(payload.dailyNotes);
    if (payload.dailyQuizLogs) setDailyQuizLogs(payload.dailyQuizLogs);
    if (payload.closedDays) setClosedDays(payload.closedDays);
    if (payload.presetAreas && payload.presetAreas.length > 0) {
      setPresetAreas(payload.presetAreas);
    }
    if (payload.settings) {
      setSettings((prev) => ({
        ...prev,
        ...payload.settings,
      }));
    }
    setInspectedState(null);
    setSettingsModalOpen(false);
    showToast(
      `Respaldo restaurado (${restoredGoals.length} ${
        restoredGoals.length === 1 ? 'hábito' : 'hábitos'
      })`
    );
  };

  const handleExportExcel = () => {
    exportHabitsToExcel({
      goals,
      dailyNotes,
      dailyQuizLogs,
      now,
    });
    showToast('Archivo Excel (.xlsx) descargado');
  };

  const handleResetAllData = () => {
    setGoals([]);
    setDailyNotes({});
    setDailyQuizLogs({});
    setClosedDays({});
    setDismissedDiagnostics({});
    setPresetAreas([...PRESET_AREAS]);
    setSettings(getDefaultSettings());
    setInspectedState(null);
    setDetailedStatsGoal(null);
    setNotificationBanner(null);
    setWeeklyReadyBanner(null);
    setMonthlyReadyBanner(null);
    setFridayAnticipationBanner(false);
    setSettingsModalOpen(false);
    setActiveView('today');
    try {
      localStorage.removeItem(LAST_REPORT_DATE_KEY);
      localStorage.removeItem(LAST_WEEKLY_REPORT_KEY);
      localStorage.removeItem(LAST_MONTHLY_REPORT_KEY);
      localStorage.removeItem(FRIDAY_ANTICIPATION_DISMISSED_KEY);
    } catch {
      // Ignore
    }
    showToast('Toda la información ha sido restablecida');
  };

  const handleUpdateProgress = (
    goalId: string,
    dateStr: string,
    nextValue: number,
    event?: React.MouseEvent
  ) => {
    const targetGoal = goals.find((g) => g.id === goalId);
    if (!targetGoal) return;

    const prevValue = Number(targetGoal.completions[dateStr] || 0);
    const isIncreasing = nextValue > prevValue;
    const beforeEmoji = globalMascot.emoji;

    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        const nextSkipped = { ...(g.skipped || {}) };
        if (nextValue > 0) {
          delete nextSkipped[dateStr];
        }
        return {
          ...g,
          completions: {
            ...g.completions,
            [dateStr]: nextValue,
          },
          skipped: nextSkipped,
        };
      })
    );

    if (isIncreasing) {
      const target = getEffectiveTarget(targetGoal);
      const prevRatio = Math.min(1, prevValue / target);
      const nextRatio = Math.min(1, nextValue / target);
      const unitDelta = Math.max(0, nextRatio - prevRatio);

      const projectedGlobalPct =
        globalProgress.totalUnits > 0
          ? ((globalProgress.completedUnits + unitDelta) / globalProgress.totalUnits) * 100
          : 0;
      const afterStage = getMascotStage(settings.mascotTrackId, projectedGlobalPct);
      const evolved = afterStage.emoji !== beforeEmoji;
      const reachedTarget = nextValue >= target && prevValue < target;

      if (settings.soundEnabled) {
        playVictoryChime(evolved ? 'evolve' : reachedTarget ? 'day' : 'check');
      }

      let xRatio = 0.5;
      let yRatio = 0.45;
      if (event && confettiCanvasRef.current) {
        const rect = confettiCanvasRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          xRatio = Math.min(0.92, Math.max(0.08, event.clientX / rect.width));
          yRatio = Math.min(0.92, Math.max(0.08, event.clientY / rect.height));
        }
      }
      launchCanvasConfetti(confettiCanvasRef.current, xRatio, yRatio, evolved ? 42 : 24);

      showToast(
        evolved
          ? `¡Tu mascota evolucionó! ${afterStage.emoji} ${afterStage.label}`
          : pickMotivationalPhrase(false)
      );
    }
  };

  const handleSaveNote = (goalId: string, dateStr: string, noteText: string) => {
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        const nextNotes = { ...(g.notes || {}) };
        if (noteText.trim().length > 0) {
          nextNotes[dateStr] = noteText.trim();
        } else {
          delete nextNotes[dateStr];
        }
        return { ...g, notes: nextNotes };
      })
    );
  };

  const handleAddArea = (name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const exists = presetAreas.some(
      (a) => a.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) return false;
    setPresetAreas((prev) => [...prev, trimmed]);
    return true;
  };

  const handleRenameArea = (oldName: string, newName: string): boolean => {
    const trimmed = newName.trim();
    if (!trimmed) return false;
    const collision = presetAreas.some(
      (a) => a !== oldName && a.toLowerCase() === trimmed.toLowerCase()
    );
    if (collision) return false;
    setPresetAreas((prev) => prev.map((a) => (a === oldName ? trimmed : a)));
    setGoals((prev) =>
      prev.map((g) => (g.area === oldName ? { ...g, area: trimmed } : g))
    );
    return true;
  };

  const handleDeleteArea = (name: string) => {
    if (presetAreas.length <= 1) return;
    const nextAreas = presetAreas.filter((a) => a !== name);
    const fallbackArea = nextAreas[0] || 'Personal';
    setPresetAreas(nextAreas);
    setGoals((prev) =>
      prev.map((g) =>
        (g.area || 'Personal') === name ? { ...g, area: fallbackArea } : g
      )
    );
  };

  const handleSaveGoal = (savedGoal: Goal) => {
    const cleanArea = (savedGoal.area || '').trim();
    if (cleanArea) {
      handleAddArea(cleanArea);
    }
    const finalGoal = savedGoal.isPermanent
      ? renewPermanentGoalCycleIfNeeded(savedGoal, todayStr)
      : savedGoal;
    setGoals((prev) => {
      const exists = prev.some((g) => g.id === finalGoal.id);
      if (exists) {
        return prev.map((g) => (g.id === finalGoal.id ? finalGoal : g));
      }
      return [...prev, finalGoal];
    });
    setGoalModalOpen(false);
    setEditingGoal(null);
  };

  const handleDeleteGoal = (goalId: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== goalId));
    setInspectedState(null);
  };

  const handleReorderHabits = (reorderedVisibleIds: string[]) => {
    setGoals((prev) => {
      const visibleSet = new Set(reorderedVisibleIds);
      const activeList = prev.filter((g) => !g.isArchived);
      const activeById = new Map(activeList.map((g) => [g.id, g]));
      let cursor = 0;
      const nextActive = activeList.map((g) => {
        if (!visibleSet.has(g.id)) return g;
        const nextId = reorderedVisibleIds[cursor++];
        return activeById.get(nextId) || g;
      });
      const archivedList = prev.filter((g) => Boolean(g.isArchived));
      return [...nextActive, ...archivedList];
    });
  };

  const handleConfirmEvolveGoal = (goalId: string, payload: EvolveGoalPayload) => {
    const target = goals.find((g) => g.id === goalId);
    if (!target) return;

    const nextPhaseNumber = (target.phaseNumber || 1) + 1;
    const snapshot = buildPhaseRecordFromGoal(
      target,
      payload.isPermanent ? 'permanent' : 'evolved',
      todayStr
    );

    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        return {
          ...g,
          title: payload.title,
          frequency: payload.frequency,
          dailyTarget: payload.dailyTarget,
          startDate: todayStr,
          deadlineDate: payload.deadlineDate,
          phaseNumber: nextPhaseNumber,
          isPermanent: payload.isPermanent,
          permanentCycleDays: payload.isPermanent
            ? payload.permanentCycleDays
            : g.permanentCycleDays,
          isArchived: false,
          phaseHistory: [...(g.phaseHistory || []), snapshot],
        };
      })
    );

    setEvolvingGoalId(null);
    if (settings.soundEnabled) {
      playVictoryChime('evolve');
    }
    launchCanvasConfetti(confettiCanvasRef.current, 0.5, 0.45, 36);
    showToast(`¡Hábito evolucionado a Fase ${nextPhaseNumber}!`);
  };

  const handleMakeGoalPermanent = (goalId: string, cycleDays = 30) => {
    const target = goals.find((g) => g.id === goalId);
    if (!target) return;

    const safeDays = Math.max(1, Math.min(365, Math.round(cycleDays || 30)));
    const shouldRollCycle = todayStr >= target.deadlineDate;
    const snapshot = shouldRollCycle
      ? buildPhaseRecordFromGoal(target, 'permanent', todayStr)
      : null;

    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        const nextStart = shouldRollCycle ? todayStr : g.startDate;
        const rawUpdated: Goal = {
          ...g,
          isPermanent: true,
          permanentCycleDays: safeDays,
          isArchived: false,
          phaseNumber: shouldRollCycle ? (g.phaseNumber || 1) + 1 : g.phaseNumber || 1,
          startDate: nextStart,
          deadlineDate: addDays(nextStart, safeDays - 1),
          phaseHistory: snapshot
            ? [...(g.phaseHistory || []), snapshot]
            : g.phaseHistory || [],
        };
        return renewPermanentGoalCycleIfNeeded(rawUpdated, todayStr);
      })
    );

    if (settings.soundEnabled) {
      playVictoryChime('day');
    }
    showToast(`Hábito permanente · ${formatPermanentCycleLabel(safeDays)}`);
  };

  const handleUpdatePermanentCycle = (goalId: string, cycleDays: number) => {
    const safeDays = Math.max(1, Math.min(365, Math.round(cycleDays || 30)));
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        const updated: Goal = {
          ...g,
          isPermanent: true,
          permanentCycleDays: safeDays,
          deadlineDate: addDays(g.startDate, safeDays - 1),
        };
        return renewPermanentGoalCycleIfNeeded(updated, todayStr);
      })
    );
    showToast(`Ciclos actualizados: ${formatPermanentCycleLabel(safeDays)}`);
  };

  const handleArchiveGoal = (goalId: string) => {
    const target = goals.find((g) => g.id === goalId);
    if (!target) return;

    const snapshot = buildPhaseRecordFromGoal(target, 'archived', todayStr);
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? {
              ...g,
              isArchived: true,
              phaseHistory: [...(g.phaseHistory || []), snapshot],
            }
          : g
      )
    );
    setInspectedState(null);
    showToast(`"${target.title}" archivado en tu historial`);
  };

  const handleUnarchiveGoal = (goalId: string) => {
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        const needsFreshWindow = todayStr > g.deadlineDate;
        const cycleDays = getPermanentCycleDays(g);
        return {
          ...g,
          isArchived: false,
          startDate: needsFreshWindow ? todayStr : g.startDate,
          deadlineDate: needsFreshWindow
            ? addDays(todayStr, g.isPermanent ? cycleDays - 1 : 13)
            : g.deadlineDate,
        };
      })
    );
    showToast('Hábito reactivado');
  };

  const handleUpdateSettings = (patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleInspectGoal = (goalId: string, initialDate?: string) => {
    setInspectedState({ goalId, initialDate });
  };

  const handleCloseDay = (dateStr: string) => {
    const alreadyClosed = Boolean(closedDays[dateStr]);
    const report = buildDailyReport(activeGoals, dateStr, dailyNotes, dailyQuizLogs);

    if (!alreadyClosed) {
      setClosedDays((prev) => ({
        ...prev,
        [dateStr]: new Date().toISOString(),
      }));
      if (report.completedCount > 0) {
        if (settings.soundEnabled) {
          playVictoryChime('day');
        }
        launchCanvasConfetti(confettiCanvasRef.current, 0.5, 0.55, 34);
      }
      showToast(
        report.totalCount > 0
          ? `Día cerrado · ${report.completedCount}/${report.totalCount} completados (${report.totalPct}%)`
          : 'Día cerrado'
      );
    }
    setReportModalDate(null);
  };

  const handleSaveDailyNote = (dateStr: string, noteText: string) => {
    setDailyNotes((prev) => {
      const next = { ...prev };
      if (noteText.trim().length > 0) {
        next[dateStr] = noteText.trim();
      } else {
        delete next[dateStr];
      }
      return next;
    });
  };

  const handleSaveDailyQuiz = (dateStr: string, response: DailyQuizResponse) => {
    setDailyQuizLogs((prev) => ({
      ...prev,
      [dateStr]: response,
    }));
  };

  const handleSaveHabitQuiz = (
    goalId: string,
    dateStr: string,
    response: DailyQuizResponse
  ) => {
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        return {
          ...g,
          quizLogs: {
            ...(g.quizLogs || {}),
            [dateStr]: response,
          },
        };
      })
    );
  };

  const handleMarkSkipped = (goalId: string, dateStr: string) => {
    const targetGoal = goals.find((g) => g.id === goalId);
    if (!targetGoal) return;

    const currentlySkipped =
      Boolean(targetGoal.skipped?.[dateStr]) &&
      Number(targetGoal.completions[dateStr] || 0) === 0;

    if (currentlySkipped) {
      setGoals((prev) =>
        prev.map((g) => {
          if (g.id !== goalId) return g;
          const nextSkipped = { ...(g.skipped || {}) };
          delete nextSkipped[dateStr];
          return { ...g, skipped: nextSkipped };
        })
      );
      showToast('Hábito reactivado hoy');
      return;
    }

    const updatedGoal: Goal = {
      ...targetGoal,
      completions: {
        ...targetGoal.completions,
        [dateStr]: 0,
      },
      skipped: {
        ...(targetGoal.skipped || {}),
        [dateStr]: true,
      },
    };

    setGoals((prev) => prev.map((g) => (g.id === goalId ? updatedGoal : g)));

    // Mandatory individual quiz if this habit reaches 4+ consecutive days without doing it
    const consecutiveSkips = getConsecutiveSkipsCount(updatedGoal, dateStr, true);
    if (consecutiveSkips >= 4 && !updatedGoal.quizLogs?.[dateStr]) {
      setQuizSession({
        dateStr,
        initialDayMode: false,
        incompleteGoalsForDay: [],
        habitQueue: [
          {
            goal: updatedGoal,
            mandatory: true,
            consecutiveSkips,
          },
        ],
        openReportAfter: false,
      });
    } else {
      showToast('Hábito omitido hoy');
    }
  };

  const openDailyCheckInOrReport = (dateStr: string) => {
    const incompleteScheduledGoals = activeGoals.filter((g) => {
      if (!isDateScheduledForGoal(g, dateStr)) return false;
      return !getDayCompletionStats(g, dateStr).isDone;
    });

    const mandatoryHabitQueue: IndividualQuizQueueItem[] = [];
    for (const g of incompleteScheduledGoals) {
      if (g.quizLogs?.[dateStr]) continue;
      const consecutiveSkips = getConsecutiveSkipsCount(g, dateStr, true);
      if (consecutiveSkips >= 4) {
        mandatoryHabitQueue.push({
          goal: g,
          mandatory: true,
          consecutiveSkips,
        });
      }
    }

    // Whole-day quiz runs once per day when there are incomplete habits not already covered solely by mandatory individual quizzes
    const dayModeNeeded =
      incompleteScheduledGoals.length > mandatoryHabitQueue.length &&
      !dailyQuizLogs[dateStr];

    if (!dayModeNeeded && mandatoryHabitQueue.length === 0) {
      setReportModalDate(dateStr);
      return;
    }

    setQuizSession({
      dateStr,
      initialDayMode: dayModeNeeded,
      incompleteGoalsForDay: incompleteScheduledGoals,
      habitQueue: mandatoryHabitQueue,
      openReportAfter: true,
    });
  };

  const handleOpenManualDayQuiz = (dateStr: string, openReportAfter = true) => {
    const incompleteScheduledGoals = activeGoals.filter((g) => {
      if (!isDateScheduledForGoal(g, dateStr)) return false;
      return !getDayCompletionStats(g, dateStr).isDone;
    });
    const mandatoryHabitQueue: IndividualQuizQueueItem[] = [];
    if (!openReportAfter) {
      for (const g of incompleteScheduledGoals) {
        if (g.quizLogs?.[dateStr]) continue;
        const consecutiveSkips = getConsecutiveSkipsCount(g, dateStr, true);
        if (consecutiveSkips >= 4) {
          mandatoryHabitQueue.push({
            goal: g,
            mandatory: true,
            consecutiveSkips,
          });
        }
      }
    }
    if (openReportAfter) {
      setReportModalDate(null);
    }
    setQuizSession({
      dateStr,
      initialDayMode: true,
      incompleteGoalsForDay: incompleteScheduledGoals,
      habitQueue: mandatoryHabitQueue,
      openReportAfter,
    });
  };

  const handleOpenManualIndividualQuiz = (
    goalId: string,
    dateStr: string,
    openReportAfter = false
  ) => {
    const targetGoal = goals.find((g) => g.id === goalId);
    if (!targetGoal) return;
    const consecutiveSkips = getConsecutiveSkipsCount(targetGoal, dateStr, true);
    const mandatory = consecutiveSkips >= 4 && !targetGoal.quizLogs?.[dateStr];
    if (openReportAfter) {
      setReportModalDate(null);
    }
    setQuizSession({
      dateStr,
      initialDayMode: false,
      incompleteGoalsForDay: [],
      habitQueue: [
        {
          goal: targetGoal,
          mandatory,
          consecutiveSkips,
        },
      ],
      openReportAfter,
    });
  };

  const handleApplyMinimumDose = (goalId: string, nextTarget: number) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === goalId ? { ...g, dailyTarget: nextTarget } : g))
    );
    showToast(`Meta ajustada a ${formatQuantity(nextTarget)} para facilitar el ritmo.`);
  };

  const handleDismissDiagnostic = (goalId: string, consecutiveSkips: number) => {
    setDismissedDiagnostics((prev) => ({
      ...prev,
      [goalId]: consecutiveSkips,
    }));
  };

  return (
    <div className="min-h-screen bg-[#F6F6F9] text-slate-900 relative">
      <canvas
        ref={confettiCanvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 w-full h-full z-40"
      />

      {/* Minimal Header */}
      <header className="sticky top-0 z-20 bg-[#F6F6F9]/90 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setMascotModalOpen(true)}
            aria-label={`Ver mascota global: ${globalMascot.label}, ${Math.round(globalProgress.actualPct)}% completado`}
            title="Ver progreso de tu mascota"
            className="retro-press h-11 px-3.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200/90 shadow-2xs flex items-center gap-2 min-w-0 transition-colors cursor-pointer"
          >
            <span className="text-xl leading-none shrink-0" role="img" aria-hidden="true">
              {globalMascot.emoji}
            </span>
            <span className="text-xs font-bold text-slate-900 font-mono tabular-nums shrink-0">
              {Math.round(globalProgress.actualPct)}%
            </span>
            <span className="text-xs font-medium text-slate-500 truncate max-w-[110px] sm:max-w-none">
              {globalMascot.label}
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openDailyCheckInOrReport(todayStr)}
              aria-label="Abrir diario del día"
              title="Diario del día"
              className="retro-press relative w-11 h-11 rounded-full bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center text-slate-700 hover:bg-slate-50"
            >
              <Sun className="w-4 h-4" aria-hidden="true" />
              {notificationBanner && (
                <span
                  className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#3B4DF5]"
                  aria-hidden="true"
                />
              )}
            </button>

            <div ref={reportPickerRef} className="relative">
              <button
                type="button"
                onClick={() => setReportPickerOpen((o) => !o)}
                aria-label="Elegir reporte (diario, semanal o mensual)"
                aria-expanded={reportPickerOpen}
                aria-haspopup="menu"
                title="Reportes"
                className="retro-press relative w-11 h-11 rounded-full bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center text-slate-700 hover:bg-slate-50"
              >
                <BarChart2 className="w-4 h-4" aria-hidden="true" />
                {monthlyReadyBanner && (
                  <span
                    className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#3B4DF5]"
                    aria-hidden="true"
                  />
                )}
              </button>

              {reportPickerOpen && (
                <div
                  role="menu"
                  aria-label="Tipo de reporte"
                  className="absolute right-0 mt-2 w-48 rounded-2xl bg-white border border-slate-200 shadow-xl py-1.5 z-40"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setReportPickerOpen(false);
                      setReportModalDate(todayStr);
                    }}
                    className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
                  >
                    <Sun className="w-4 h-4 text-[#3B4DF5] shrink-0" aria-hidden="true" />
                    <span>Reporte diario</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setReportPickerOpen(false);
                      setWeeklyReportAnchorDate(todayStr);
                    }}
                    className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
                  >
                    <CalendarDays className="w-4 h-4 text-[#3B4DF5] shrink-0" aria-hidden="true" />
                    <span>Reporte semanal</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setReportPickerOpen(false);
                      setMonthlyReportTarget({
                        year: now.getFullYear(),
                        month: now.getMonth(),
                      });
                    }}
                    className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
                  >
                    <Sparkles className="w-4 h-4 text-[#3B4DF5] shrink-0" aria-hidden="true" />
                    <span>Reporte mensual</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              aria-label="Configuración"
              className="retro-press w-11 h-11 rounded-full bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center text-slate-700 hover:bg-slate-50"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingGoal(null);
                setGoalModalOpen(true);
              }}
              aria-label="Crear nuevo hábito"
              className="retro-press w-11 h-11 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white shadow-sm flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <Plus className="w-5 h-5 stroke-[2.4]" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* In-App Notification Banner for Daily 10 PM Report */}
      {notificationBanner && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-2">
          <div
            role="region"
            aria-label="Notificación de reporte diario"
            className="bg-slate-900 text-white rounded-2xl p-4 shadow-lg border border-slate-800 flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <span className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-300 flex items-center justify-center shrink-0 mt-0.5">
                <BellRing className="w-4 h-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-blue-300">
                  {notificationBanner.notificationTitle}
                </div>
                <p className="mt-1 text-xs text-slate-200 whitespace-pre-line leading-relaxed">
                  {notificationBanner.notificationBody}
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const d = notificationBanner.dateStr;
                      setNotificationBanner(null);
                      openDailyCheckInOrReport(d);
                    }}
                    className="px-3 py-1.5 rounded-full bg-[#3B4DF5] hover:bg-blue-500 text-white text-[11px] font-semibold"
                  >
                    Abrir reporte completo
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setNotificationBanner(null)}
              aria-label="Descartar notificación"
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Automatic Monthly Report Ready Banner */}
      {monthlyReadyBanner && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-2">
          <div className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-white border border-indigo-200 text-[#3B4DF5] flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">
                  Tu reporte mensual de {monthlyReadyBanner.monthTitle} está listo
                </div>
                <div className="text-[11px] text-slate-600">
                  Revisa tu progreso, mapa de color y hábitos destacados.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setMonthlyReportTarget({
                    year: monthlyReadyBanner.year,
                    month: monthlyReadyBanner.month,
                  })
                }
                className="px-3.5 h-8 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-xs font-semibold"
              >
                Ver
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.setItem(
                      LAST_MONTHLY_REPORT_KEY,
                      monthlyReadyBanner.monthKey
                    );
                  } catch {
                    // Ignore
                  }
                  setMonthlyReadyBanner(null);
                }}
                aria-label="Descartar aviso mensual"
                className="w-8 h-8 rounded-full hover:bg-indigo-100 text-slate-500 flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Automatic Weekly Report Ready Banner */}
      {weeklyReadyBanner && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-2">
          <div className="bg-slate-900 text-white rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-teal-400/15 border border-teal-400/30 text-teal-300 flex items-center justify-center shrink-0">
                <CalendarDays className="w-4 h-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  Tu reporte de la Semana {weeklyReadyBanner.weekOfYear} está listo
                </div>
                <div className="text-[11px] text-slate-300">
                  Mira cómo se sintió tu semana, tu micro-victoria y tu siguiente enfoque.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setWeeklyReportAnchorDate(weeklyReadyBanner.anchorDate)}
                className="px-3.5 h-8 rounded-full bg-teal-400 hover:bg-teal-300 text-slate-950 text-xs font-bold"
              >
                Ver
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.setItem(
                      LAST_WEEKLY_REPORT_KEY,
                      weeklyReadyBanner.weekKey
                    );
                  } catch {
                    // Ignore
                  }
                  setWeeklyReadyBanner(null);
                }}
                aria-label="Descartar aviso semanal"
                className="w-8 h-8 rounded-full hover:bg-white/10 text-slate-400 flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Optional "Viernes de Anticipación" Banner (Fridays >= 5:00 PM) */}
      {fridayAnticipationBanner && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-2">
          <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3.5 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <span className="w-9 h-9 rounded-xl bg-white border border-amber-200 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-900">
                  Viernes de Anticipación
                </div>
                <p className="text-[11px] text-slate-700 leading-relaxed mt-0.5">
                  ¿Ya viste tu mapa de calor? Si completas el sábado, el domingo tu
                  reporte se verá increíble. ¡Tú decides tu ritmo, sin culpa!
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setInspectedState(null);
                      setActiveView('goals');
                      try {
                        localStorage.setItem(
                          FRIDAY_ANTICIPATION_DISMISSED_KEY,
                          todayStr
                        );
                      } catch {
                        // Ignore
                      }
                      setFridayAnticipationBanner(false);
                    }}
                    className="px-3 h-7 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold"
                  >
                    Ver mapa de calor
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.setItem(FRIDAY_ANTICIPATION_DISMISSED_KEY, todayStr);
                } catch {
                  // Ignore
                }
                setFridayAnticipationBanner(false);
              }}
              aria-label="Cerrar aviso de viernes"
              className="w-8 h-8 rounded-full hover:bg-amber-100 text-slate-500 flex items-center justify-center shrink-0"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Weekly Backup Reminder Banner */}
      {weeklyBackupDue && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-2">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-[#3B4DF5] flex items-center justify-center shrink-0">
                <CalendarClock className="w-4 h-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">
                  Recordatorio semanal de respaldo
                </div>
                <div className="text-[11px] text-slate-500">
                  Guarda una copia de seguridad manual de tus hábitos y notas.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleExportJsonBackup}
                className="px-3 h-8 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Exportar</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleUpdateSettings({ backupReminderDismissedDate: todayStr })
                }
                aria-label="Posponer recordatorio de respaldo"
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className={`max-w-3xl mx-auto px-4 sm:px-6 pt-3 ${inspectedGoal ? 'pb-12' : 'pb-28'}`}>
        {goals.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 sm:p-10 text-center mt-6">
            <div className="text-4xl mb-3" aria-hidden="true">
              {globalMascot.emoji}
            </div>
            <h1 className="font-display text-xl font-bold text-slate-900">
              Crea tu primer hábito con fecha límite
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
              Cada avance diario hará evolucionar a tu mascota global.
            </p>
            <button
              type="button"
              onClick={() => {
                setEditingGoal(null);
                setGoalModalOpen(true);
              }}
              className="mt-5 inline-flex items-center gap-2 px-5 h-11 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-sm font-semibold"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Nuevo hábito</span>
            </button>
          </div>
        ) : inspectedGoal ? (
          <HabitDetailView
            key={`${inspectedGoal.id}-${inspectedState?.initialDate || ''}`}
            goal={inspectedGoal}
            now={now}
            initialDate={inspectedState?.initialDate}
            dailyQuizLogs={dailyQuizLogs}
            onBack={() => setInspectedState(null)}
            onEditHabit={() => {
              setEditingGoal(inspectedGoal);
              setGoalModalOpen(true);
            }}
            onOpenDetailedStats={() => setDetailedStatsGoal(inspectedGoal)}
            onDeleteHabit={() => handleDeleteGoal(inspectedGoal.id)}
            onOpenEvolveModal={() => setEvolvingGoalId(inspectedGoal.id)}
            onMakePermanent={(cycleDays) =>
              handleMakeGoalPermanent(inspectedGoal.id, cycleDays)
            }
            onUpdatePermanentCycle={(cycleDays) =>
              handleUpdatePermanentCycle(inspectedGoal.id, cycleDays)
            }
            onArchiveHabit={() => handleArchiveGoal(inspectedGoal.id)}
            onUnarchiveHabit={() => handleUnarchiveGoal(inspectedGoal.id)}
            onUpdateProgress={(dateStr, nextValue, event) =>
              handleUpdateProgress(inspectedGoal.id, dateStr, nextValue, event)
            }
            onMarkSkipped={(dateStr) => handleMarkSkipped(inspectedGoal.id, dateStr)}
            onOpenCounterModal={(dateStr) =>
              setCounterModalState({ goalId: inspectedGoal.id, dateStr })
            }
            onSaveNote={(dateStr, noteText) =>
              handleSaveNote(inspectedGoal.id, dateStr, noteText)
            }
            onOpenIndividualQuiz={(goalId, dateStr) =>
              handleOpenManualIndividualQuiz(goalId, dateStr, false)
            }
            onApplyMinimumDose={handleApplyMinimumDose}
          />
        ) : activeView === 'today' ? (
          <DailyChecklistView
            goals={activeGoals}
            now={now}
            selectedDate={selectedDay}
            dailyNote={dailyNotes[selectedDay] || ''}
            hasDailyQuiz={Boolean(dailyQuizLogs[selectedDay])}
            diagnostics={selectedDayDiagnostics}
            finishedPhaseGoals={finishedPhaseGoals}
            onSelectDate={setSelectedDay}
            onUpdateProgress={handleUpdateProgress}
            onReorderHabits={handleReorderHabits}
            onInspectGoal={handleInspectGoal}
            onOpenCounterModal={(goalId, dateStr) =>
              setCounterModalState({ goalId, dateStr })
            }
            onOpenDayQuiz={(dateStr) => handleOpenManualDayQuiz(dateStr, false)}
            onSaveDailyNote={handleSaveDailyNote}
            onApplyMinimumDose={handleApplyMinimumDose}
            onDismissDiagnostic={handleDismissDiagnostic}
            onDismissPhaseNotice={(goalId) => {
              const target = goals.find((g) => g.id === goalId);
              if (target) {
                setDismissedPhaseNotices((prev) => ({
                  ...prev,
                  [goalId]: target.deadlineDate,
                }));
              }
            }}
          />
        ) : activeView === 'grid' ? (
          <MatrixGridView
            goals={activeGoals}
            now={now}
            gridDaysMode={settings.gridDaysMode}
            windowEndDate={windowEndDate}
            onChangeWindowEnd={setWindowEndDate}
            onUpdateProgress={handleUpdateProgress}
            onInspectGoal={(goalId) => handleInspectGoal(goalId)}
            onOpenCounterModal={(goalId, dateStr) =>
              setCounterModalState({ goalId, dateStr })
            }
          />
        ) : activeView === 'goals' ? (
          <GoalsListView
            goals={goals}
            now={now}
            onInspectGoal={(goalId) => handleInspectGoal(goalId)}
            onOpenHabitStats={(goal) => setDetailedStatsGoal(goal)}
            onUpdateProgress={handleUpdateProgress}
            onOpenCounterModal={(goalId, dateStr) =>
              setCounterModalState({ goalId, dateStr })
            }
          />
        ) : (
          <ReportsAnalyticsView
            goals={goals}
            now={now}
            selectedDate={selectedDay}
            dailyNotes={dailyNotes}
            dailyQuizLogs={dailyQuizLogs}
            settings={settings}
            globalProgress={globalProgress}
            activeSubTab={reportsSubTab}
            onChangeSubTab={setReportsSubTab}
            onUpdateWeeklyStatsMode={(mode) =>
              handleUpdateSettings({ weeklyStatsMode: mode })
            }
            onInspectGoal={(goalId, dateStr) => handleInspectGoal(goalId, dateStr)}
            onOpenDailyReport={(dateStr) => openDailyCheckInOrReport(dateStr)}
            onOpenWeeklyReport={(anchorDateStr) =>
              setWeeklyReportAnchorDate(anchorDateStr)
            }
            onOpenMonthlyReport={(year, month) =>
              setMonthlyReportTarget({ year, month })
            }
            onOpenSettings={() => setSettingsModalOpen(true)}
          />
        )}
      </main>

      {/* Celebratory Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed left-1/2 -translate-x-1/2 z-30 max-w-[90vw] px-4 py-2.5 rounded-full bg-slate-900 text-white text-xs sm:text-sm font-semibold shadow-lg whitespace-nowrap ${
            inspectedGoal ? 'bottom-6' : 'bottom-22'
          }`}
        >
          {toastMessage}
        </div>
      )}

      {/* Floating Bottom 4-Icon Switcher Dock (hidden while inside HabitDetailView) */}
      {!inspectedGoal && (
        <nav
          aria-label="Vistas"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-full p-1.5 shadow-lg flex items-center gap-1"
        >
          <button
            type="button"
            onClick={() => setActiveView('today')}
            aria-label="Lista de hábitos del día"
            aria-pressed={activeView === 'today'}
            title="Lista diaria"
            className={`w-12 h-11 rounded-full flex items-center justify-center transition-colors ${
              activeView === 'today'
                ? 'bg-slate-100 text-slate-900'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <ListChecks className="w-5 h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setActiveView('grid')}
            aria-label="Vista cuadrícula"
            aria-pressed={activeView === 'grid'}
            title="Cuadrícula"
            className={`w-12 h-11 rounded-full flex items-center justify-center transition-colors ${
              activeView === 'grid'
                ? 'bg-slate-100 text-slate-900'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <LayoutGrid className="w-5 h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setActiveView('goals')}
            aria-label="Lista de objetivos"
            aria-pressed={activeView === 'goals'}
            title="Objetivos"
            className={`w-12 h-11 rounded-full flex items-center justify-center transition-colors ${
              activeView === 'goals'
                ? 'bg-slate-100 text-slate-900'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <AlignLeft className="w-5 h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setActiveView('reports')}
            aria-label="Reportes y análisis"
            aria-pressed={activeView === 'reports'}
            title="Reportes"
            className={`w-12 h-11 rounded-full flex items-center justify-center transition-colors ${
              activeView === 'reports'
                ? 'bg-slate-100 text-slate-900'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <BarChart3 className="w-5 h-5" aria-hidden="true" />
          </button>
        </nav>
      )}

      {counterModalGoal && counterModalState && (
        <CounterModal
          goal={counterModalGoal}
          dateStr={counterModalState.dateStr}
          now={now}
          onClose={() => setCounterModalState(null)}
          onSave={(nextValue) => {
            handleUpdateProgress(
              counterModalGoal.id,
              counterModalState.dateStr,
              nextValue
            );
            setCounterModalState(null);
          }}
          onOpenNote={() => {
            const targetId = counterModalGoal.id;
            const targetDate = counterModalState.dateStr;
            setCounterModalState(null);
            handleInspectGoal(targetId, targetDate);
          }}
        />
      )}

      {goalModalOpen && (
        <GoalBuilderModal
          initialGoal={editingGoal}
          presetAreas={presetAreas}
          onAddPresetArea={handleAddArea}
          onClose={() => {
            setGoalModalOpen(false);
            setEditingGoal(null);
          }}
          onSave={handleSaveGoal}
        />
      )}

      {evolvingGoal && (
        <HabitEvolveModal
          goal={evolvingGoal}
          now={now}
          onClose={() => setEvolvingGoalId(null)}
          onConfirm={(payload) => handleConfirmEvolveGoal(evolvingGoal.id, payload)}
        />
      )}

      {reportModalDate && (
        <DailyReportModal
          goals={activeGoals}
          now={now}
          settings={settings}
          globalProgress={globalProgress}
          initialDate={reportModalDate}
          dailyNotes={dailyNotes}
          dailyQuizLogs={dailyQuizLogs}
          dismissedDiagnostics={dismissedDiagnostics}
          isDayClosed={Boolean(closedDays[reportModalDate])}
          onClose={() => setReportModalDate(null)}
          onCloseDay={handleCloseDay}
          onInspectGoal={(goalId, dateStr) => {
            setReportModalDate(null);
            handleInspectGoal(goalId, dateStr);
          }}
          onOpenDayQuiz={handleOpenManualDayQuiz}
          onOpenQuickQuiz={(goalId, dateStr) =>
            handleOpenManualIndividualQuiz(goalId, dateStr, true)
          }
          onSaveDailyNote={handleSaveDailyNote}
          onApplyMinimumDose={handleApplyMinimumDose}
          onDismissDiagnostic={handleDismissDiagnostic}
        />
      )}

      {quizSession && (
        <QuickCheckInQuizModal
          key={`${quizSession.dateStr}-${quizSession.initialDayMode ? 'day' : 'ind'}-${quizSession.habitQueue
            .map((q) => q.goal.id)
            .join(',')}`}
          dateStr={quizSession.dateStr}
          now={now}
          initialDayMode={quizSession.initialDayMode}
          incompleteGoalsForDay={quizSession.incompleteGoalsForDay}
          existingDailyQuiz={dailyQuizLogs[quizSession.dateStr]}
          existingDailyNote={dailyNotes[quizSession.dateStr] || ''}
          habitQueue={quizSession.habitQueue}
          openReportAfter={quizSession.openReportAfter}
          onSaveDailyQuiz={handleSaveDailyQuiz}
          onSaveDailyNote={handleSaveDailyNote}
          onSaveHabitQuiz={handleSaveHabitQuiz}
          onSaveHabitNote={handleSaveNote}
          onFinish={() => {
            const { dateStr, openReportAfter } = quizSession;
            setQuizSession(null);
            if (openReportAfter) {
              setReportModalDate(dateStr);
            } else {
              showToast('Registro guardado');
            }
          }}
          onCancel={() => setQuizSession(null)}
        />
      )}

      {mascotModalOpen && (
        <MascotViewerModal
          settings={settings}
          globalProgress={globalProgress}
          onClose={() => setMascotModalOpen(false)}
          onOpenSettings={() => setSettingsModalOpen(true)}
        />
      )}

      {settingsModalOpen && (
        <MascotSettingsModal
          settings={settings}
          globalProgress={globalProgress}
          activeGoals={activeGoals}
          presetAreas={presetAreas}
          areaCounts={areaCounts}
          onUpdateSettings={handleUpdateSettings}
          onReorderHabits={handleReorderHabits}
          onAddArea={handleAddArea}
          onRenameArea={handleRenameArea}
          onDeleteArea={handleDeleteArea}
          onClose={() => setSettingsModalOpen(false)}
          onOpenDailyReport={() => openDailyCheckInOrReport(todayStr)}
          onOpenWeeklyReport={() => setWeeklyReportAnchorDate(todayStr)}
          onOpenMonthlyReport={() =>
            setMonthlyReportTarget({
              year: now.getFullYear(),
              month: now.getMonth(),
            })
          }
          onExportJsonBackup={handleExportJsonBackup}
          onImportJsonBackup={handleImportJsonBackup}
          onExportExcel={handleExportExcel}
          onResetAllData={handleResetAllData}
        />
      )}

      {weeklyReportAnchorDate && (
        <WeeklyReportModal
          goals={goals}
          now={now}
          settings={settings}
          globalProgress={globalProgress}
          dailyQuizLogs={dailyQuizLogs}
          initialAnchorDate={weeklyReportAnchorDate}
          onClose={(viewedWeekKey) => {
            if (
              weeklyReadyBanner &&
              viewedWeekKey === weeklyReadyBanner.weekKey
            ) {
              try {
                localStorage.setItem(LAST_WEEKLY_REPORT_KEY, viewedWeekKey);
              } catch {
                // Ignore
              }
              setWeeklyReadyBanner(null);
            }
            setWeeklyReportAnchorDate(null);
          }}
          onOpenWeeklyDetail={() => {
            setInspectedState(null);
            setReportsSubTab('week');
            setActiveView('reports');
          }}
          onInspectGoal={(goalId) => {
            setWeeklyReportAnchorDate(null);
            handleInspectGoal(goalId);
          }}
        />
      )}

      {monthlyReportTarget && (
        <MonthlyReportModal
          goals={goals}
          now={now}
          settings={settings}
          globalProgress={globalProgress}
          dailyQuizLogs={dailyQuizLogs}
          initialYear={monthlyReportTarget.year}
          initialMonth={monthlyReportTarget.month}
          onClose={(viewedMonthKey) => {
            if (
              monthlyReadyBanner &&
              viewedMonthKey === monthlyReadyBanner.monthKey
            ) {
              try {
                localStorage.setItem(LAST_MONTHLY_REPORT_KEY, viewedMonthKey);
              } catch {
                // Ignore
              }
              setMonthlyReadyBanner(null);
            }
            setMonthlyReportTarget(null);
          }}
          onInspectGoal={(goalId) => {
            setMonthlyReportTarget(null);
            handleInspectGoal(goalId);
          }}
        />
      )}

      {detailedStatsGoal && (
        <HabitDetailedStatsModal
          goal={detailedStatsGoal}
          now={now}
          onClose={() => setDetailedStatsGoal(null)}
          onInspectGoal={(goalId, dateStr) => {
            setDetailedStatsGoal(null);
            handleInspectGoal(goalId, dateStr);
          }}
        />
      )}
    </div>
  );
}
