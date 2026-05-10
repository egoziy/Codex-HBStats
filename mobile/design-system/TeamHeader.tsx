import { View, Text, Image } from 'react-native';
import type { TeamHeader as TeamHeaderData } from '@shared/types/common';

interface TeamHeaderProps {
  team: TeamHeaderData;
}

export function TeamHeader({ team }: TeamHeaderProps) {
  return (
    <View className="flex-row items-center gap-3 py-4">
      {team.logoUrl ? (
        <Image source={{ uri: team.logoUrl }} className="w-16 h-16 rounded-md" />
      ) : (
        <View className="w-16 h-16 rounded-md bg-gray-200 items-center justify-center">
          <Text className="text-2xl font-bold text-gray-600">
            {team.nameHe.slice(0, 1)}
          </Text>
        </View>
      )}
      <View className="flex-1">
        <Text className="text-xl font-bold">{team.nameHe}</Text>
        {team.city && <Text className="text-sm text-gray-500">{team.city}</Text>}
      </View>
    </View>
  );
}
