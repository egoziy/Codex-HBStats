/**
 * FormPill / FormRow — Hebrew letter pills indicating recent results.
 * Matches the prototype: נ (win, green) / ת (draw, gray) / ה (loss, red).
 */

import { View, Text } from 'react-native';
import { theme } from './theme';

type Result = 'נ' | 'ת' | 'ה';

interface FormPillProps {
  result: Result | string;
  size?: number;
}

const COLORS: Record<Result, string> = {
  נ: theme.result.win,
  ת: theme.result.draw,
  ה: theme.result.loss,
};

export function FormPill({ result, size = 20 }: FormPillProps) {
  const color = COLORS[result as Result] ?? theme.result.draw;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: 'white', fontSize: size * 0.55, fontWeight: '700', lineHeight: size * 0.7 }}>
        {result}
      </Text>
    </View>
  );
}

interface FormRowProps {
  /** Results string, newest first: e.g. "נננתנ". */
  form: string;
  size?: number;
  gap?: number;
}

export function FormRow({ form, size = 20, gap = 4 }: FormRowProps) {
  return (
    <View style={{ flexDirection: 'row', gap }}>
      {form.split('').map((r, i) => (
        <FormPill key={i} result={r} size={size} />
      ))}
    </View>
  );
}
