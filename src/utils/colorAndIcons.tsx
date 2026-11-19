import React, { useState } from 'react';
import {
  Activity,
  Anchor,
  Award,
  Bike,
  BookOpen,
  Brain,
  Briefcase,
  Camera,
  CheckCircle2,
  Clock,
  Code2,
  Coffee,
  Compass,
  Droplets,
  Dumbbell,
  Flame,
  Gamepad2,
  GraduationCap,
  Headphones,
  Heart,
  Home,
  Image as ImageIcon,
  Laptop,
  Layers,
  Moon,
  Music,
  PenTool,
  PhoneOff,
  Pill,
  ShoppingBag,
  Smile,
  Sparkles,
  Sprout,
  Sun,
  Target,
  Terminal,
  Utensils,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const PRESET_COLORS = [
  { hex: '#3B4DF5', label: 'Azul' },
  { hex: '#E14949', label: 'Coral' },
  { hex: '#0284C7', label: 'Cielo' },
  { hex: '#16A34A', label: 'Verde' },
  { hex: '#D97706', label: 'Ámbar' },
  { hex: '#9333EA', label: 'Violeta' },
  { hex: '#DB2777', label: 'Rosa' },
  { hex: '#0D9488', label: 'Turquesa' },
  { hex: '#EA580C', label: 'Naranja' },
  { hex: '#334155', label: 'Grafito' },
];

export function normalizeHex(hex: string): string {
  const cleaned = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    return `#${cleaned
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase()}`;
  }
  return '#3B4DF5';
}

export function isValidHexInput(hex: string): boolean {
  const cleaned = hex.trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{3}$/.test(cleaned) || /^[0-9a-fA-F]{6}$/.test(cleaned);
}

