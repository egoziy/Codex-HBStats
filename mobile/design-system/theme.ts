/**
 * Brand tokens — single source of truth for raw color values that components
 * need to pass to non-className APIs (LinearGradient colors, status bar, etc).
 * Class-name styling lives in tailwind.config.js; keep both in sync.
 */
export const theme = {
  accent: '#b91c1c',
  accentSoft: '#fef2f2',
  canvas: {
    start: '#f8f3eb',
    end: '#efe4d0',
  },
  hero: {
    start: '#5b21b6',
    end: '#1d4ed8',
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
} as const;
