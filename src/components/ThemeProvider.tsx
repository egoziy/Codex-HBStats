'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'classic' | 'modern';
export type ColorScheme = 'red' | 'yellow' | 'green' | 'blue';
export type ColorSchemePref = 'auto' | ColorScheme;

type ThemeContextValue = {
  theme: Theme;
  colorScheme: ColorSchemePref;
  effectiveColor: ColorScheme;
  setTheme: (t: Theme) => void;
  setColorScheme: (c: ColorSchemePref) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'modern',
  colorScheme: 'auto',
  effectiveColor: 'red',
  setTheme: () => {},
  setColorScheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

// ── Team name → color scheme ─────────────────────────────────────────────────
export function teamNameToColor(name: string): ColorScheme {
  const n = name.toLowerCase();
  if (
    n.includes('מכבי תל אביב') || n.includes('maccabi tel aviv') ||
    n.includes('בית"ר') || n.includes('ביתר') || n.includes('beitar')
  ) return 'yellow';
  if (n.includes('מכבי') || n.includes('maccabi')) return 'green';
  if (n.includes('הפועל') || n.includes('hapoel')) return 'red';
  return 'blue';
}

function resolveColor(pref: ColorSchemePref, teamNames: string[]): ColorScheme {
  if (pref !== 'auto') return pref;
  return teamNames.length > 0 ? teamNameToColor(teamNames[0]) : 'red';
}

function applyToDOM(theme: Theme, color: ColorScheme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-color', color);
}

// ── Provider ─────────────────────────────────────────────────────────────────
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('modern');
  const [colorScheme, setColorSchemeState] = useState<ColorSchemePref>('auto');
  const [teamNames, setTeamNames] = useState<string[]>([]);

  // Read from localStorage on mount — DOM already has correct attrs from inline script
  useEffect(() => {
    const t = (localStorage.getItem('hbs-theme') as Theme | null) || 'modern';
    const c = (localStorage.getItem('hbs-color-pref') as ColorSchemePref | null) || 'auto';
    const teams = JSON.parse(localStorage.getItem('hbs-team-names') || '[]') as string[];
    setThemeState(t);
    setColorSchemeState(c);
    setTeamNames(teams);
  }, []);

  const effectiveColor = resolveColor(colorScheme, teamNames);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem('hbs-theme', t);
    applyToDOM(t, resolveColor(colorScheme, teamNames));
    fetch('/api/account/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: t }),
    }).catch(() => {});
  }

  function setColorScheme(c: ColorSchemePref) {
    setColorSchemeState(c);
    localStorage.setItem('hbs-color-pref', c);
    const resolved = resolveColor(c, teamNames);
    localStorage.setItem('hbs-color', resolved);
    applyToDOM(theme, resolved);
    fetch('/api/account/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ colorScheme: c }),
    }).catch(() => {});
  }

  // Called by AccountPreferencesForm after saving so auto-detection picks up new teams
  if (typeof window !== 'undefined') {
    (window as any).__hbs_setTeamNames = (names: string[]) => {
      setTeamNames(names);
      localStorage.setItem('hbs-team-names', JSON.stringify(names));
      const resolved = resolveColor(colorScheme, names);
      localStorage.setItem('hbs-color', resolved);
      applyToDOM(theme, resolved);
    };
  }

  return (
    <ThemeContext.Provider value={{ theme, colorScheme, effectiveColor, setTheme, setColorScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
