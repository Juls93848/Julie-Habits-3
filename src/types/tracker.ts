export type MascotTrackId = 'horse' | 'dragon' | 'plant' | 'rocket';

export type GridDaysMode = 'week_monday' | 'last_5' | 'last_7';

export type WeeklyStatsMode = 'last_7' | 'full_week';

export type HabitType = 'build' | 'quit';

export type TrackingMode = 'boolean' | 'counter' | 'measure';

export type TapAction = 'add_1' | 'enter_total';

export type FrequencyType =
  | 'everyday'
  | 'specific_days'
  | 'times_per_week'
  | 'times_per_month'
  | 'every_n_days';

export interface HabitFrequency {
  type: FrequencyType;
  /** 0=Sun, 1=Mon, ..., 6=Sat (used when type === 'specific_days') */
  weekdays?: number[];
  /** Used when type === 'times_per_week' or 'times_per_month' */
  count?: number;
  /** Used when type === 'every_n_days' */
  intervalDays?: number;
}

export const PRESET_AREAS = [
  'Salud',
  'Trabajo',
  'Estudio',
  'Finanzas',
  'Hogar',
  'Personal',
] as const;

export type QuizEnergyLevel = 'low' | 'regular' | 'flow';

export type QuizExecutionMode = 'fluid_success' | 'with_resistance';

export type QuizDeliveryType = 'complete' | 'emergency_rule';

export type QuizFrictionTag =
  | 'forgot_distraction'
  | 'emergency_unexpected'
  | 'tight_time';

export type QuizObstacle =
  | 'friction_time'
  | 'energy_mood'
  | 'forgot'
  | 'external_interruption'
  | 'mental_saturation'
  | 'habit_substitution';

export type QuizBreakPoint = 'start' | 'middle' | 'planning';

export type QuizReaction =
  | 'emergency_rule'
  | 'all_or_nothing'
  | 'postponed';

export interface DailyQuizResponse {
  energyLevel?: QuizEnergyLevel;
  executionMode?: QuizExecutionMode;
  deliveryType?: QuizDeliveryType;
  frictionTags?: QuizFrictionTag[];
  obstacle?: QuizObstacle;
  breakPoint?: QuizBreakPoint;
  reaction?: QuizReaction;
  note?: string;
  answeredAt: string;
}

export interface HabitDiagnostic {
  goal: Goal;
  consecutiveSkips: number;
  completionRate30d: number;
  scheduledDays30d: number;
  topObstacle: {
    id: QuizObstacle;
    label: string;
    pct: number;
  } | null;
  topBreakPoint: {
    id: QuizBreakPoint;
    label: string;
    pct: number;
  } | null;
  neutralQuestion: string;
  suggestedTarget: number | null;
}

export type HabitPhaseOutcome =
  | 'evolved'
  | 'permanent'
  | 'cycle_renewed'
  | 'archived';

export interface HabitPhaseRecord {
  id: string;
  phaseNumber: number;
  title: string;
  frequencySummary: string;
  startDate: string;
  deadlineDate: string;
  completedDays: number;
  scheduledDays: number;
  pct: number;
  outcome: HabitPhaseOutcome;
  endedAt: string;
}

