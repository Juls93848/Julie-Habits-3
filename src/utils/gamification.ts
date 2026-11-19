import { MascotStage, MascotTrackId } from '../types/tracker';

interface MascotTrackDefinition {
  id: MascotTrackId;
  name: string;
  stages: Array<{ emoji: string; label: string; minPct: number }>;
}

export const MASCOT_TRACKS: Record<MascotTrackId, MascotTrackDefinition> = {
  horse: {
    id: 'horse',
    name: 'Corcel a Unicornio',
    stages: [
      { emoji: '🐴', label: 'Potro Inicial', minPct: 0 },
      { emoji: '🐎', label: 'Corcel Veloz', minPct: 25 },
      { emoji: '🪽', label: 'Pegaso Alado', minPct: 60 },
      { emoji: '🦄✨', label: 'Unicornio Mítico', minPct: 90 },
    ],
  },
  dragon: {
    id: 'dragon',
    name: 'Huevo a Dragón',
    stages: [
      { emoji: '🥚', label: 'Huevo Místico', minPct: 0 },
      { emoji: '🐣', label: 'Cría Despierta', minPct: 25 },
      { emoji: '🦖', label: 'Dragón Joven', minPct: 60 },
      { emoji: '🐉✨', label: 'Dragón Legendario', minPct: 90 },
    ],
  },
  plant: {
    id: 'plant',
    name: 'Semilla a Cerezo',
    stages: [
      { emoji: '🌱', label: 'Brote Nuevo', minPct: 0 },
      { emoji: '🌿', label: 'Tallo Fuerte', minPct: 25 },
      { emoji: '🌳', label: 'Roble Firme', minPct: 60 },
      { emoji: '🌸✨', label: 'Cerezo en Flor', minPct: 90 },
    ],
  },
  rocket: {
    id: 'rocket',
    name: 'Misión Espacial',
    stages: [
      { emoji: '🛸', label: 'Prototipo Base', minPct: 0 },
      { emoji: '🚀', label: 'Despegue', minPct: 25 },
      { emoji: '🛰️', label: 'En Órbita', minPct: 60 },
      { emoji: '🌌✨', label: 'Supernova', minPct: 90 },
    ],
  },
};

export function getMascotStage(trackId: MascotTrackId, pct: number): MascotStage {
  const track = MASCOT_TRACKS[trackId] || MASCOT_TRACKS.horse;
  let activeIdx = 0;
  for (let i = 0; i < track.stages.length; i++) {
    if (pct >= track.stages[i].minPct) {
      activeIdx = i;
    }
  }
  const current = track.stages[activeIdx];
  const next = track.stages[activeIdx + 1] || null;
  return {
    index: activeIdx,
    emoji: current.emoji,
    label: current.label,
    minPct: current.minPct,
    nextEmoji: next ? next.emoji : null,
    nextMinPct: next ? next.minPct : null,
  };
}

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Web Audio API Victory Chime:
 * Ascending sine wave sequence when checking tasks or evolving mascot.
 */
export function playVictoryChime(type: 'check' | 'day' | 'evolve' = 'check'): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const sequences: Record<'check' | 'day' | 'evolve', number[]> = {
    check: [523.25, 659.25, 783.99], // C5 -> E5 -> G5
    day: [523.25, 659.25, 783.99, 1046.5], // C5 -> E5 -> G5 -> C6
    evolve: [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.5], // Full ascending fanfare
  };

  const notes = sequences[type];
  const now = ctx.currentTime;
  const step = type === 'evolve' ? 0.085 : 0.07;

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + idx * step);

    const startTime = now + idx * step;
    const duration = idx === notes.length - 1 ? 0.28 : 0.14;

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.11, startTime + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  });
}

export type WeeklySlideSoundKey =
  | 'balance'
  | 'anchor'
  | 'pulse'
  | 'victory'
  | 'adjustment';

/**
 * Distinct Web Audio API soundscape specifically crafted for the 5 slides of the Weekly Stories Report:
 * - 'balance' (Slide 1): Warm balanced harmonic swell
 * - 'anchor' (Slide 2): Tactile crisp mechanical "click" / block snapping into place
 * - 'pulse' (Slide 3): Soft neutral ambient breath / calm pad swell
 * - 'victory' (Slide 4): Crisp bright high-pitched game-reward "ding"
 * - 'adjustment' (Slide 5): Gentle "shhh" breeze + delicate flowing water shimmer
 */
