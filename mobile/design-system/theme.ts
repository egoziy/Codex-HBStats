/**
 * Static design tokens — neutral palette + status colors. The user-selectable
 * accent (red / yellow / green / blue) lives in ThemeContext; raw HSL values
 * are computed there and passed via `useTheme().brand`.
 */
export const theme = {
  // Static fallback when context is not available (used only by raw style
  // sheets / utility functions). Live components must read brand via
  // useTheme().brand so the user-picked color (red/yellow/green/blue)
  // wins everywhere.
  accent: '#C8102E',

  canvas: {
    start: '#f8f3eb',
    end: '#efe4d0',
  },
  ink: {
    900: '#1c1917',
    700: '#44403c',
    500: '#78716c',
    300: '#d6d3d1',
    200: '#e7e5e4',
    100: '#f5f5f4',
    50: '#fafaf9',
  },
  white: '#ffffff',
  black: '#000000',

  // Status palette — matches the prototype's status pills.
  status: {
    ftFg:        '#16A34A',
    ftBg:        '#DCFCE7',
    liveFg:      '#DC2626',
    liveBg:      '#FEE2E2',
    soonFg:      '#1A1A1F',
    soonBg:      '#FFE4E6',
    plannedFg:   '#1A1A1F',
    plannedBg:   '#F3F4F6',
  },

  // Match-result colors (form pills: נ/ת/ה).
  result: {
    win:  '#16A34A',  winSoft:  '#DCFCE7',
    draw: '#9CA3AF',  drawSoft: '#F3F4F6',
    loss: '#DC2626',  lossSoft: '#FEE2E2',
  },

  // Zone highlight bars on standings.
  zone: {
    champ: '#F59E0B',   // gold for 1st
    cl:    '#DC2626',   // Champions League qualifying
    el:    '#EA580C',   // Europa
    rel:   '#DC2626',   // relegation
  },
} as const;

export type Theme = typeof theme;
