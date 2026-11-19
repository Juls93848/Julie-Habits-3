import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Minus,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  FrequencyType,
  Goal,
  HabitFrequency,
  HabitType,
  PRESET_AREAS,
  TapAction,
  TrackingMode,
} from '../types/tracker';
import {
  EMOJI_CATALOG,
  GoalIconBadge,
  ICON_CATALOG,
  isValidHexInput,
  normalizeHex,
  PRESET_COLORS,
} from '../utils/colorAndIcons';
import {
  addDays,
  formatFrequencySummary,
  formatPermanentCycleLabel,
  formatShortSpanishDate,
  getPermanentCycleDays,
  toLocalDateStr,
} from '../utils/paceEngine';

interface GoalBuilderModalProps {
  initialGoal?: Goal | null;
  presetAreas?: string[];
  onClose: () => void;
  onSave: (goal: Goal) => void;
  onAddPresetArea?: (areaName: string) => void;
}

type ModalScreen = 'main' | 'frequency' | 'icon';

const WEEKDAYS_ORDERED = [
  { id: 1, short: 'L', full: 'Lun' },
  { id: 2, short: 'M', full: 'Mar' },
  { id: 3, short: 'X', full: 'Mié' },
  { id: 4, short: 'J', full: 'Jue' },
  { id: 5, short: 'V', full: 'Vie' },
  { id: 6, short: 'S', full: 'Sáb' },
  { id: 0, short: 'D', full: 'Dom' },
];

const FREQUENCY_OPTIONS: Array<{
  type: FrequencyType;
  label: string;
  dots: number[];
}> = [
  { type: 'everyday', label: 'Todos los días', dots: [1, 1, 1, 1, 1, 1, 1] },
  { type: 'specific_days', label: 'Días concretos', dots: [1, 1, 1, 1, 1, 0, 0] },
  { type: 'times_per_week', label: 'Veces por semana', dots: [1, 0, 1, 0, 1, 0, 0] },
  { type: 'times_per_month', label: 'Veces al mes', dots: [1, 1, 0, 0, 0, 1, 0] },
  { type: 'every_n_days', label: 'Cada pocos días', dots: [1, 0, 0, 1, 0, 0, 1] },
];

