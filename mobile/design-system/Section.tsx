import { View, Text, ViewProps } from 'react-native';
import { ReactNode } from 'react';

interface SectionProps extends ViewProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;          // top-right slot (e.g. a "see all" link)
  children: ReactNode;
}

/**
 * Standardised section header used inside cards or directly on the screen.
 * Provides consistent title typography + optional action slot on the right.
 */
export function Section({ title, subtitle, action, children, ...rest }: SectionProps) {
  return (
    <View {...rest}>
      <View className="flex-row items-baseline justify-between mb-3">
        <View>
          <Text className="text-base font-black text-ink-900">{title}</Text>
          {subtitle ? <Text className="text-xs text-ink-500 mt-0.5">{subtitle}</Text> : null}
        </View>
        {action ? <View>{action}</View> : null}
      </View>
      {children}
    </View>
  );
}
