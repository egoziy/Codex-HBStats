/**
 * ScorePill — score in a dark pill or large monospace text. Matches ILScore.
 */

import { View, Text } from 'react-native';
import { theme } from './theme';

interface ScorePillProps {
  home: number | null | undefined;
  away: number | null | undefined;
  /** "capsule" = dark pill (default), "large" = big bare text. */
  mode?: 'capsule' | 'large';
  /** Override colors — used inside gradient headers. */
  fg?: string;
  bg?: string;
}

export function ScorePill({ home, away, mode = 'capsule', fg, bg }: ScorePillProps) {
  const h = home ?? '-';
  const a = away ?? '-';
  if (mode === 'large') {
    return (
      <Text style={{ color: fg ?? theme.ink[900], fontSize: 28, fontWeight: '800', letterSpacing: 0.3 }}>
        {h} – {a}
      </Text>
    );
  }
  return (
    <View
      style={{
        backgroundColor: bg ?? theme.ink[900],
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 8,
        flexDirection: 'row',
        gap: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: fg ?? '#ffffff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 }}>
        {h}
      </Text>
      <Text style={{ color: fg ?? '#ffffff', fontSize: 16, fontWeight: '700' }}>–</Text>
      <Text style={{ color: fg ?? '#ffffff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 }}>
        {a}
      </Text>
    </View>
  );
}
