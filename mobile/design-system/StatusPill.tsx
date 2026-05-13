/**
 * StatusPill — small label communicating match state (FT / LIVE / SOON /
 * PLANNED), with the LIVE variant showing a pulsing dot.
 */

import { View, Text } from 'react-native';
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { theme } from './theme';

type Status = 'ft' | 'live' | 'upcoming' | 'planned';

interface StatusPillProps {
  status: Status;
  /** Minute (for live), e.g. "67". */
  minute?: number | string | null;
  /** Time (for upcoming), e.g. "20:00". */
  time?: string | null;
}

export function StatusPill({ status, minute, time }: StatusPillProps) {
  const { brand } = useTheme();
  const map = {
    ft:       { label: 'הסתיים',           fg: theme.status.ftFg,      bg: theme.status.ftBg },
    live:     { label: `חי ${minute ?? ''}'`, fg: brand.accent,           bg: brand.accentGlow },
    upcoming: { label: time || 'בקרוב',     fg: theme.status.soonFg,    bg: theme.status.soonBg },
    planned:  { label: 'טרם שוחק',          fg: theme.status.plannedFg, bg: theme.status.plannedBg },
  } as const;
  const s = map[status] || map.planned;

  return (
    <View
      style={{
        backgroundColor: s.bg,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
      }}
    >
      {status === 'live' ? <PulseDot color={s.fg} /> : null}
      <Text style={{ color: s.fg, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.1 }}>
        {s.label}
      </Text>
    </View>
  );
}

function PulseDot({ color }: { color: string }) {
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(op, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [op]);
  return (
    <Animated.View
      style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: op }}
    />
  );
}
