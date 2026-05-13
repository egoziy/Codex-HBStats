import { View, ViewProps } from 'react-native';
import { ReactNode } from 'react';

interface CardProps extends ViewProps {
  children: ReactNode;
  className?: string;
  /** "flat" drops the border + shadow for nesting inside another card. */
  variant?: 'default' | 'flat';
}

export function Card({ children, className = '', variant = 'default', ...rest }: CardProps) {
  const base = variant === 'flat'
    ? 'bg-ink-50 rounded-card p-4'
    : 'bg-white rounded-card p-5 border border-ink-200 shadow-sm';
  return (
    <View className={`${base} ${className}`} {...rest}>
      {children}
    </View>
  );
}
