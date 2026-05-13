import { View, Text } from 'react-native';

interface MetricCellProps {
  value: string | number;
  label: string;
  tone?: 'default' | 'accent';
}

/**
 * A single number-plus-label cell — used for grid stats (goals, assists,
 * appearances, etc). Mirrors the web's PremierMetricCard.
 */
export function MetricCell({ value, label, tone = 'default' }: MetricCellProps) {
  return (
    <View className="flex-1 min-w-[80px] items-center rounded-card bg-ink-50 px-3 py-3">
      <Text className={`text-2xl font-black ${tone === 'accent' ? 'text-accent' : 'text-ink-900'}`}>
        {value}
      </Text>
      <Text className="mt-0.5 text-[11px] font-semibold text-ink-500 uppercase tracking-wider">
        {label}
      </Text>
    </View>
  );
}