export interface Goal {
  id: string;
  title: string;
  area: string;
  /** Crear vs Dejar */
  habitType: HabitType;
  /** Sí/No vs Contador vs Medida */
  trackingMode: TrackingMode;
  /** Unit label when trackingMode === 'measure' (e.g., 'km', 'L', 'páginas') */
  unit?: string;
  /** Optional label prefix for daily checklist items (e.g., 'Sesión', 'Vaso') */
  stepLabel?: string;
  /** Daily target (1 for boolean, >= 0.1 for counter/measure) */
  dailyTarget: number;
  /** Behavior when tapping counter/measure item */
  tapAction: TapAction;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  deadlineDate: string;
  /** Exact hex color, e.g. #3B4DF5 */
  colorHex: string;
  /** Icon, emoji, or image URL */
  iconType: 'icon' | 'emoji' | 'image';
  iconValue: string;
  /** Frequency configuration */
  frequency: HabitFrequency;
  /** Opt-in: manually enable real-time pace status (Adelantada / Al corriente / Atrasada) */
  trackPace: boolean;
  /** Current project/evolution phase number (starts at 1) */
  phaseNumber?: number;
  /** When true, automatically renews in repeating evaluation cycles */
  isPermanent?: boolean;
  /** Number of days per cycle for permanent habits (default 30) */
  permanentCycleDays?: number;
  /** When true, hidden from daily/grid views and shown under Archived */
  isArchived?: boolean;
  /** Chronological evolution / cycle history for this habit */
  phaseHistory?: HabitPhaseRecord[];
  /** Date string (YYYY-MM-DD) -> recorded numeric progress for that day */
  completions: Record<string, number>;
  /** Date string (YYYY-MM-DD) -> true when explicitly marked as skipped */
  skipped?: Record<string, boolean>;
  /** Date string (YYYY-MM-DD) -> quick check-in quiz answer */
  quizLogs?: Record<string, DailyQuizResponse>;
  /** Date string (YYYY-MM-DD) -> written daily journal note */
  notes?: Record<string, string>;
  createdAt: string;
}

export interface AnalysisVisibilitySettings {
  showGlobalChart: boolean;
  showFrictionDetail: boolean;
  showFrictionHistory: boolean;
  showDetailedHabitStats: boolean;
}

export interface AppSettings {
  mascotTrackId: MascotTrackId;
  soundEnabled: boolean;
  gridDaysMode: GridDaysMode;
  /** Weekly chart and report window preference: 'last_7' | 'full_week' */
  weeklyStatsMode?: WeeklyStatsMode;
  /** Controls which modules are displayed inside the Análisis tab (Vista 4) */
  analysisVisibility?: AnalysisVisibilitySettings;
  dailyReportEnabled: boolean;
  /** 0-23 local hour, default 22 (10:00 PM) */
  dailyReportHour: number;
  /** Optional Friday 17:00 preview prompt */
  fridayAnticipationEnabled?: boolean;
  /** Remind once a week to export a manual JSON backup */
  weeklyBackupReminderEnabled?: boolean;
  /** ISO timestamp or YYYY-MM-DD of last manual backup export */
  lastBackupAt?: string;
  /** YYYY-MM-DD when the weekly backup reminder banner was dismissed */
  backupReminderDismissedDate?: string;
}

export interface DailyReportItem {
  goal: Goal;
  value: number;
  target: number;
  pct: number;
  isDone: boolean;
  note?: string;
}

export interface DailyReportSummary {
  dateStr: string;
  totalPct: number;
  completedCount: number;
  totalCount: number;
  completed: DailyReportItem[];
  partial: DailyReportItem[];
  missed: DailyReportItem[];
  dailyNote?: string;
  dailyQuiz?: DailyQuizResponse;
  notificationTitle: string;
  notificationBody: string;
}

export type PaceStatus = 'ahead' | 'ontrack' | 'behind';

export interface GoalProgressSummary {
  actualPct: number;
  expectedPct: number;
  diffPct: number;
  status: PaceStatus;
  completedDaysEquivalent: number;
  totalScheduledDays: number;
  totalDays: number;
  daysRemaining: number;
  isBeforeStart: boolean;
  isAfterDeadline: boolean;
}

export interface GlobalProgressSummary {
  actualPct: number;
  completedUnits: number;
  totalUnits: number;
  activeGoalsCount: number;
}

export interface DailyTotalSummary {
  pct: number;
  completedHabits: number;
  totalHabits: number;
}

export interface MascotStage {
  index: number;
  emoji: string;
  label: string;
  minPct: number;
  nextEmoji: string | null;
  nextMinPct: number | null;
}
