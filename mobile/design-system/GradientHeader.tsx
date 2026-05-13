import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface GradientHeaderProps {
  title: string;
  subtitle?: string | null;
  badge?: string | null;     // small uppercase tag, e.g. "ליגת העל"
  children?: ReactNode;       // free slot at the bottom (chips, badges, etc)
}

/**
 * Premium purple→blue gradient header used on detail screens (game / team /
 * player). Matches the web app's PremierTeamBadge layout.
 */
export function GradientHeader({ title, subtitle, badge, children }: GradientHeaderProps) {
  const { brand } = useTheme();
  return (
    <LinearGradient
      colors={[brand.accent, brand.accentDeep]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 28, overflow: 'hidden' }}
    >
      <View className="px-6 py-6">
        {badge ? (
          <Text className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
            {badge}
          </Text>
        ) : null}
        <Text className="mt-1 text-2xl font-black text-white">{title}</Text>
        {subtitle ? (
          <Text className="mt-1 text-sm font-semibold text-white/80">{subtitle}</Text>
        ) : null}
        {children ? <View className="mt-4">{children}</View> : null}
      </View>
    </LinearGradient>
  );
}