export function hexToRgba(hex: string, alpha: number): string {
  const norm = normalizeHex(hex).slice(1);
  const r = parseInt(norm.slice(0, 2), 16);
  const g = parseInt(norm.slice(2, 4), 16);
  const b = parseInt(norm.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface GoalPalette {
  fillBg: string;
  iconFg: string;
  softBg: string;
  iconBg: string;
  border: string;
}

export function getGoalPalette(colorHex?: string): GoalPalette {
  const hex = normalizeHex(colorHex || '#3B4DF5');
  return {
    fillBg: hex,
    iconFg: hex,
    softBg: hexToRgba(hex, 0.11),
    iconBg: hexToRgba(hex, 0.16),
    border: hexToRgba(hex, 0.35),
  };
}

export interface IconEntry {
  id: string;
  label: string;
  Component: LucideIcon;
}

export const ICON_CATALOG: IconEntry[] = [
  { id: 'activity', label: 'Pulso', Component: Activity },
  { id: 'target', label: 'Meta', Component: Target },
  { id: 'book', label: 'Lectura', Component: BookOpen },
  { id: 'code', label: 'Código', Component: Code2 },
  { id: 'terminal', label: 'Terminal', Component: Terminal },
  { id: 'laptop', label: 'Computadora', Component: Laptop },
  { id: 'briefcase', label: 'Trabajo', Component: Briefcase },
  { id: 'wallet', label: 'Finanzas', Component: Wallet },
  { id: 'dumbbell', label: 'Ejercicio', Component: Dumbbell },
  { id: 'bike', label: 'Ciclismo', Component: Bike },
  { id: 'droplets', label: 'Agua', Component: Droplets },
  { id: 'heart', label: 'Salud', Component: Heart },
  { id: 'brain', label: 'Mente', Component: Brain },
  { id: 'pill', label: 'Suplementos', Component: Pill },
  { id: 'moon', label: 'Sueño', Component: Moon },
  { id: 'sun', label: 'Mañana', Component: Sun },
  { id: 'coffee', label: 'Café', Component: Coffee },
  { id: 'utensils', label: 'Alimentación', Component: Utensils },
  { id: 'sprout', label: 'Crecimiento', Component: Sprout },
  { id: 'flame', label: 'Energía', Component: Flame },
  { id: 'zap', label: 'Enfoque', Component: Zap },
  { id: 'graduation', label: 'Estudio', Component: GraduationCap },
  { id: 'pentool', label: 'Diseño', Component: PenTool },
  { id: 'headphones', label: 'Audio', Component: Headphones },
  { id: 'music', label: 'Música', Component: Music },
  { id: 'gamepad', label: 'Juegos', Component: Gamepad2 },
  { id: 'home', label: 'Hogar', Component: Home },
  { id: 'phoneoff', label: 'Desconexión', Component: PhoneOff },
  { id: 'shopping', label: 'Compras', Component: ShoppingBag },
  { id: 'wrench', label: 'Mantenimiento', Component: Wrench },
  { id: 'camera', label: 'Fotografía', Component: Camera },
  { id: 'clock', label: 'Tiempo', Component: Clock },
  { id: 'compass', label: 'Explorar', Component: Compass },
  { id: 'anchor', label: 'Calma', Component: Anchor },
  { id: 'sparkles', label: 'Hábito', Component: Sparkles },
  { id: 'award', label: 'Logro', Component: Award },
  { id: 'smile', label: 'Bienestar', Component: Smile },
  { id: 'layers', label: 'Proyecto', Component: Layers },
  { id: 'check', label: 'Checklist', Component: CheckCircle2 },
];

export const EMOJI_CATALOG: Array<{ emoji: string; label: string }> = [
  { emoji: '🎯', label: 'Meta' },
  { emoji: '📚', label: 'Libros' },
  { emoji: '💻', label: 'Programar' },
  { emoji: '🏃', label: 'Correr' },
  { emoji: '💪', label: 'Fuerza' },
  { emoji: '💧', label: 'Agua' },
  { emoji: '🧘', label: 'Meditar' },
  { emoji: '💰', label: 'Finanzas' },
  { emoji: '🧹', label: 'Limpieza' },
  { emoji: '🥗', label: 'Comida sana' },
  { emoji: '💤', label: 'Dormir' },
  { emoji: '✍️', label: 'Escribir' },
  { emoji: '🌱', label: 'Crecer' },
  { emoji: '🔥', label: 'Racha' },
  { emoji: '⚡', label: 'Enfoque' },
  { emoji: '🎓', label: 'Curso' },
  { emoji: '💊', label: 'Salud' },
  { emoji: '🚲', label: 'Bici' },
  { emoji: '📵', label: 'Sin pantallas' },
  { emoji: '🧠', label: 'Estudio' },
  { emoji: '🎸', label: 'Música' },
  { emoji: '🎨', label: 'Arte' },
  { emoji: '🎧', label: 'Podcast' },
  { emoji: '☀️', label: 'Mañana' },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  ICON_CATALOG.map((item) => [item.id, item.Component])
);

interface GoalIconBadgeProps {
  iconType: 'icon' | 'emoji' | 'image';
  iconValue: string;
  colorHex: string;
  sizeClass?: string;
  alt?: string;
}

export const GoalIconBadge: React.FC<GoalIconBadgeProps> = ({
  iconType,
  iconValue,
  colorHex,
  sizeClass = 'w-10 h-10',
  alt = 'Ícono del hábito',
}) => {
  const palette = getGoalPalette(colorHex);
  const IconComp = ICON_MAP[iconValue] || Activity;
  const [imgError, setImgError] = useState(false);

  // Reset error when URL changes
  React.useEffect(() => {
    setImgError(false);
  }, [iconValue, iconType]);

  return (
    <span
      className={`${sizeClass} rounded-xl flex items-center justify-center shrink-0 overflow-hidden`}
      style={{
        backgroundColor: palette.iconBg,
        color: palette.iconFg,
      }}
    >
      {iconType === 'image' && iconValue && !imgError ? (
        <img
          src={iconValue}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      ) : iconType === 'image' ? (
        <ImageIcon className="w-4 h-4 stroke-[2]" aria-hidden="true" />
      ) : iconType === 'emoji' ? (
        <span className="text-lg leading-none" role="img" aria-hidden="true">
          {iconValue || '🎯'}
        </span>
      ) : (
        <IconComp className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
      )}
    </span>
  );
};