export function playWeeklySlideSound(slideKey: WeeklySlideSoundKey): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  if (slideKey === 'balance') {
    [440, 554.37].forEach((freq, idx) => {
      const t = now + idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.085, t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
    return;
  }

  if (slideKey === 'anchor') {
    // Tactile block-lock click: short wooden/mechanical click + crisp pop
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(620, now);
    clickOsc.frequency.exponentialRampToValueAtTime(160, now + 0.045);

    clickGain.gain.setValueAtTime(0.001, now);
    clickGain.gain.exponentialRampToValueAtTime(0.22, now + 0.004);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.065);

    // Subtle second lock tick 55ms later (block settling)
    const lockOsc = ctx.createOscillator();
    const lockGain = ctx.createGain();
    lockOsc.type = 'sine';
    lockOsc.frequency.setValueAtTime(980, now + 0.055);
    lockOsc.frequency.exponentialRampToValueAtTime(490, now + 0.11);

    lockGain.gain.setValueAtTime(0.001, now + 0.055);
    lockGain.gain.exponentialRampToValueAtTime(0.11, now + 0.06);
    lockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

    lockOsc.connect(lockGain);
    lockGain.connect(ctx.destination);
    lockOsc.start(now + 0.055);
    lockOsc.stop(now + 0.14);
    return;
  }

  if (slideKey === 'pulse') {
    // Soft neutral ambient breath: gentle filtered noise swell + warm neutral sine fifth
    const sampleRate = ctx.sampleRate;
    const duration = 0.72;
    const bufferSize = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.linearRampToValueAtTime(620, now + 0.3);
    filter.frequency.linearRampToValueAtTime(340, now + duration);
    filter.Q.value = 1.6;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.045, now + 0.25);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration + 0.02);

    // Calm neutral chord (D4 + A4)
    [293.66, 440.0].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.055, now + 0.22);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.74);
    });
    return;
  }

  if (slideKey === 'victory') {
    // Crisp high-pitched bright game-reward "ding"
    const partials = [
      { freq: 1318.51, amp: 0.14, decay: 0.34 }, // E6
      { freq: 1975.53, amp: 0.08, decay: 0.26 }, // B6 overtone
      { freq: 2637.02, amp: 0.05, decay: 0.18 }, // E7 sparkle
    ];
    partials.forEach((p, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(p.freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(p.amp, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + p.decay + 0.02);
    });
    return;
  }

  // slideIdx === 3: Soft "shhh" breeze + gentle flowing water shimmer
  const sampleRate = ctx.sampleRate;
  const duration = 0.95;
  const bufferSize = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    // Slight smoothing for softer "shhh" air texture
    lastOut = (lastOut + 0.08 * white) / 1.08;
    data[i] = lastOut * 2.4;
  }

  const breeze = ctx.createBufferSource();
  breeze.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(850, now);
  filter.frequency.exponentialRampToValueAtTime(1600, now + 0.35);
  filter.frequency.exponentialRampToValueAtTime(650, now + duration);
  filter.Q.value = 1.1;

  const breezeGain = ctx.createGain();
  breezeGain.gain.setValueAtTime(0.0001, now);
  breezeGain.gain.exponentialRampToValueAtTime(0.09, now + 0.22);
  breezeGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  breeze.connect(filter);
  filter.connect(breezeGain);
  breezeGain.connect(ctx.destination);
  breeze.start(now);
  breeze.stop(now + duration + 0.02);

  // Subtle flowing water droplets
  [587.33, 783.99, 987.77].forEach((freq, idx) => {
    const t = now + 0.14 + idx * 0.12;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.12, t + 0.14);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.038, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.24);
  });
}

const MOTIVATIONAL_PHRASES = [
  '¡Imparable! Un paso más cerca de tu meta 🔥',
  '¡Buen ritmo! La constancia vence al talento ⚡',
  '¡Check completado! Tu yo del futuro te lo agradece 🚀',
  '¡Sigue así! Cada bloque suma al gran resultado 🎯',
  '¡Excelente avance! Mantén viva la racha ✨',
  '¡Objetivo en marcha! Hoy estás cumpliendo 💪',
  '¡Ritmo maestro! Pequeñas victorias, grandes logros 🏆',
];

const EVOLUTION_PHRASES = [
  '¡Tu mascota ha evolucionado! Sigue subiendo de nivel ✨',
  '¡Nueva fase desbloqueada! Nada te detiene hoy 🌟',
];

export function pickMotivationalPhrase(evolved = false): string {
  const pool = evolved ? EVOLUTION_PHRASES : MOTIVATIONAL_PHRASES;
  return pool[Math.floor(Math.random() * pool.length)];
}

export interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  rotation: number;
  vRot: number;
}

const CONFETTI_COLORS = ['#2563EB', '#16A34A', '#F59E0B', '#EC4899', '#0EA5E9', '#10B981'];

export function launchCanvasConfetti(
  canvas: HTMLCanvasElement | null,
  originXRatio = 0.5,
  originYRatio = 0.45,
  count = 28
): void {
  if (!canvas) return;
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const originX = rect.width * originXRatio;
  const originY = rect.height * originYRatio;

  const particles: ConfettiParticle[] = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const speed = 2.4 + Math.random() * 4.5;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      size: 4 + Math.random() * 4,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      alpha: 1,
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.25,
    };
  });

  let frame = 0;
  const maxFrames = 55;

  const tick = () => {
    frame++;
    ctx.clearRect(0, 0, rect.width, rect.height);
    let anyAlive = false;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.16; // gravity
      p.vx *= 0.985;
      p.rotation += p.vRot;
      p.alpha = Math.max(0, 1 - frame / maxFrames);

      if (p.alpha > 0.02) {
        anyAlive = true;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
        ctx.restore();
      }
    }

    if (anyAlive && frame < maxFrames) {
      requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, rect.width, rect.height);
    }
  };

  requestAnimationFrame(tick);
}
