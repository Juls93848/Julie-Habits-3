import * as XLSX from 'xlsx';
import { AppSettings, DailyQuizResponse, Goal } from '../types/tracker';
import {
  getBreakPointLabel,
  getEnergyLevelLabel,
  getExecutionModeLabel,
  getFrictionTagLabel,
  getObstacleLabel,
  getReactionLabel,
} from './diagnosticEngine';
import {
  calculateGoalProgress,
  diffDays,
  formatFrequencySummary,
  getDayCompletionStats,
  getPermanentCycleDays,
  toLocalDateStr,
} from './paceEngine';

export interface RitmoBackupData {
  goals: Goal[];
  settings?: Partial<AppSettings>;
  dailyNotes?: Record<string, string>;
  dailyQuizLogs?: Record<string, DailyQuizResponse>;
  closedDays?: Record<string, string>;
  presetAreas?: string[];
}

export interface RitmoBackupPayload {
  version: 1;
  app: 'Ritmo';
  exportedAt: string;
  data: RitmoBackupData;
}

export interface ParsedBackupPreview {
  payload: RitmoBackupData;
  exportedAt?: string;
  goalsCount: number;
  notesCount: number;
  quizCount: number;
}

export function normalizeImportedGoal(raw: Partial<Goal>): Goal {
  const todayStr = toLocalDateStr(new Date());
  return {
    id: raw.id || `goal-imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Hábito sin nombre',
    area: typeof raw.area === 'string' && raw.area.trim() ? raw.area.trim() : 'Personal',
    habitType: raw.habitType === 'quit' ? 'quit' : 'build',
    trackingMode:
      raw.trackingMode === 'counter' || raw.trackingMode === 'measure'
        ? raw.trackingMode
        : 'boolean',
    unit: raw.unit,
    stepLabel: raw.stepLabel,
    dailyTarget:
      typeof raw.dailyTarget === 'number' && Number.isFinite(raw.dailyTarget) && raw.dailyTarget > 0
        ? raw.dailyTarget
        : 1,
    tapAction: raw.tapAction === 'enter_total' ? 'enter_total' : 'add_1',
    startDate: typeof raw.startDate === 'string' && raw.startDate ? raw.startDate : todayStr,
    deadlineDate:
      typeof raw.deadlineDate === 'string' && raw.deadlineDate ? raw.deadlineDate : todayStr,
    colorHex: typeof raw.colorHex === 'string' && raw.colorHex ? raw.colorHex : '#3B4DF5',
    iconType:
      raw.iconType === 'emoji' || raw.iconType === 'image' ? raw.iconType : 'icon',
    iconValue: typeof raw.iconValue === 'string' && raw.iconValue ? raw.iconValue : 'activity',
    frequency: raw.frequency || { type: 'everyday' },
    trackPace: Boolean(raw.trackPace),
    phaseNumber: raw.phaseNumber || 1,
    isPermanent: Boolean(raw.isPermanent),
    permanentCycleDays: getPermanentCycleDays(raw),
    isArchived: Boolean(raw.isArchived),
    phaseHistory: Array.isArray(raw.phaseHistory) ? raw.phaseHistory : [],
    completions:
      raw.completions && typeof raw.completions === 'object' ? raw.completions : {},
    skipped: raw.skipped && typeof raw.skipped === 'object' ? raw.skipped : {},
    quizLogs: raw.quizLogs && typeof raw.quizLogs === 'object' ? raw.quizLogs : {},
    notes: raw.notes && typeof raw.notes === 'object' ? raw.notes : {},
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString(),
  };
}

export function createBackupPayload(data: RitmoBackupData): RitmoBackupPayload {
  return {
    version: 1,
    app: 'Ritmo',
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function downloadJsonBackup(payload: RitmoBackupPayload, todayStr: string): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ritmo-respaldo-${todayStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseAndValidateBackup(rawText: string): ParsedBackupPreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('El archivo no contiene un formato JSON válido.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('El archivo no corresponde a una copia de seguridad de Ritmo.');
  }

  const obj = parsed as Record<string, unknown>;
  const rootData =
    obj.data && typeof obj.data === 'object'
      ? (obj.data as Record<string, unknown>)
      : obj;

  if (!Array.isArray(rootData.goals)) {
    throw new Error('No se encontró la lista de hábitos dentro del respaldo.');
  }

  const goals = rootData.goals.map((g) =>
    normalizeImportedGoal((g && typeof g === 'object' ? g : {}) as Partial<Goal>)
  );

  const dailyNotes =
    rootData.dailyNotes && typeof rootData.dailyNotes === 'object'
      ? (rootData.dailyNotes as Record<string, string>)
      : {};

  const dailyQuizLogs =
    rootData.dailyQuizLogs && typeof rootData.dailyQuizLogs === 'object'
      ? (rootData.dailyQuizLogs as Record<string, DailyQuizResponse>)
      : {};

  const closedDays =
    rootData.closedDays && typeof rootData.closedDays === 'object'
      ? (rootData.closedDays as Record<string, string>)
      : {};

  const presetAreas = Array.isArray(rootData.presetAreas)
    ? rootData.presetAreas.filter((a): a is string => typeof a === 'string' && Boolean(a.trim()))
    : undefined;

  const settings =
    rootData.settings && typeof rootData.settings === 'object'
      ? (rootData.settings as Partial<AppSettings>)
      : undefined;

  return {
    payload: {
      goals,
      settings,
      dailyNotes,
      dailyQuizLogs,
      closedDays,
      presetAreas,
    },
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : undefined,
    goalsCount: goals.length,
    notesCount: Object.keys(dailyNotes).length,
    quizCount: Object.keys(dailyQuizLogs).length,
  };
}

export function isWeeklyBackupDue(
  settings: AppSettings,
  todayStr: string
): boolean {
  if (!settings.weeklyBackupReminderEnabled) return false;
  if (settings.backupReminderDismissedDate === todayStr) return false;
  if (!settings.lastBackupAt) return true;

  const lastDate = new Date(settings.lastBackupAt);
  const lastDateStr = Number.isNaN(lastDate.getTime())
    ? settings.lastBackupAt.slice(0, 10)
    : toLocalDateStr(lastDate);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDateStr)) return true;
  return diffDays(lastDateStr, todayStr) >= 7;
}

export function exportHabitsToExcel({
  goals,
  dailyNotes,
  dailyQuizLogs,
  now,
}: {
  goals: Goal[];
  dailyNotes: Record<string, string>;
  dailyQuizLogs: Record<string, DailyQuizResponse>;
  now: Date;
}): void {
  const todayStr = toLocalDateStr(now);

  // Sheet 1: Resumen de Hábitos
  const summaryRows = goals.map((goal) => {
    const progress = calculateGoalProgress(goal, now);
    const modeLabel =
      goal.trackingMode === 'boolean'
        ? 'Sí / No'
        : goal.trackingMode === 'counter'
        ? 'Contador'
        : 'Medida';

    return {
      Hábito: goal.title,
      Área: goal.area || 'Personal',
      Estado: goal.isArchived ? 'Archivado' : 'Activo',
      'Tipo de registro': modeLabel,
      'Meta diaria': goal.dailyTarget,
      Unidad:
        goal.trackingMode === 'measure'
          ? goal.unit || ''
          : goal.trackingMode === 'counter'
          ? goal.stepLabel || 'repeticiones'
          : 'completado',
      Frecuencia: formatFrequencySummary(goal.frequency),
      'Fecha de inicio': goal.startDate,
      'Fecha límite': goal.deadlineDate,
      'Días cumplidos': Math.round(progress.completedDaysEquivalent * 10) / 10,
      'Días programados': progress.totalScheduledDays,
      'Avance actual (%)': Math.round(progress.actualPct),
      'Avance esperado (%)': Math.round(progress.expectedPct),
    };
  });

  // Sheet 2: Registros Diarios (all dates with progress, skip, quiz, or note)
  const recordRows: Array<Record<string, string | number>> = [];

  for (const goal of goals) {
    const dateSet = new Set<string>([
      ...Object.keys(goal.completions || {}),
      ...Object.keys(goal.skipped || {}),
      ...Object.keys(goal.notes || {}),
      ...Object.keys(goal.quizLogs || {}),
    ]);
    const sortedDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));

    for (const dStr of sortedDates) {
      const stats = getDayCompletionStats(goal, dStr);
      const isSkipped = Boolean(goal.skipped?.[dStr]) && stats.value === 0;
      const habitNote = goal.notes?.[dStr] || '';
      const dayNote = dailyNotes[dStr] || '';
      const quiz = goal.quizLogs?.[dStr] || dailyQuizLogs[dStr];

      if (stats.value === 0 && !isSkipped && !habitNote && !quiz) {
        continue;
      }

      const obstacleLabel = quiz?.frictionTags?.length
        ? quiz.frictionTags.map((t) => getFrictionTagLabel(t)).join(', ')
        : quiz?.obstacle
        ? getObstacleLabel(quiz.obstacle)
        : '';

      recordRows.push({
        Fecha: dStr,
        Hábito: goal.title,
        Área: goal.area || 'Personal',
        'Valor registrado': stats.value,
        'Meta diaria': stats.target,
        Unidad:
          goal.trackingMode === 'measure'
            ? goal.unit || ''
            : goal.trackingMode === 'counter'
            ? goal.stepLabel || 'rep.'
            : 'check',
        'Avance día (%)': stats.pct,
        Completado: stats.isDone ? 'Sí' : 'No',
        Omitido: isSkipped ? 'Sí' : 'No',
        Energía: quiz?.energyLevel ? getEnergyLevelLabel(quiz.energyLevel) : '',
        'Modo de ejecución': quiz?.executionMode
          ? getExecutionModeLabel(quiz.executionMode)
          : '',
        Obstáculo: obstacleLabel,
        'Punto de rotura': quiz?.breakPoint ? getBreakPointLabel(quiz.breakPoint) : '',
        Reacción: quiz?.reaction ? getReactionLabel(quiz.reaction) : '',
        'Nota del hábito': habitNote || quiz?.note || '',
        'Nota del día': dayNote,
      });
    }
  }

  // Also include standalone day notes/quizzes if not already covered by habit rows
  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(
    summaryRows.length > 0
      ? summaryRows
      : [{ Mensaje: 'No hay hábitos registrados todavía.' }]
  );
  wsSummary['!cols'] = [
    { wch: 24 },
    { wch: 14 },
    { wch: 11 },
    { wch: 16 },
    { wch: 12 },
    { wch: 14 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 15 },
    { wch: 16 },
    { wch: 17 },
    { wch: 19 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen de Hábitos');

  const wsRecords = XLSX.utils.json_to_sheet(
    recordRows.length > 0
      ? recordRows
      : [{ Mensaje: 'Aún no hay registros diarios.' }]
  );
  wsRecords['!cols'] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 14 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 11 },
    { wch: 10 },
    { wch: 18 },
    { wch: 22 },
    { wch: 24 },
    { wch: 26 },
    { wch: 26 },
    { wch: 30 },
    { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRecords, 'Registros Diarios');

  XLSX.writeFile(wb, `ritmo-datos-${todayStr}.xlsx`);
}
