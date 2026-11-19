import React from 'react';
import { SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { AppSettings, GlobalProgressSummary } from '../types/tracker';
import { getMascotStage, MASCOT_TRACKS } from '../utils/gamification';
import { formatQuantity } from '../utils/paceEngine';

interface MascotViewerModalProps {
  settings: AppSettings;
  globalProgress: GlobalProgressSummary;
  onClose: () => void;
  onOpenSettings: () => void;
}

export const MascotViewerModal: React.FC<MascotViewerModalProps> = ({
  settings,
  globalProgress,
  onClose,
  onOpenSettings,
}) => {
  const stage = getMascotStage(settings.mascotTrackId, globalProgress.actualPct);
  const track = MASCOT_TRACKS[settings.mascotTrackId] || MASCOT_TRACKS.horse;
  const roundedPct = Math.round(globalProgress.actualPct);

  const stageSpan =
    stage.nextMinPct !== null ? Math.max(1, stage.nextMinPct - stage.minPct) : 100;
  const stageFillPct =
    stage.nextMinPct !== null
      ? Math.min(
          100,
          Math.max(0, ((globalProgress.actualPct - stage.minPct) / stageSpan) * 100)
        )
      : 100;

  const missingPct =
    stage.nextMinPct !== null
      ? Math.max(0, Math.round((stage.nextMinPct - globalProgress.actualPct) * 10) / 10)
      : 0;

  let motivationalLine = 'Cada hábito cumplido impulsa el crecimiento de tu mascota.';
  if (globalProgress.activeGoalsCount === 0) {
    motivationalLine = 'Agrega un hábito activo para comenzar a hacer crecer a tu mascota.';
  } else if (stage.nextMinPct === null) {
    motivationalLine = '¡Alcanzaste la etapa máxima! Tu constancia mantiene viva esta evolución.';
  } else if (missingPct <= 5) {
    motivationalLine = '¡Estás a un paso de la siguiente evolución! Mantén tu ritmo hoy.';
  } else if (globalProgress.actualPct >= 50) {
    motivationalLine = 'Vas por muy buen camino; cada bloque diario suma directo a tu meta.';
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mascot-viewer-title"
    >
      <div className="w-full max-w-md bg-[#F7F7FA] sm:bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-slate-100">
          <div className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Tu mascota · {track.name}
            </span>
            <h2
              id="mascot-viewer-title"
              className="font-display text-lg font-bold text-slate-900 truncate"
            >
              {stage.label}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista de mascota"
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Mascot Hero Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col items-center text-center shadow-2xs space-y-3">
            <div className="w-28 h-28 rounded-3xl bg-linear-to-b from-indigo-50 to-blue-50/70 border border-indigo-100 flex items-center justify-center text-6xl shadow-inner">
              <span role="img" aria-label={stage.label}>
                {stage.emoji}
              </span>
            </div>

            <div>
              <div className="font-display text-3xl font-extrabold text-slate-900 tabular-nums">
                {roundedPct}%
              </div>
              <div className="text-xs font-medium text-slate-500 mt-0.5 tabular-nums">
                {formatQuantity(globalProgress.completedUnits)} de{' '}
                {formatQuantity(globalProgress.totalUnits)} tareas globales en{' '}
                {globalProgress.activeGoalsCount}{' '}
                {globalProgress.activeGoalsCount === 1 ? 'hábito' : 'hábitos'}
              </div>
            </div>

            {/* Stage Progress toward Next Stage */}
            <div className="w-full pt-2 space-y-2">
              <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#3B4DF5] transition-[width] duration-300"
                  style={{ width: `${stageFillPct}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs font-medium tabular-nums">
                <span className="text-slate-500">
                  {stage.emoji} {stage.label}
                </span>
                {stage.nextEmoji && stage.nextMinPct !== null ? (
                  <span className="text-[#3B4DF5] font-semibold">
                    Falta {formatQuantity(missingPct)}% para {stage.nextEmoji}
                  </span>
                ) : (
                  <span className="text-emerald-600 font-semibold inline-flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    Etapa máxima
                  </span>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-600 text-center px-2 leading-relaxed">
            {motivationalLine}
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-white border-t border-slate-100 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            className="h-11 px-4 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Cambiar mascota</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="retro-press flex-1 h-11 rounded-full bg-[#3B4DF5] hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
