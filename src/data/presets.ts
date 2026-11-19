import { Goal } from '../types/tracker';
import { addDays, toLocalDateStr } from '../utils/paceEngine';

export function createInitialGoals(referenceDate: Date = new Date()): Goal[] {
  const today = toLocalDateStr(referenceDate);
  const presetCreatedDate = new Date(referenceDate);
  presetCreatedDate.setDate(presetCreatedDate.getDate() - 4);
  const presetCreatedIso = presetCreatedDate.toISOString();

  return [
    {
      id: 'goal-rutina-cierre',
      title: 'Estudio de diseño',
      area: 'Estudio',
      habitType: 'build',
      trackingMode: 'counter',
      stepLabel: 'Sesión',
      dailyTarget: 3,
      tapAction: 'add_1',
      startDate: addDays(today, -4),
      deadlineDate: addDays(today, 9),
      colorHex: '#3B4DF5',
      iconType: 'icon',
      iconValue: 'code',
      frequency: { type: 'everyday' },
      trackPace: true,
      completions: {
        [addDays(today, -4)]: 3,
        [addDays(today, -3)]: 3,
        [addDays(today, -2)]: 2,
        [addDays(today, -1)]: 1,
      },
      notes: {
        [addDays(today, -1)]: 'Avancé con los componentes táctiles y dejé listas las notas de clase.',
      },
      skipped: {},
      quizLogs: {},
      createdAt: presetCreatedIso,
    },
    {
      id: 'goal-hidratacion',
      title: 'Tomar agua',
      area: 'Salud',
      habitType: 'build',
      trackingMode: 'measure',
      unit: 'L',
      dailyTarget: 2,
      tapAction: 'enter_total',
      startDate: addDays(today, -4),
      deadlineDate: addDays(today, 14),
      colorHex: '#0284C7',
      iconType: 'icon',
      iconValue: 'droplets',
      frequency: { type: 'everyday' },
      trackPace: false,
      completions: {
        [addDays(today, -4)]: 2,
        [addDays(today, -3)]: 1.5,
        [addDays(today, -1)]: 2,
      },
      notes: {},
      skipped: {},
      quizLogs: {},
      createdAt: presetCreatedIso,
    },
    {
      id: 'goal-limpieza-profunda',
      title: 'Limpieza profunda',
      area: 'Hogar',
      habitType: 'build',
      trackingMode: 'boolean',
      dailyTarget: 1,
      tapAction: 'add_1',
      startDate: addDays(today, -4),
      deadlineDate: addDays(today, 10),
      colorHex: '#E14949',
      iconType: 'icon',
      iconValue: 'home',
      frequency: { type: 'specific_days', weekdays: [1, 3, 5, 0] },
      trackPace: false,
      completions: {
        [addDays(today, -4)]: 1,
        [addDays(today, -3)]: 1,
        [addDays(today, -1)]: 1,
      },
      notes: {},
      skipped: {},
      quizLogs: {},
      createdAt: presetCreatedIso,
    },
  ];
}
