import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart2,
  Bell,
  CalendarClock,
  Check,
  Download,
  Edit2,
  FileSpreadsheet,
  GripVertical,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  AnalysisVisibilitySettings,
  AppSettings,
  GlobalProgressSummary,
  Goal,
  GridDaysMode,
  MascotTrackId,
  WeeklyStatsMode,
} from '../types/tracker';
import { GoalIconBadge } from '../utils/colorAndIcons';
import { getMascotStage, MASCOT_TRACKS } from '../utils/gamification';
import {
  parseAndValidateBackup,
  ParsedBackupPreview,
} from '../utils/backupAndExport';
import { formatShortSpanishDate, toLocalDateStr } from '../utils/paceEngine';

interface MascotSettingsModalProps {
  settings: AppSettings;
  globalProgress: GlobalProgressSummary;
  activeGoals: Goal[];
  presetAreas: string[];
  areaCounts: Record<string, number>;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onReorderHabits: (orderedIds: string[]) => void;
  onAddArea: (name: string) => boolean;
  onRenameArea: (oldName: string, newName: string) => boolean;
  onDeleteArea: (name: string) => void;
  onClose: () => void;
  onOpenDailyReport: () => void;
  onOpenWeeklyReport: () => void;
  onOpenMonthlyReport: () => void;
  onExportJsonBackup: () => void;
  onImportJsonBackup: (preview: ParsedBackupPreview) => void;
  onExportExcel: () => void;
  onResetAllData: () => void;
}

const GRID_DAYS_OPTIONS: Array<{
  id: GridDaysMode;
  label: string;
  desc: string;
}> = [
  {
    id: 'week_monday',
    label: 'Semana completa',
    desc: 'Lunes a domingo',
  },
  {
    id: 'last_5',
    label: 'Últimos 5 días',
    desc: 'Vista compacta',
  },
  {
    id: 'last_7',
    label: 'Últimos 7 días',
    desc: 'Última semana móvil',
  },
];

const WEEKLY_STATS_OPTIONS: Array<{
  id: WeeklyStatsMode;
  label: string;
  desc: string;
}> = [
  {
    id: 'last_7',
    label: 'Últimos 7 días',
    desc: 'Ventana móvil hasta hoy',
  },
  {
    id: 'full_week',
    label: 'Semana completa',
    desc: 'Lunes a domingo',
  },
];

const REPORT_HOURS = [20, 21, 22, 23];

