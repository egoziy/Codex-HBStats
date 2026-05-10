import { View, ViewProps } from 'react-native';
import { ReactNode } from 'react';

interface CardProps extends ViewProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <View
      className={`bg-white rounded-lg p-4 shadow-sm border border-gray-100 ${className}`}
      {...rest}
    >
      {children}
    </View>
  );
}
