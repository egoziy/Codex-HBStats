import { View, Text } from 'react-native';

export function LiveDot() {
  return (
    <View className="flex-row items-center gap-1">
      <View className="w-2 h-2 rounded-full bg-red-500" />
      <Text className="text-xs text-red-600 font-bold">LIVE</Text>
    </View>
  );
}
