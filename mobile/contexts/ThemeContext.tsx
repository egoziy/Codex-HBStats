/**
 * ThemeContext — mirrors the web app's hbs-color setting (4 named schemes:
 * red / yellow / green / blue), using the same HSL math so the brand on
 * mobile matches what the user picked on the website.
 *
 * Persisted via AsyncStorage under the key `hbs-color` (same key the web uses
 * in localStorage, so a future sync flow can share the value).
 */

import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ColorName = 'red' | 'yellow' | 'green' | 'blue';

const STORAGE_KEY = 'hbs-color';
const DEFAULT_COLOR: ColorName = 'red';

// Source of truth: same hue/saturation/light triplets as
// src/app/globals.css ([data-color=...]).
const SCHEMES: Record<ColorName, { hue: number; sat: number; light: number }> = {
  red:    { hue: 0,   sat: 85, light: 52 },
  yellow: { hue: 45,  sat: 92, light: 48 },
  green:  { hue: 145, sat: 63, light: 38 },
  blue:   { hue: 218, sat: 83, light: 52 },
};

const COLOR_LABELS: Record<ColorName, string> = {
  red: 'אדום',
  yellow: 'צהוב',
  green: 'ירוק',
  blue: 'כחול',
};

function hsl(h: number, s: number, l: number, a?: number) {
  if (a !== undefined) return `hsla(${h}, ${s}%, ${l}%, ${a})`;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export interface BrandColors {
  /** Primary accent — bright brand hue. */
  accent: string;
  /** Slightly lighter, used for backgrounds and hover states. */
  accentSoft: string;
  /** Darker, used for "deep" highlights (e.g. gradient ends). */
  accentDeep: string;
  /** Translucent — for glows and pill backgrounds. */
  accentGlow: string;
  /** Dark on-accent text — used for contrast labels. */
  accentText: string;
}

export function brandColorsFor(name: ColorName): BrandColors {
  const { hue, sat, light } = SCHEMES[name];
  return {
    accent:      hsl(hue, sat, light),
    accentSoft:  hsl(hue, sat, 62),
    accentDeep:  hsl(hue, Math.max(0, sat - 10), 38),
    accentGlow:  hsl(hue, sat, 55, 0.14),
    accentText:  hsl(hue, sat, 18),
  };
}

interface ThemeContextValue {
  color: ColorName;
  brand: BrandColors;
  setColor: (color: ColorName) => Promise<void>;
  schemes: Array<{ name: ColorName; label: string; preview: string }>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [color, setColorState] = useState<ColorName>(DEFAULT_COLOR);

  // Load persisted color once on mount.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && stored in SCHEMES) setColorState(stored as ColorName);
    });
  }, []);

  const setColor = async (next: ColorName) => {
    setColorState(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const value = useMemo<ThemeContextValue>(() => ({
    color,
    brand: brandColorsFor(color),
    setColor,
    schemes: (Object.keys(SCHEMES) as ColorName[]).map((name) => ({
      name,
      label: COLOR_LABELS[name],
      preview: brandColorsFor(name).accent,
    })),
  }), [color]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Defensive default — returns the red scheme without requiring a Provider
 *  so unit tests that mount a screen in isolation don't have to wrap. */
const FALLBACK_THEME: ThemeContextValue = {
  color: DEFAULT_COLOR,
  brand: brandColorsFor(DEFAULT_COLOR),
  setColor: async () => {},
  schemes: (Object.keys(SCHEMES) as ColorName[]).map((name) => ({
    name,
    label: COLOR_LABELS[name],
    preview: brandColorsFor(name).accent,
  })),
};

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext) ?? FALLBACK_THEME;
}
