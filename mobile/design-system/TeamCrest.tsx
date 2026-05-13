/**
 * TeamCrest — Hebrew monogram on a colored block, used until real club crest
 * images are dropped in. Matches the prototype's ILCrest.
 *
 * Caller passes the team's brand colors + 1-3 char monogram. When the API
 * provides a `logoUrl`, prefer rendering an <Image> instead.
 */

import { View, Text, Image } from 'react-native';

interface TeamCrestProps {
  /** Background block color (team primary). */
  bg?: string;
  /** Foreground text color for the monogram. */
  fg?: string;
  /** 1-3 char Hebrew monogram (e.g. "באר"). */
  mono?: string;
  /** Diameter/side length in px. */
  size?: number;
  /** Override border radius (defaults to size * 0.22 — soft rounded square). */
  radius?: number;
  /** When set, render an image badge instead of the monogram. */
  logoUrl?: string | null;
}

export function TeamCrest({ bg = '#1c1917', fg = '#ffffff', mono = '?', size = 28, radius, logoUrl }: TeamCrestProps) {
  const r = radius ?? size * 0.22;

  if (logoUrl) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={{ width: size, height: size, borderRadius: r, backgroundColor: bg }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Text style={{ color: fg, fontWeight: '800', fontSize: size * 0.34 }}>
        {mono}
      </Text>
    </View>
  );
}
