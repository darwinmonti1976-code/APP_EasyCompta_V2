export const LightColors = {
  background: '#F8F9FF',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F4FF',

  primary: '#7C9EFF',
  primaryLight: '#E8EDFF',
  primaryDark: '#5B7FE8',

  success: '#6BCB77',
  successLight: '#E8F5E9',

  expense: '#FFB3B3',
  expenseLight: '#FFF0F0',
  income: '#A8E6B0',
  incomeLight: '#F0FFF4',
  debt: '#FFD6A5',
  debtLight: '#FFF8EE',

  text: '#2D3748',
  textSecondary: '#718096',
  textMuted: '#A0AEC0',

  border: '#E2E8F0',
  divider: '#EDF2F7',

  cardShadow: 'rgba(124, 158, 255, 0.12)',

  mic: {
    idle: '#7C9EFF',
    recording: '#FF9EAE',
    pulse: 'rgba(124, 158, 255, 0.25)',
  },
};

export const DarkColors = {
  background: '#0F1117',
  surface: '#1A1D27',
  surfaceAlt: '#252836',

  primary: '#7C9EFF',
  primaryLight: '#1E2540',
  primaryDark: '#5B7FE8',

  success: '#6BCB77',
  successLight: '#1A2E1C',

  expense: '#FF8FAB',
  expenseLight: '#2E1A1F',
  income: '#7FD68A',
  incomeLight: '#1A2E1E',
  debt: '#FFD6A5',
  debtLight: '#2E2A1A',

  text: '#EDF2FF',
  textSecondary: '#A0ADB8',
  textMuted: '#6B7585',

  border: '#2D3348',
  divider: '#1E2333',

  cardShadow: 'rgba(0, 0, 0, 0.4)',

  mic: {
    idle: '#7C9EFF',
    recording: '#FF9EAE',
    pulse: 'rgba(124, 158, 255, 0.2)',
  },
};

export type ColorTheme = typeof LightColors;

// Backward compat for App.tsx error boundary (class component, can't use hooks)
export const Colors = LightColors;