export const GoalBuilderModal: React.FC<GoalBuilderModalProps> = ({
  initialGoal,
  presetAreas = [...PRESET_AREAS],
  onClose,
  onSave,
  onAddPresetArea,
}) => {
  const today = toLocalDateStr(new Date());

  const [screen, setScreen] = useState<ModalScreen>('main');
  const [title, setTitle] = useState(initialGoal?.title || '');
  const habitType: HabitType = initialGoal?.habitType || 'build';
  const [trackingMode, setTrackingMode] = useState<TrackingMode>(
    initialGoal?.trackingMode || 'boolean'
  );
  const [unit, setUnit] = useState(initialGoal?.unit || '');
  const [stepLabel, setStepLabel] = useState(initialGoal?.stepLabel || '');
  const [dailyTarget, setDailyTarget] = useState<number>(
    initialGoal?.dailyTarget && initialGoal.dailyTarget > 0
      ? initialGoal.dailyTarget
      : 1
  );
  const [dailyTargetDraft, setDailyTargetDraft] = useState<string>(() =>
    String(
      initialGoal?.dailyTarget && initialGoal.dailyTarget > 0
        ? initialGoal.dailyTarget
        : 1
    )
  );
  const [tapAction, setTapAction] = useState<TapAction>(
    initialGoal?.tapAction || 'add_1'
  );

  const [area, setArea] = useState(
    initialGoal?.area || presetAreas[0] || 'Personal'
  );
  const [customArea, setCustomArea] = useState(() => {
    if (
      initialGoal?.area &&
      !presetAreas.some(
        (p) => p.toLowerCase() === initialGoal.area.trim().toLowerCase()
      )
    ) {
      return initialGoal.area;
    }
    return '';
  });

  const [startDate, setStartDate] = useState(initialGoal?.startDate || today);
  const [deadlineDate, setDeadlineDate] = useState(
    initialGoal?.deadlineDate || addDays(today, 9)
  );

  const [colorHex, setColorHex] = useState<string>(
    normalizeHex(initialGoal?.colorHex || '#3B4DF5')
  );
  const [hexDraft, setHexDraft] = useState<string>(
    normalizeHex(initialGoal?.colorHex || '#3B4DF5')
  );

  const [iconType, setIconType] = useState<'icon' | 'emoji' | 'image'>(
    initialGoal?.iconType || 'icon'
  );
  const [iconValue, setIconValue] = useState<string>(
    initialGoal?.iconValue || 'activity'
  );
  const [iconTab, setIconTab] = useState<'icon' | 'emoji' | 'image'>(
    initialGoal?.iconType || 'icon'
  );
  const [iconSearch, setIconSearch] = useState('');
  const [imageUrlDraft, setImageUrlDraft] = useState(
    initialGoal?.iconType === 'image' ? initialGoal.iconValue : ''
  );

  const [frequency, setFrequency] = useState<HabitFrequency>(
    initialGoal?.frequency || {
      type: 'everyday',
      weekdays: [1, 2, 3, 4, 5],
      count: 3,
      intervalDays: 2,
    }
  );

  const [trackPace, setTrackPace] = useState<boolean>(
    initialGoal?.trackPace ?? false
  );
  const [isPermanent, setIsPermanent] = useState<boolean>(
    Boolean(initialGoal?.isPermanent)
  );
  const [permanentCycleDays, setPermanentCycleDays] = useState<number>(() =>
    getPermanentCycleDays(initialGoal)
  );
  const [error, setError] = useState<string | null>(null);

  const filteredIcons = useMemo(() => {
    const q = iconSearch.trim().toLowerCase();
    if (!q) return ICON_CATALOG;
    return ICON_CATALOG.filter(
      (i) => i.label.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)
    );
  }, [iconSearch]);

  const filteredEmojis = useMemo(() => {
    const q = iconSearch.trim().toLowerCase();
    if (!q) return EMOJI_CATALOG;
    return EMOJI_CATALOG.filter(
      (e) => e.label.toLowerCase().includes(q) || e.emoji.includes(q)
    );
  }, [iconSearch]);

  const applyDurationPreset = (days: number) => {
    setDeadlineDate(addDays(startDate, days - 1));
  };

  const handleHexInputChange = (val: string) => {
    setHexDraft(val);
    if (isValidHexInput(val)) {
      setColorHex(normalizeHex(val));
    }
  };

  const handleNativeColorChange = (val: string) => {
    const norm = normalizeHex(val);
    setColorHex(norm);
    setHexDraft(norm);
  };

  const toggleWeekday = (dayId: number) => {
    setFrequency((prev) => {
      const current = prev.weekdays || [1, 2, 3, 4, 5];
      const exists = current.includes(dayId);
      const next = exists
        ? current.length > 1
          ? current.filter((d) => d !== dayId)
          : current
        : [...current, dayId];
      return { ...prev, type: 'specific_days', weekdays: next };
    });
  };

  const handleApplyImageUrl = () => {
    const trimmed = imageUrlDraft.trim();
    if (!trimmed) return;
    setIconType('image');
    setIconValue(trimmed);
    setScreen('main');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Escribe un nombre para tu hábito.');
      return;
    }
    const safeStartDate = startDate || today;
    const safeCycleDays = Math.max(
      1,
      Math.min(365, Math.round(Number(permanentCycleDays) || 30))
    );
    const finalDeadline = isPermanent
      ? addDays(safeStartDate, safeCycleDays - 1)
      : deadlineDate;

    if (!isPermanent && finalDeadline < safeStartDate) {
      setError('La fecha límite debe ser igual o posterior a la fecha de inicio.');
      return;
    }

    const rawArea = customArea.trim() || area.trim() || presetAreas[0] || 'Personal';
    const matchedPreset = presetAreas.find(
      (p) => p.toLowerCase() === rawArea.toLowerCase()
    );
    const finalArea = matchedPreset || rawArea;
    if (!matchedPreset && rawArea) {
      onAddPresetArea?.(rawArea);
    }

    const parsedTarget = Number(dailyTargetDraft.replace(',', '.'));
    const rawTarget = Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : dailyTarget;
    const finalTarget =
      trackingMode === 'boolean'
        ? 1
        : trackingMode === 'counter'
        ? Math.max(1, Math.round(rawTarget || 1))
        : Math.max(0.1, Number(rawTarget) || 1);

    const goal: Goal = {
      id:
        initialGoal?.id ||
        `goal-${cleanTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}-${Date.now().toString().slice(-4)}`,
      title: cleanTitle,
      area: finalArea,
      habitType,
      trackingMode,
      unit: trackingMode === 'measure' ? unit.trim() || undefined : undefined,
      stepLabel:
        trackingMode === 'counter' ? stepLabel.trim() || undefined : undefined,
      dailyTarget: finalTarget,
      tapAction,
      startDate: safeStartDate,
      deadlineDate: finalDeadline,
      colorHex: normalizeHex(colorHex),
      iconType,
      iconValue,
      frequency,
      trackPace,
      phaseNumber: initialGoal?.phaseNumber || 1,
      isPermanent,
      permanentCycleDays: safeCycleDays,
      isArchived: initialGoal?.isArchived ?? false,
      phaseHistory: initialGoal?.phaseHistory || [],
      completions: initialGoal?.completions || {},
      skipped: initialGoal?.skipped || {},
      quizLogs: initialGoal?.quizLogs || {},
      notes: initialGoal?.notes || {},
      createdAt: initialGoal?.createdAt || new Date().toISOString(),
    };

    onSave(goal);
  };

  const activeDotsForCurrentFreq =
    FREQUENCY_OPTIONS.find((f) => f.type === frequency.type)?.dots ||
    [1, 1, 1, 1, 1, 1, 1];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-goal-title"
    >
      <div className="w-full max-w-lg bg-[#F7F7FA] sm:bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-slate-100">
          {screen === 'main' ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setScreen('main')}
              aria-label="Volver"
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
          )}

          <h2 id="modal-goal-title" className="font-display text-base sm:text-lg font-bold text-slate-900">
            {screen === 'frequency'
              ? 'Repetición'
              : screen === 'icon'
              ? 'Elegir ícono'
              : initialGoal
              ? 'Editar hábito'
              : 'Nuevo hábito'}
          </h2>

          <div className="w-9 flex justify-end">
            {screen === 'main' && (
              <GoalIconBadge
                iconType={iconType}
                iconValue={iconValue}
                colorHex={colorHex}
                sizeClass="w-9 h-9"
              />
            )}
          </div>
        </div>

        {/* SCREEN 1: FREQUENCY PICKER */}
        {screen === 'frequency' && (
          <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto bg-[#F7F7FA]">
            <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase px-1">
              REPETICIÓN
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden">
              {FREQUENCY_OPTIONS.map((opt) => {
                const selected = frequency.type === opt.type;
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() =>
                      setFrequency((prev) => ({
                        type: opt.type,
                        weekdays: prev.weekdays || [1, 2, 3, 4, 5],
                        count:
                          opt.type === 'times_per_month'
                            ? prev.type === 'times_per_month'
                              ? prev.count || 10
                              : 10
                            : prev.count || 3,
                        intervalDays: prev.intervalDays || 2,
                      }))
                    }
                    className={`w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left transition-colors ${
                      selected ? 'bg-rose-50/40' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1" aria-hidden="true">
                        {opt.dots.map((on, i) => (
                          <span
                            key={i}
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: on
                                ? colorHex
                                : 'rgba(148, 163, 184, 0.35)',
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-medium text-slate-900">
                        {opt.label}
                      </span>
                    </div>

                    {selected ? (
                      <span
                        className="w-6 h-6 rounded-full text-white flex items-center justify-center shrink-0"
                        style={{ backgroundColor: colorHex }}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" aria-hidden="true" />
                      </span>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-300" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>

            {frequency.type === 'specific_days' && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
                <div className="text-xs font-semibold text-slate-700 mb-2.5">
                  Selecciona los días de la semana
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS_ORDERED.map((d) => {
                    const active = (frequency.weekdays || [1, 2, 3, 4, 5]).includes(
                      d.id
                    );
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleWeekday(d.id)}
                        aria-label={d.full}
                        aria-pressed={active}
                        className="h-10 rounded-xl text-xs font-bold transition-colors border"
                        style={{
                          backgroundColor: active ? colorHex : '#FFFFFF',
                          color: active ? '#FFFFFF' : '#475569',
                          borderColor: active ? colorHex : '#E2E8F0',
                        }}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {frequency.type === 'times_per_week' && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-800">
                  Días por semana
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setFrequency((p) => ({
                        ...p,
                        count: Math.max(1, (p.count || 3) - 1),
                      }))
                    }
                    className="w-9 h-9 rounded-xl border border-slate-200 font-bold text-slate-700"
                  >
                    −
                  </button>
                  <span className="font-mono text-sm font-bold min-w-[40px] text-center">
                    {frequency.count || 3}x
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFrequency((p) => ({
                        ...p,
                        count: Math.min(6, (p.count || 3) + 1),
                      }))
                    }
                    className="w-9 h-9 rounded-xl text-white font-bold"
                    style={{ backgroundColor: colorHex }}
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {frequency.type === 'times_per_month' && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-800">
                  Veces al mes
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setFrequency((p) => ({
                        ...p,
                        count: Math.max(1, (p.count || 10) - 1),
                      }))
                    }
                    className="w-9 h-9 rounded-xl border border-slate-200 font-bold text-slate-700"
                  >
                    −
                  </button>
                  <span className="font-mono text-sm font-bold min-w-[44px] text-center">
                    {frequency.count || 10}x
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFrequency((p) => ({
                        ...p,
                        count: Math.min(28, (p.count || 10) + 1),
                      }))
                    }
                    className="w-9 h-9 rounded-xl text-white font-bold"
                    style={{ backgroundColor: colorHex }}
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {frequency.type === 'every_n_days' && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-800">
                  Repetir cada
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setFrequency((p) => ({
                        ...p,
                        intervalDays: Math.max(2, (p.intervalDays || 2) - 1),
                      }))
                    }
                    className="w-9 h-9 rounded-xl border border-slate-200 font-bold text-slate-700"
                  >
                    −
                  </button>
                  <span className="font-mono text-sm font-bold min-w-[60px] text-center">
                    {frequency.intervalDays || 2} días
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFrequency((p) => ({
                        ...p,
                        intervalDays: Math.min(14, (p.intervalDays || 2) + 1),
                      }))
                    }
                    className="w-9 h-9 rounded-xl text-white font-bold"
                    style={{ backgroundColor: colorHex }}
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setScreen('main')}
              className="w-full h-11 rounded-full text-white text-sm font-semibold"
              style={{ backgroundColor: colorHex }}
            >
              Listo
            </button>
          </div>
        )}

        {/* SCREEN 2: ICON, EMOJI & IMAGE URL PICKER */}
        {screen === 'icon' && (
          <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto bg-[#F7F7FA]">
            <div className="flex items-center p-1 bg-white border border-slate-200 rounded-full">
              <button
                type="button"
                onClick={() => setIconTab('icon')}
                className={`flex-1 h-9 rounded-full text-xs font-semibold transition-colors ${
                  iconTab === 'icon'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Ícono
              </button>
              <button
                type="button"
                onClick={() => setIconTab('emoji')}
                className={`flex-1 h-9 rounded-full text-xs font-semibold transition-colors ${
                  iconTab === 'emoji'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Emoji
              </button>
              <button
                type="button"
                onClick={() => setIconTab('image')}
                className={`flex-1 h-9 rounded-full text-xs font-semibold transition-colors ${
                  iconTab === 'image'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                URL Imagen
              </button>
            </div>

            {iconTab !== 'image' ? (
              <>
                <div className="relative">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={iconSearch}
                    onChange={(e) => setIconSearch(e.target.value)}
                    placeholder="Buscar ícono o actividad..."
                    className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-2 focus:outline-blue-600"
                  />
                </div>

                {iconTab === 'icon' ? (
                  <div className="grid grid-cols-6 gap-2">
                    {filteredIcons.map((entry) => {
                      const Comp = entry.Component;
                      const selected =
                        iconType === 'icon' && iconValue === entry.id;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => {
                            setIconType('icon');
                            setIconValue(entry.id);
                            setScreen('main');
                          }}
                          title={entry.label}
                          aria-label={entry.label}
                          className={`h-12 rounded-xl bg-white border flex items-center justify-center transition-all ${
                            selected
                              ? 'ring-2 ring-blue-600 border-blue-600 text-blue-600'
                              : 'border-slate-200/80 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Comp className="w-5 h-5" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-6 gap-2">
                    {filteredEmojis.map((item) => {
                      const selected =
                        iconType === 'emoji' && iconValue === item.emoji;
                      return (
                        <button
                          key={item.emoji}
                          type="button"
                          onClick={() => {
                            setIconType('emoji');
                            setIconValue(item.emoji);
                            setScreen('main');
                          }}
                          title={item.label}
                          aria-label={item.label}
                          className={`h-12 rounded-xl bg-white border flex items-center justify-center text-xl transition-all ${
                            selected
                              ? 'ring-2 ring-blue-600 border-blue-600'
                              : 'border-slate-200/80 hover:bg-slate-50'
                          }`}
                        >
                          {item.emoji}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-4">
                <div>
                  <label
                    htmlFor="icon-image-url"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Enlace de la imagen (URL)
                  </label>
                  <input
                    id="icon-image-url"
                    type="url"
                    value={imageUrlDraft}
                    onChange={(e) => setImageUrlDraft(e.target.value)}
                    placeholder="https://ejemplo.com/mi-icono.png"
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-2 focus:outline-blue-600"
                  />
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                  {imageUrlDraft.trim() ? (
                    <GoalIconBadge
                      iconType="image"
                      iconValue={imageUrlDraft.trim()}
                      colorHex={colorHex}
                      sizeClass="w-12 h-12"
                      alt="Vista previa de imagen"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400">
                      <ImageIcon className="w-5 h-5" aria-hidden="true" />
                    </div>
                  )}
                  <div className="text-xs text-slate-600">
                    Vista previa del ícono cuadrado. Pega una URL directa de PNG, JPG, SVG o WebP.
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!imageUrlDraft.trim()}
                  onClick={handleApplyImageUrl}
                  className="w-full h-11 rounded-full text-white text-sm font-semibold disabled:opacity-40"
                  style={{ backgroundColor: colorHex }}
                >
                  Usar esta imagen
                </button>
              </div>
            )}
          </div>
        )}

        {/* SCREEN 3: MAIN HABIT BUILDER FORM */}
        {screen === 'main' && (
          <form
            onSubmit={handleSubmit}
            className="p-5 space-y-4 max-h-[80vh] overflow-y-auto bg-[#F7F7FA]"
          >
            {error && (
              <div
                role="alert"
                className="px-3.5 py-2.5 rounded-xl bg-red-50 text-red-800 text-xs font-medium"
              >
                {error}
              </div>
            )}

            {/* Name */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5">
              <label
                htmlFor="goal-title"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                Nombre
              </label>
              <input
                id="goal-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Tomar agua, Leer, Correr..."
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-2 focus:outline-blue-600"
              />
            </div>

            {/* REPETICIÓN */}
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-1">
                Repetición
              </span>
              <button
                type="button"
                onClick={() => setScreen('frequency')}
                className="w-full px-4 py-3.5 rounded-2xl bg-white border border-slate-200/80 hover:bg-slate-50 flex items-center justify-between gap-3"
              >
                <span className="text-sm font-medium text-slate-900">
                  {formatFrequencySummary(frequency)}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1" aria-hidden="true">
                    {activeDotsForCurrentFreq.map((on, i) => (
                      <span
                        key={i}
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: on
                            ? colorHex
                            : 'rgba(148, 163, 184, 0.35)',
                        }}
                      />
                    ))}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
                </div>
              </button>
            </div>

            {/* REGISTRO: Sí / No | Contador | Medida */}
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-1">
                Registro
              </span>
              <div className="grid grid-cols-3 p-1 rounded-2xl bg-white border border-slate-200/80">
                {(
                  [
                    { id: 'boolean', label: 'Sí / No' },
                    { id: 'counter', label: 'Contador' },
                    { id: 'measure', label: 'Medida' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      setTrackingMode(mode.id);
                      if (mode.id === 'counter') {
                        const rounded = Math.max(1, Math.round(dailyTarget || 1));
                        setDailyTarget(rounded);
                        setDailyTargetDraft(String(rounded));
                      }
                    }}
                    className={`h-10 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                      trackingMode === mode.id
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-500 text-center">
                {trackingMode === 'boolean'
                  ? 'Marca el día — hecho o no hecho'
                  : trackingMode === 'counter'
                  ? 'Cuenta hacia una meta diaria — vasos, series, páginas'
                  : 'Registra cantidades con unidad — 2 L de agua, 7,5 km'}
              </p>
            </div>

            {/* ETIQUETA DE PASOS (optional for Contador) */}
            {trackingMode === 'counter' && (
              <div>
                <label
                  htmlFor="habit-step-label"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-1"
                >
                  Etiqueta de cada tarea (opcional)
                </label>
                <input
                  id="habit-step-label"
                  type="text"
                  value={stepLabel}
                  onChange={(e) => setStepLabel(e.target.value)}
                  placeholder="Ej. Sesión, Vaso, Capítulo..."
                  className="w-full h-11 px-4 rounded-2xl bg-white border border-slate-200/80 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-blue-600"
                />
                <p className="mt-1.5 text-xs text-slate-500 text-center">
                  En tu checklist diario verás: {stepLabel.trim() || 'Sesión'} 1,{' '}
                  {stepLabel.trim() || 'Sesión'} 2...
                </p>
              </div>
            )}

            {/* UNIDAD (only for Medida) */}
            {trackingMode === 'measure' && (
              <div>
                <label
                  htmlFor="habit-unit"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-1"
                >
                  Unidad
                </label>
                <input
                  id="habit-unit"
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="km, páginas, minutos..."
                  className="w-full h-11 px-4 rounded-2xl bg-white border border-slate-200/80 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-blue-600"
                />
              </div>
            )}

            {/* META DIARIA & AL TOCAR (for Contador and Medida) */}
            {trackingMode !== 'boolean' && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between px-1 mb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Meta diaria
                    </span>
                    <div className="flex items-center gap-1" aria-hidden="true">
                      <span className="w-2 h-2 rounded-sm bg-rose-200" />
                      <span
                        className="w-2 h-2 rounded-sm"
                        style={{ backgroundColor: colorHex }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-12 px-4 rounded-2xl bg-white border border-slate-200/80 flex items-center gap-1.5">
                      <input
                        type="number"
                        step={trackingMode === 'measure' ? 'any' : '1'}
                        min={trackingMode === 'measure' ? 0.1 : 1}
                        inputMode={trackingMode === 'measure' ? 'decimal' : 'numeric'}
                        value={dailyTargetDraft}
                        onChange={(e) => {
                          const nextDraft = e.target.value;
                          setDailyTargetDraft(nextDraft);
                          const parsed = Number(nextDraft.replace(',', '.'));
                          if (Number.isFinite(parsed) && parsed > 0) {
                            setDailyTarget(
                              trackingMode === 'counter'
                                ? Math.max(1, Math.round(parsed))
                                : parsed
                            );
                          }
                        }}
                        onBlur={() => {
                          const parsed = Number(dailyTargetDraft.replace(',', '.'));
                          const normalized =
                            trackingMode === 'counter'
                              ? Math.max(1, Math.round(Number.isFinite(parsed) && parsed > 0 ? parsed : 1))
                              : Math.max(0.1, Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
                          setDailyTarget(normalized);
                          setDailyTargetDraft(String(normalized));
                        }}
                        aria-label="Meta diaria"
                        className="w-20 font-mono text-base font-bold text-slate-900 bg-transparent focus:outline-none"
                      />
                      <span className="text-sm text-slate-400">
                        / Día{trackingMode === 'measure' && unit.trim() ? ` (${unit.trim()})` : ''}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const next = Math.max(
                          trackingMode === 'measure' ? 0.5 : 1,
                          Number(
                            (
                              dailyTarget -
                              (trackingMode === 'measure' && dailyTarget <= 2 ? 0.5 : 1)
                            ).toFixed(1)
                          )
                        );
                        setDailyTarget(next);
                        setDailyTargetDraft(String(next));
                      }}
                      aria-label="Disminuir meta diaria"
                      className="w-14 h-12 rounded-2xl bg-white border border-slate-200/80 hover:bg-slate-50 flex items-center justify-center text-slate-700"
                    >
                      <Minus className="w-4 h-4" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const next = Number((dailyTarget + 1).toFixed(1));
                        setDailyTarget(next);
                        setDailyTargetDraft(String(next));
                      }}
                      aria-label="Aumentar meta diaria"
                      className="w-14 h-12 rounded-2xl bg-white border border-slate-200/80 hover:bg-slate-50 flex items-center justify-center text-slate-700"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>

                  <p className="mt-1.5 text-xs text-slate-500 text-center">
                    Al llegar a esta cantidad, el día queda completado
                  </p>
                </div>

                {/* FORMATO DE REGISTRO / AL TOCAR */}
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-1">
                    {trackingMode === 'measure' ? 'Formato en tu lista diaria' : 'Al tocar'}
                  </span>
                  <div className="grid grid-cols-2 p-1 rounded-2xl bg-white border border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => setTapAction('add_1')}
                      className={`h-10 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                        tapAction === 'add_1'
                          ? 'bg-slate-100 text-slate-900'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {trackingMode === 'measure' ? 'Formato check' : 'Añadir 1'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTapAction('enter_total')}
                      className={`h-10 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                        tapAction === 'enter_total'
                          ? 'bg-slate-100 text-slate-900'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {trackingMode === 'measure'
                        ? 'Agregar número manual'
                        : 'Introducir total'}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500 text-center">
                    {trackingMode === 'measure'
                      ? tapAction === 'add_1'
                        ? dailyTarget > 15 || !Number.isInteger(dailyTarget)
                          ? 'Las casillas individuales se muestran para enteros de hasta 15 (ej. 3 comidas). Toca el check para llenar todo o mantenlo presionado para escribir la cantidad.'
                          : 'Muestra casillas de check paso a paso (ideal para metas cortas como 3 comidas). Mantén presionado el check principal para escribir una cantidad.'
                        : 'Toca el check para completar toda la meta o mantenlo presionado para escribir la cantidad exacta manualmente.'
                      : tapAction === 'add_1'
                      ? 'Muestra casillas paso a paso (hasta 15). Toca el check principal para llenar todo o mantenlo presionado para escribir el total.'
                      : 'Toca el check para completar toda la meta o mantenlo presionado para escribir el total manualmente.'}
                  </p>
                </div>
              </div>
            )}

            {/* Icon / Image URL & Exact Color Picker */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-700">
                  Ícono, Emoji o URL de imagen
                </span>
                <button
                  type="button"
                  onClick={() => setScreen('icon')}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-800"
                >
                  <GoalIconBadge
                    iconType={iconType}
                    iconValue={iconValue}
                    colorHex={colorHex}
                    sizeClass="w-7 h-7"
                  />
                  <span>Cambiar</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Color y código HEX
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={colorHex}
                      onChange={(e) => handleNativeColorChange(e.target.value)}
                      aria-label="Selector de color exacto"
                      className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
                    />
                    <input
                      type="text"
                      value={hexDraft}
                      onChange={(e) => handleHexInputChange(e.target.value)}
                      maxLength={7}
                      aria-label="Código hexadecimal de color"
                      placeholder="#3B4DF5"
                      className="w-22 h-8 px-2 rounded-lg border border-slate-200 font-mono text-xs text-slate-800 uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                  {PRESET_COLORS.map((c) => {
                    const selected =
                      normalizeHex(colorHex) === normalizeHex(c.hex);
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => handleNativeColorChange(c.hex)}
                        aria-label={c.label}
                        title={c.label}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform ${
                          selected ? 'ring-2 ring-slate-900 ring-offset-2 scale-105' : ''
                        }`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {selected && (
                          <Check className="w-3.5 h-3.5 text-white stroke-[3]" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Area Selector */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
              <span className="block text-xs font-semibold text-slate-700 mb-2">
                Área
              </span>
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {presetAreas.map((item) => {
                  const isSelected = !customArea.trim() && area === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setArea(item);
                        setCustomArea('');
                      }}
                      className={`px-3 h-8 rounded-xl text-xs font-semibold border transition-colors ${
                        isSelected
                          ? 'text-white border-transparent'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                      style={isSelected ? { backgroundColor: colorHex } : undefined}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customArea}
                  onChange={(e) => setCustomArea(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const trimmed = customArea.trim();
                      if (!trimmed) return;
                      const existing = presetAreas.find(
                        (p) => p.toLowerCase() === trimmed.toLowerCase()
                      );
                      if (existing) {
                        setArea(existing);
                      } else {
                        onAddPresetArea?.(trimmed);
                        setArea(trimmed);
                      }
                      setCustomArea('');
                    }
                  }}
                  placeholder="Agregar nueva área (se guarda en tus áreas)..."
                  aria-label="Nueva área"
                  className="flex-1 h-9 px-3 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400"
                />
                {customArea.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = customArea.trim();
                      if (!trimmed) return;
                      const existing = presetAreas.find(
                        (p) => p.toLowerCase() === trimmed.toLowerCase()
                      );
                      if (existing) {
                        setArea(existing);
                      } else {
                        onAddPresetArea?.(trimmed);
                        setArea(trimmed);
                      }
                      setCustomArea('');
                    }}
                    className="px-3 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Agregar</span>
                  </button>
                )}
              </div>
            </div>

            {/* Dates & Phase Mode */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">
                  Duración / Etapa
                </span>
                <div className="inline-flex rounded-xl bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setIsPermanent(false)}
                    className={`px-2.5 h-7 rounded-lg text-[11px] font-semibold transition-colors ${
                      !isPermanent
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Proyecto temporal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPermanent(true);
                      const d = Math.max(1, Math.min(365, Math.round(permanentCycleDays || 30)));
                      setDeadlineDate(addDays(startDate, d - 1));
                    }}
                    className={`px-2.5 h-7 rounded-lg text-[11px] font-semibold transition-colors ${
                      isPermanent
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Permanente
                  </button>
                </div>
              </div>

              {isPermanent ? (
                <div className="space-y-3">
                  <div>
                    <span className="block text-[11px] font-medium text-slate-500 mb-1.5">
                      Evaluar progreso en ciclos de
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {[
                        { days: 7, label: 'Semanal (7d)' },
                        { days: 14, label: 'Quincenal (14d)' },
                        { days: 15, label: '15 días' },
                        { days: 30, label: 'Mensual (30d)' },
                      ].map((opt) => {
                        const selected = permanentCycleDays === opt.days;
                        return (
                          <button
                            key={opt.days}
                            type="button"
                            onClick={() => {
                              setPermanentCycleDays(opt.days);
                              setDeadlineDate(addDays(startDate, opt.days - 1));
                            }}
                            className={`h-9 px-2 rounded-xl border text-[11px] font-semibold transition-colors ${
                              selected
                                ? 'text-white border-transparent'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                            style={selected ? { backgroundColor: colorHex } : undefined}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="goal-cycle-days"
                        className="block text-[11px] text-slate-500 mb-1"
                      >
                        Días por ciclo (manual)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const next = Math.max(1, permanentCycleDays - 1);
                            setPermanentCycleDays(next);
                            setDeadlineDate(addDays(startDate, next - 1));
                          }}
                          aria-label="Disminuir días del ciclo"
                          className="w-9 h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-700 shrink-0"
                        >
                          <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <input
                          id="goal-cycle-days"
                          type="number"
                          min={1}
                          max={365}
                          value={permanentCycleDays}
                          onChange={(e) => {
                            const next = Math.max(
                              1,
                              Math.min(365, Math.round(Number(e.target.value) || 1))
                            );
                            setPermanentCycleDays(next);
                            setDeadlineDate(addDays(startDate, next - 1));
                          }}
                          className="w-full h-10 px-2 text-center rounded-xl border border-slate-200 font-mono text-xs font-bold text-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = Math.min(365, permanentCycleDays + 1);
                            setPermanentCycleDays(next);
                            setDeadlineDate(addDays(startDate, next - 1));
                          }}
                          aria-label="Aumentar días del ciclo"
                          className="w-9 h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-700 shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="goal-cycle-start"
                        className="block text-[11px] text-slate-500 mb-1"
                      >
                        Inicio del ciclo
                      </label>
                      <input
                        id="goal-cycle-start"
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          const nextStart = e.target.value || today;
                          setStartDate(nextStart);
                          setDeadlineDate(
                            addDays(nextStart, Math.max(1, permanentCycleDays) - 1)
                          );
                        }}
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 font-mono text-xs text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 border border-slate-200/70 px-3 py-2.5 text-[11px] text-slate-600 tabular-nums">
                    <strong className="text-slate-800">
                      {formatPermanentCycleLabel(permanentCycleDays)}
                    </strong>
                    {' · '}Ciclo del {formatShortSpanishDate(startDate)} al{' '}
                    {formatShortSpanishDate(
                      addDays(startDate, Math.max(1, permanentCycleDays) - 1)
                    )}
                    . Se renueva automáticamente conservando todo tu historial.
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      Atajos de duración
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[7, 14, 21, 30].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => applyDurationPreset(d)}
                          className="px-2 py-1 text-xs font-mono rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="goal-start" className="block text-[11px] text-slate-500 mb-1">
                        Inicio
                      </label>
                      <input
                        id="goal-start"
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          const nextStart = e.target.value || today;
                          setStartDate(nextStart);
                          if (deadlineDate < nextStart) {
                            setDeadlineDate(addDays(nextStart, 9));
                          }
                        }}
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 font-mono text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="goal-deadline" className="block text-[11px] text-slate-500 mb-1">
                        Límite
                      </label>
                      <input
                        id="goal-deadline"
                        type="date"
                        value={deadlineDate}
                        min={startDate}
                        onChange={(e) => setDeadlineDate(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 font-mono text-xs text-slate-900"
                      />
                    </div>
                  </div>
                </>
              )}
              {startDate < today && (
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Inicio anterior a hoy: los días previos quedarán activos en tu checklist, cuadrícula y mapa de calor para que registres tu avance real.
                </p>
              )}
            </div>

            {/* Opt-in Pace Status Toggle */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900">
                  Mostrar etiqueta de estado de ritmo
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Actívalo para ver 🟢 Adelantada / 🔵 Al corriente / 🔴 Atrasada.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={trackPace}
                onClick={() => setTrackPace((v) => !v)}
                className="w-12 h-7 rounded-full p-1 transition-colors shrink-0"
                style={{ backgroundColor: trackPace ? colorHex : '#CBD5E1' }}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                    trackPace ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="pt-1 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 h-11 rounded-full bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 sm:flex-none px-6 h-11 rounded-full text-white text-sm font-semibold"
                style={{ backgroundColor: colorHex }}
              >
                Guardar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
