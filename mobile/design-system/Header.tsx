/**
 * Header — solid brand-colored bar with HBS badge + "ליגת העל" subtitle.
 * Matches the prototype's ILHeader (docs/hbs-mobile/components/il-shared.jsx).
 */

import { View, Text, Pressable } from 'react-native';
import { Svg, Path, Circle } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import { theme } from './theme';

interface HeaderProps {
  title?: string;
  subtitle?: string | null;
  onBack?: () => void;
  showBack?: boolean;
}

export function Header({ title, subtitle, onBack, showBack }: HeaderProps) {
  const { brand } = useTheme();

  return (
    <View style={{ flexShrink: 0 }}>
      {/* Brand-colored bar */}
      <View
        style={{
          backgroundColor: brand.accent,
          paddingTop: 54,
          paddingBottom: 10,
          paddingHorizontal: 14,
        }}
        className="flex-row items-center justify-between"
      >
        {showBack ? (
          <Pressable onPress={onBack} hitSlop={10}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 12l6 6M5 12l6-6M5 12h14" />
            </Svg>
          </Pressable>
        ) : (
          <Pressable hitSlop={10}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M4 6h16M4 12h16M4 18h10" />
            </Svg>
          </Pressable>
        )}

        <View className="flex-row items-center gap-2">
          <Text style={{ color: 'white', fontSize: 11, fontWeight: '700', letterSpacing: 0.4, opacity: 0.9 }}>
            ליגת העל
          </Text>
          <View
            style={{
              backgroundColor: 'white',
              width: 36,
              height: 22,
              borderRadius: 6,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: brand.accent, fontSize: 12, fontWeight: '900', letterSpacing: -0.3 }}>
              HBS
            </Text>
          </View>
        </View>

        <Pressable hitSlop={10}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx="11" cy="11" r="7" />
            <Path d="M21 21l-4.5-4.5" />
          </Svg>
        </Pressable>
      </View>

      {/* Title block under the bar */}
      {title ? (
        <View
          style={{
            backgroundColor: theme.canvas.start,
            paddingHorizontal: 16,
            paddingTop: 18,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: theme.ink[200],
          }}
        >
          <Text style={{ color: theme.ink[900], fontSize: 24, fontWeight: '800', letterSpacing: -0.5, lineHeight: 26 }}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ marginTop: 4, color: theme.ink[500], fontSize: 12.5, fontWeight: '500' }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
