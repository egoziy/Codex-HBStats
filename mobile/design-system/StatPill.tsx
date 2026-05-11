import { View, Text } from 'react-native';

interface StatPillProps {
  label: string;
  value: string | number;
  className?: string;
}

export function StatPill({ label, value, className = '' }: StatPillProps) {
  return (
    <View className={`bg-gray-100 rounded-full px-3 py-1 flex-row items-center gap-2 ${className}`}>
      <Text className="text-xs text-gray-600">{label}</Text>
      <Text className="text-sm font-semibold text-gray-900">{value}</Text>
    </View>
  );
}
