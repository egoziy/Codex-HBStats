/**
 * Card — white rounded container with hairline border. Used inside Sections
 * to wrap rows/lists. Matches the prototype's ILCard (radius 14, p=14).
 */

import { View, type ViewProps } from 'react-native';
import { ReactNode } from 'react';
import { theme } from './theme';

interface CardProps extends ViewProps {
  children: ReactNode;
  className?: string;
  /** Drop padding when rendering an edge-to-edge list inside the card. */
  pad?: boolean;
  /** Horizontal margin (default 16). Set 0 for full-bleed cards. */
  marginX?: number;
}

export function Card({ children, className, pad = true, marginX = 16, ...rest }: CardProps) {
  return (
    <View
      style={{
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: theme.ink[200],
        borderRadius: 14,
        padding: pad ? 14 : 0,
        marginHorizontal: marginX,
      }}
      className={className}
      {...rest}
    >
      {children}
    </View>
  );
}
