/**
 * Section — standard section header with the brand vertical accent bar next
 * to the title. Matches the prototype's ILSection. Designed to live OUTSIDE
 * cards (full-width, with its own horizontal padding) so cards inside the
 * section render edge-to-edge against subtle borders.
 */

import { View, Text, Pressable, type ViewProps } from 'react-native';
import { ReactNode } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { theme } from './theme';

interface SectionProps extends ViewProps {
  title: string;
  /** Optional right-side action label (e.g. "טבלה מלאה"). */
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  /** Tighter top/bottom padding when used in dense lists. */
  dense?: boolean;
}

export function Section({ title, actionLabel, onAction, children, dense, ...rest }: SectionProps) {
  const { brand } = useTheme();
  return (
    <View style={{ marginBottom: 18 }} {...rest}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingBottom: dense ? 8 : 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 3, height: 16, backgroundColor: brand.accent, borderRadius: 2 }} />
          <Text style={{ color: theme.ink[900], fontSize: 15, fontWeight: '800', letterSpacing: -0.3 }}>
            {title}
          </Text>
        </View>
        {actionLabel ? (
          <Pressable onPress={onAction} hitSlop={6}>
            <Text style={{ color: brand.accent, fontSize: 12, fontWeight: '600' }}>
              {actionLabel} ←
            </Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