export const MascotSettingsModal: React.FC<MascotSettingsModalProps> = ({
  settings,
  globalProgress,
  activeGoals,
  presetAreas,
  areaCounts,
  onUpdateSettings,
  onReorderHabits,
  onAddArea,
  onRenameArea,
  onDeleteArea,
  onClose,
  onOpenDailyReport,
  onOpenWeeklyReport,
  onOpenMonthlyReport,
  onExportJsonBackup,
  onImportJsonBackup,
  onExportExcel,
  onResetAllData,
}) => {
  const stage = getMascotStage(settings.mascotTrackId, globalProgress.actualPct);
  const track = MASCOT_TRACKS[settings.mascotTrackId];

  const [newAreaDraft, setNewAreaDraft] = useState('');
  const [editingArea, setEditingArea] = useState<string | null>(null);
  const [editAreaDraft, setEditAreaDraft] = useState('');
  const [areaFeedback, setAreaFeedback] = useState<string | null>(null);

  const [pendingBackup, setPendingBackup] = useState<ParsedBackupPreview | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0);
  const [resetAcknowledged, setResetAcknowledged] = useState(false);
  const [resetConfirmWord, setResetConfirmWord] = useState('');

  const [draggingGoalId, setDraggingGoalId] = useState<string | null>(null);
  const goalRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const activeGoalIdsRef = useRef<string[]>([]);
  activeGoalIdsRef.current = activeGoals.map((g) => g.id);

  const lastBackupLabel = (() => {
    if (!settings.lastBackupAt) return 'Sin respaldo guardado todavía';
    const dt = new Date(settings.lastBackupAt);
    if (Number.isNaN(dt.getTime())) {
      return `Último respaldo: ${settings.lastBackupAt.slice(0, 10)}`;
    }
    return `Último respaldo: ${formatShortSpanishDate(toLocalDateStr(dt))}`;
  })();

  const handleSelectBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBackupError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const parsed = parseAndValidateBackup(text);
        setPendingBackup(parsed);
      } catch (err) {
        setPendingBackup(null);
        setBackupError(
          err instanceof Error
            ? err.message
            : 'No se pudo leer el archivo de respaldo.'
        );
      }
    };
    reader.onerror = () => {
      setBackupError('Ocurrió un error al leer el archivo seleccionado.');
    };
    reader.readAsText(file, 'utf-8');
  };

  const moveHabitOrder = (goalId: string, delta: -1 | 1) => {
    const ids = activeGoalIdsRef.current;
    const idx = ids.indexOf(goalId);
    const nextIdx = idx + delta;
    if (idx === -1 || nextIdx < 0 || nextIdx >= ids.length) return;
    const nextIds = [...ids];
    [nextIds[idx], nextIds[nextIdx]] = [nextIds[nextIdx], nextIds[idx]];
    onReorderHabits(nextIds);
  };

  useEffect(() => {
    if (!draggingGoalId) return;

    const handlePointerMove = (e: PointerEvent) => {
      const ids = activeGoalIdsRef.current;
      const curIdx = ids.indexOf(draggingGoalId);
      if (curIdx === -1) return;

      if (curIdx > 0) {
        const prevEl = goalRowRefs.current[ids[curIdx - 1]];
        if (prevEl) {
          const rect = prevEl.getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) {
            const nextIds = [...ids];
            [nextIds[curIdx - 1], nextIds[curIdx]] = [nextIds[curIdx], nextIds[curIdx - 1]];
            onReorderHabits(nextIds);
            return;
          }
        }
      }

      if (curIdx < ids.length - 1) {
        const nextEl = goalRowRefs.current[ids[curIdx + 1]];
        if (nextEl) {
          const rect = nextEl.getBoundingClientRect();
          if (e.clientY > rect.top + rect.height / 2) {
            const nextIds = [...ids];
            [nextIds[curIdx + 1], nextIds[curIdx]] = [nextIds[curIdx], nextIds[curIdx + 1]];
            onReorderHabits(nextIds);
          }
        }
      }
    };

    const handlePointerUp = () => {
      setDraggingGoalId(null);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [draggingGoalId, onReorderHabits]);

  const handleCreateArea = () => {
    const trimmed = newAreaDraft.trim();
    if (!trimmed) return;
    const added = onAddArea(trimmed);
    if (added) {
      setNewAreaDraft('');
      setAreaFeedback(null);
    } else {
      setAreaFeedback('Esa área ya existe.');
    }
  };

  const handleSaveRename = (oldName: string) => {
    const trimmed = editAreaDraft.trim();
    if (!trimmed) {
      setAreaFeedback('Escribe un nombre válido.');
      return;
    }
    if (trimmed === oldName) {
      setEditingArea(null);
      setAreaFeedback(null);
      return;
    }
    const ok = onRenameArea(oldName, trimmed);
    if (ok) {
      setEditingArea(null);
      setAreaFeedback(null);
    } else {
      setAreaFeedback('Ya existe un área con ese nombre.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 id="settings-modal-title" className="font-display text-lg font-bold text-slate-900">
            Configuración
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Grid Days Selector for Second View */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              Días visibles en vista cuadrícula
            </span>
            <div className="grid grid-cols-3 gap-2">
              {GRID_DAYS_OPTIONS.map((opt) => {
                const selected = settings.gridDaysMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateSettings({ gridDaysMode: opt.id })}
                    className={`p-2.5 rounded-xl border text-left transition-colors ${
                      selected
                        ? 'border-blue-600 bg-blue-50 text-slate-900'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold leading-tight">
                      {opt.label}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Weekly Stats Window Selector (Synced with Weekly Charts) */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              Periodo en gráficas y reporte semanal
            </span>
            <div className="grid grid-cols-2 gap-2">
              {WEEKLY_STATS_OPTIONS.map((opt) => {
                const currentWeeklyMode = settings.weeklyStatsMode ?? 'full_week';
                const selected = currentWeeklyMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateSettings({ weeklyStatsMode: opt.id })}
                    className={`p-2.5 rounded-xl border text-left transition-colors ${
                      selected
                        ? 'border-blue-600 bg-blue-50 text-slate-900'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold leading-tight">
                      {opt.label}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vista 4 (Análisis) Visibility Customization */}
          {(() => {
            const vis: AnalysisVisibilitySettings = {
              showGlobalChart: true,
              showFrictionDetail: true,
              showFrictionHistory: true,
              showDetailedHabitStats: true,
              ...(settings.analysisVisibility || {}),
            };
            const hasAnyHidden =
              !vis.showGlobalChart ||
              !vis.showFrictionDetail ||
              !vis.showFrictionHistory ||
              !vis.showDetailedHabitStats;
            const toggleVis = (key: keyof AnalysisVisibilitySettings) => {
              onUpdateSettings({
                analysisVisibility: {
                  ...vis,
                  [key]: !vis[key],
                },
              });
            };
            const rows: Array<{
              key: keyof AnalysisVisibilitySettings;
              label: string;
              desc: string;
              disabled?: boolean;
            }> = [
              {
                key: 'showGlobalChart',
                label: 'Tendencia y mapa de calor',
                desc: 'Gráfica global y consistencia por día',
              },
              {
                key: 'showFrictionDetail',
                label: 'Detalle y fricción',
                desc: 'Motivos de fallo e interpretación rápida',
              },
              {
                key: 'showFrictionHistory',
                label: 'Historial de fricción',
                desc: 'Lista cronológica de registros del cuestionario',
                disabled: !vis.showFrictionDetail,
              },
              {
                key: 'showDetailedHabitStats',
                label: 'Estadísticas detalladas por hábito',
                desc: 'Puntaje, racha y resumen individual debajo',
              },
            ];

            return (
              <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <BarChart2 className="w-3.5 h-3.5 text-[#3B4DF5]" aria-hidden="true" />
                      <span>Visualización en Análisis</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Elige qué bloques mostrar en la pestaña Análisis si prefieres una vista más simple.
                    </div>
                  </div>
                  {hasAnyHidden && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          analysisVisibility: {
                            showGlobalChart: true,
                            showFrictionDetail: true,
                            showFrictionHistory: true,
                            showDetailedHabitStats: true,
                          },
                        })
                      }
                      className="text-[11px] font-semibold text-[#3B4DF5] hover:underline shrink-0"
                    >
                      Mostrar todo
                    </button>
                  )}
                </div>

                <div className="space-y-2.5 pt-1">
                  {rows.map((row) => {
                    const checked = vis[row.key] && !row.disabled;
                    return (
                      <div
                        key={row.key}
                        className={`flex items-center justify-between gap-3 ${
                          row.disabled ? 'opacity-45' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800">
                            {row.label}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {row.desc}
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={checked}
                          disabled={row.disabled}
                          onClick={() => toggleVis(row.key)}
                          className="w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 disabled:cursor-not-allowed"
                          style={{
                            backgroundColor: checked ? '#3B4DF5' : '#CBD5E1',
                          }}
                        >
                          <span
                            className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                              checked ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Daily 10 PM Report Setting */}
          <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-[#3B4DF5]" aria-hidden="true" />
                  <span>Reporte diario en notificación</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Resumen automático de lo cumplido y lo pendiente.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.dailyReportEnabled}
                onClick={() =>
                  onUpdateSettings({
                    dailyReportEnabled: !settings.dailyReportEnabled,
                  })
                }
                className="w-12 h-7 rounded-full p-1 transition-colors shrink-0"
                style={{
                  backgroundColor: settings.dailyReportEnabled
                    ? '#3B4DF5'
                    : '#CBD5E1',
                }}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                    settings.dailyReportEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {settings.dailyReportEnabled && (
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] font-medium text-slate-600">
                  Hora del aviso:
                </span>
                <div className="flex items-center gap-1.5">
                  {REPORT_HOURS.map((h) => {
                    const active = settings.dailyReportHour === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => onUpdateSettings({ dailyReportHour: h })}
                        className={`px-2.5 h-8 rounded-lg font-mono text-xs font-semibold border transition-colors ${
                          active
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {h}:00
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900">
                  Viernes de Anticipación (5:00 PM)
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Aviso opcional para preparar tu mapa de calor del fin de semana.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.fridayAnticipationEnabled ?? true}
                onClick={() =>
                  onUpdateSettings({
                    fridayAnticipationEnabled: !(
                      settings.fridayAnticipationEnabled ?? true
                    ),
                  })
                }
                className="w-12 h-7 rounded-full p-1 transition-colors shrink-0"
                style={{
                  backgroundColor:
                    (settings.fridayAnticipationEnabled ?? true)
                      ? '#3B4DF5'
                      : '#CBD5E1',
                }}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                    (settings.fridayAnticipationEnabled ?? true)
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDailyReport();
                }}
                className="h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-[11px] sm:text-xs font-semibold text-slate-800"
              >
                Día
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenWeeklyReport();
                }}
                className="h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-[11px] sm:text-xs font-semibold text-slate-800"
              >
                Semanal
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMonthlyReport();
                }}
                className="h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-[11px] sm:text-xs font-semibold text-slate-800"
              >
                Mensual
              </button>
            </div>
          </div>

          {/* Current Global Evolution Banner */}
          <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-3xl shrink-0">
              {stage.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-slate-900">{stage.label}</div>
              <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                Avance global de {globalProgress.activeGoalsCount}{' '}
                {globalProgress.activeGoalsCount === 1 ? 'objetivo' : 'objetivos'}:{' '}
                <strong className="font-mono text-slate-800">
                  {Math.round(globalProgress.actualPct)}%
                </strong>
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5 tabular-nums">
                {globalProgress.completedUnits}/{globalProgress.totalUnits} tareas totales
              </div>
            </div>
          </div>

          {/* 4 Evolution Stages */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              Fases de evolución ({track.name})
            </span>
            <div className="grid grid-cols-4 gap-2">
              {track.stages.map((st, idx) => {
                const unlocked = globalProgress.actualPct >= st.minPct;
                const isCurrent = stage.index === idx;
                return (
                  <div
                    key={st.label}
                    className={`p-2.5 rounded-xl border text-center ${
                      isCurrent
                        ? 'border-blue-600 bg-blue-50'
                        : unlocked
                        ? 'border-slate-200 bg-slate-50'
                        : 'border-slate-100 bg-white opacity-45'
                    }`}
                  >
                    <div className="text-xl leading-none mb-1">{st.emoji}</div>
                    <div className="text-[10px] font-mono text-slate-600 tabular-nums">
                      {st.minPct}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Choose Mascot Track */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              Elegir mascota
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(MASCOT_TRACKS) as MascotTrackId[]).map((id) => {
                const item = MASCOT_TRACKS[id];
                const selected = settings.mascotTrackId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onUpdateSettings({ mascotTrackId: id })}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      selected
                        ? 'border-blue-600 bg-blue-50 text-slate-900'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="text-sm leading-none mb-1">
                      {item.stages.map((s) => s.emoji).join(' ')}
                    </div>
                    <div className="text-xs font-medium">{item.name}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Habit Display Order Manager */}
          {activeGoals.length > 1 && (
            <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 space-y-3">
              <div>
                <span className="block text-xs font-bold text-slate-900">
                  Orden de aparición de hábitos
                </span>
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  Arrastra o usa las flechas para definir cómo aparecen en tus vistas.
                </span>
              </div>

              <div className="space-y-1.5">
                {activeGoals.map((goal, idx) => {
                  const isDragging = draggingGoalId === goal.id;
                  return (
                    <div
                      key={goal.id}
                      ref={(el) => {
                        goalRowRefs.current[goal.id] = el;
                      }}
                      className={`flex items-center justify-between gap-2 bg-white rounded-xl border px-2.5 py-2 transition-all ${
                        isDragging
                          ? 'border-[#3B4DF5] ring-2 ring-[#3B4DF5]/25 shadow-sm'
                          : 'border-slate-200/80'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            setDraggingGoalId(goal.id);
                          }}
                          aria-label={`Arrastrar ${goal.title}`}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-grab active:cursor-grabbing touch-none shrink-0"
                        >
                          <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <GoalIconBadge
                          iconType={goal.iconType || 'icon'}
                          iconValue={goal.iconValue || 'activity'}
                          colorHex={goal.colorHex || '#3B4DF5'}
                          sizeClass="w-7 h-7"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-800 truncate">
                            {goal.title}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {goal.area || 'Personal'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveHabitOrder(goal.id, -1)}
                          aria-label={`Subir ${goal.title}`}
                          className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center"
                        >
                          <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === activeGoals.length - 1}
                          onClick={() => moveHabitOrder(goal.id, 1)}
                          aria-label={`Bajar ${goal.title}`}
                          className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center"
                        >
                          <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Preset Areas Manager */}
          <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 space-y-3">
            <div>
              <span className="block text-xs font-bold text-slate-900">
                Áreas preestablecidas
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                Edita, agrega o elimina las categorías disponibles para tus hábitos.
              </span>
            </div>

            <div className="space-y-1.5">
              {presetAreas.map((areaName) => {
                const count = areaCounts[areaName] || 0;
                const isEditingThis = editingArea === areaName;

                if (isEditingThis) {
                  return (
                    <div
                      key={areaName}
                      className="flex items-center gap-1.5 bg-white rounded-xl border border-blue-300 p-1.5"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={editAreaDraft}
                        onChange={(e) => setEditAreaDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveRename(areaName);
                          } else if (e.key === 'Escape') {
                            setEditingArea(null);
                            setAreaFeedback(null);
                          }
                        }}
                        aria-label={`Nuevo nombre para ${areaName}`}
                        className="flex-1 h-8 px-2.5 rounded-lg text-xs text-slate-900 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveRename(areaName)}
                        aria-label="Guardar nombre de área"
                        className="w-8 h-8 rounded-lg bg-[#3B4DF5] hover:bg-blue-700 text-white flex items-center justify-center shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingArea(null);
                          setAreaFeedback(null);
                        }}
                        aria-label="Cancelar edición"
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={areaName}
                    className="flex items-center justify-between gap-2 bg-white rounded-xl border border-slate-200/80 px-3 py-2"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-800 truncate">
                        {areaName}
                      </span>
                      {count > 0 && (
                        <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                          ({count})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingArea(areaName);
                          setEditAreaDraft(areaName);
                          setAreaFeedback(null);
                        }}
                        aria-label={`Editar área ${areaName}`}
                        title="Editar"
                        className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center"
                      >
                        <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        disabled={presetAreas.length <= 1}
                        onClick={() => {
                          onDeleteArea(areaName);
                          setAreaFeedback(null);
                        }}
                        aria-label={`Eliminar área ${areaName}`}
                        title={
                          presetAreas.length <= 1
                            ? 'Debe existir al menos un área'
                            : 'Eliminar'
                        }
                        className="w-7 h-7 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {areaFeedback && (
              <p className="text-[11px] font-medium text-rose-600">{areaFeedback}</p>
            )}

            <div className="flex items-center gap-2 pt-0.5">
              <input
                type="text"
                value={newAreaDraft}
                onChange={(e) => {
                  setNewAreaDraft(e.target.value);
                  if (areaFeedback) setAreaFeedback(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateArea();
                  }
                }}
                placeholder="Nueva área..."
                aria-label="Nueva área preestablecida"
                className="flex-1 h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400"
              />
              <button
                type="button"
                disabled={!newAreaDraft.trim()}
                onClick={handleCreateArea}
                className="px-3 h-9 rounded-xl bg-[#3B4DF5] hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Agregar</span>
              </button>
            </div>
          </div>

          {/* Backup & Excel Export Manager */}
          <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 space-y-3">
            <div>
              <span className="block text-xs font-bold text-slate-900">
                Copia de seguridad y Excel
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                {lastBackupLabel}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onExportJsonBackup}
                className="h-10 px-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-[#3B4DF5] shrink-0" aria-hidden="true" />
                <span>Exportar copia</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setBackupError(null);
                  fileInputRef.current?.click();
                }}
                className="h-10 px-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center justify-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden="true" />
                <span>Importar copia</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleSelectBackupFile}
                className="hidden"
                aria-label="Seleccionar archivo de copia de seguridad"
              />
            </div>

            {backupError && (
              <p role="alert" className="text-[11px] font-medium text-rose-600">
                {backupError}
              </p>
            )}

            {pendingBackup && (
              <div className="rounded-xl bg-white border border-indigo-200 p-3 space-y-2.5">
                <div className="text-xs font-semibold text-slate-900">
                  ¿Restaurar esta copia de seguridad?
                </div>
                <div className="text-[11px] text-slate-600 tabular-nums">
                  Contiene <strong>{pendingBackup.goalsCount}</strong>{' '}
                  {pendingBackup.goalsCount === 1 ? 'hábito' : 'hábitos'} y{' '}
                  <strong>{pendingBackup.notesCount}</strong> notas diarias
                  {pendingBackup.exportedAt
                    ? ` · Exportado el ${formatShortSpanishDate(
                        pendingBackup.exportedAt.slice(0, 10)
                      )}`
                    : ''}
                  . Esto reemplazará tus datos actuales.
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingBackup(null)}
                    className="px-3 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const chosen = pendingBackup;
                      setPendingBackup(null);
                      onImportJsonBackup(chosen);
                    }}
                    className="px-3 h-8 rounded-lg bg-[#3B4DF5] hover:bg-blue-700 text-white text-xs font-semibold"
                  >
                    Confirmar restauración
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onExportExcel}
              className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 hover:bg-emerald-50/50 hover:border-emerald-200 text-xs font-semibold text-slate-800 inline-flex items-center justify-center gap-2 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
              <span>Exportar datos a Excel (.xlsx)</span>
            </button>

            <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 text-[#3B4DF5]" aria-hidden="true" />
                  <span>Recordatorio semanal de respaldo</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Te avisa cada 7 días para guardar una copia.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(settings.weeklyBackupReminderEnabled)}
                onClick={() =>
                  onUpdateSettings({
                    weeklyBackupReminderEnabled: !settings.weeklyBackupReminderEnabled,
                  })
                }
                className="w-12 h-7 rounded-full p-1 transition-colors shrink-0"
                style={{
                  backgroundColor: settings.weeklyBackupReminderEnabled
                    ? '#3B4DF5'
                    : '#CBD5E1',
                }}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                    settings.weeklyBackupReminderEnabled
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Sound Setting */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-sm font-medium text-slate-800">
              Sonido al completar
            </span>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ soundEnabled: !settings.soundEnabled })
              }
              className={`px-3.5 h-10 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 ${
                settings.soundEnabled
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}
            >
              {settings.soundEnabled ? (
                <>
                  <Volume2 className="w-4 h-4" aria-hidden="true" />
                  <span>Activo</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4" aria-hidden="true" />
                  <span>Silenciado</span>
                </>
              )}
            </button>
          </div>

          {/* Double-Authenticated App Data Reset */}
          <div className="rounded-2xl bg-rose-50/70 border border-rose-200/80 p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900">
                  Restablecer información
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                  Borra todos tus hábitos, registros diarios, notas, cuestionarios y ajustes para empezar desde cero.
                </div>
              </div>
            </div>

            {resetStep === 0 && (
              <button
                type="button"
                onClick={() => {
                  setResetStep(1);
                  setResetAcknowledged(false);
                  setResetConfirmWord('');
                }}
                className="w-full h-10 px-3 rounded-xl bg-white border border-rose-200 hover:bg-rose-50 text-xs font-semibold text-rose-600 inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Restablecer toda la información</span>
              </button>
            )}

            {resetStep === 1 && (
              <div className="rounded-xl bg-white border border-rose-200 p-3 space-y-2.5">
                <div className="text-xs font-bold text-rose-700">
                  Paso 1 de 2 · Primera confirmación
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Se eliminará todo lo que hayas guardado en la aplicación. Si deseas conservar una copia antes de borrar, usa «Exportar copia» arriba.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setResetStep(0)}
                    className="px-3 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetStep(2)}
                    className="px-3 h-8 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            )}

            {resetStep === 2 && (
              <div className="rounded-xl bg-white border border-rose-300 p-3 space-y-3">
                <div className="text-xs font-bold text-rose-700">
                  Paso 2 de 2 · Doble verificación
                </div>

                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={resetAcknowledged}
                    onChange={(e) => setResetAcknowledged(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span className="text-[11px] text-slate-700 leading-snug">
                    Confirmo que entiendo que esta acción es permanente y no se puede deshacer.
                  </span>
                </label>

                <div className="space-y-1">
                  <label
                    htmlFor="reset-confirm-input"
                    className="block text-[11px] font-medium text-slate-600"
                  >
                    Escribe <strong className="font-mono text-rose-700">BORRAR</strong> para confirmar:
                  </label>
                  <input
                    id="reset-confirm-input"
                    type="text"
                    value={resetConfirmWord}
                    onChange={(e) => setResetConfirmWord(e.target.value)}
                    placeholder="BORRAR"
                    autoComplete="off"
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-rose-400"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetStep(0);
                      setResetAcknowledged(false);
                      setResetConfirmWord('');
                    }}
                    className="px-3 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={
                      !resetAcknowledged ||
                      resetConfirmWord.trim().toUpperCase() !== 'BORRAR'
                    }
                    onClick={() => {
                      setResetStep(0);
                      setResetAcknowledged(false);
                      setResetConfirmWord('');
                      onResetAllData();
                    }}
                    className="px-3 h-8 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-semibold transition-opacity"
                  >
                    Borrar todo definitivamente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
