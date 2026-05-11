import { ScrollView, View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTeam } from '@/hooks/useTeam';
import { Card } from '@/design-system/Card';
import { TeamHeader } from '@/design-system/TeamHeader';
import { MatchRow } from '@/design-system/MatchRow';

const formColors: Record<'W' | 'D' | 'L', string> = {
  W: 'bg-green-500',
  D: 'bg-yellow-500',
  L: 'bg-red-500',
};

export default function TeamScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { data, isLoading } = useTeam(id);

  if (isLoading || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <TeamHeader team={data.team} />
        {data.coach && (
          <Text className="text-sm text-gray-600 mt-2">מאמן: {data.coach.name}</Text>
        )}
      </Card>

      {data.recentForm.length > 0 && (
        <Card>
          <Text className="text-base font-bold mb-2">צורה אחרונה</Text>
          <View className="flex-row gap-2">
            {data.recentForm.map((r, i) => (
              <View key={i} className={`w-8 h-8 rounded items-center justify-center ${formColors[r]}`}>
                <Text className="text-white font-bold">{r}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {data.standingsContext && (
        <Card>
          <Text className="text-base font-bold mb-2">
            מקום {data.standingsContext.rank} · {data.standingsContext.points} נקודות
          </Text>
          {data.standingsContext.around.map((row) => (
            <View key={row.rank} className="flex-row justify-between py-1">
              <Text className="text-sm">{row.rank}. {row.team.nameHe}</Text>
              <Text className="text-sm">{row.points}</Text>
            </View>
          ))}
        </Card>
      )}

      {data.nextMatch && (
        <Card>
          <Text className="text-base font-semibold mb-2">המשחק הבא</Text>
          <Pressable onPress={() => router.push(`/games/${data.nextMatch!.id}` as any)}>
            <MatchRow match={data.nextMatch} />
          </Pressable>
        </Card>
      )}
      {data.lastMatch && (
        <Card>
          <Text className="text-base font-semibold mb-2">המשחק האחרון</Text>
          <Pressable onPress={() => router.push(`/games/${data.lastMatch!.id}` as any)}>
            <MatchRow match={data.lastMatch} />
          </Pressable>
        </Card>
      )}

      {data.squad.length > 0 && (
        <Card>
          <Text className="text-base font-bold mb-2">סגל</Text>
          {data.squad.map((group) => (
            <View key={group.position} className="mb-3">
              <Text className="text-sm font-semibold text-gray-600 mb-1">{group.position}</Text>
              {group.players.map((p) => (
                <Pressable key={p.id} onPress={() => router.push(`/players/${p.id}` as any)}>
                  <View className="py-1 flex-row justify-between">
                    <Text className="text-sm">{p.nameHe}</Text>
                    <Text className="text-xs text-gray-500">{p.jerseyNumber ?? '—'}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </Card>
      )}

      <Card>
        <Text className="text-base font-bold mb-2">סטטיסטיקות עונה</Text>
        <View className="flex-row justify-around">
          <View className="items-center">
            <Text className="text-2xl font-bold">{data.seasonStats.goalsScored}</Text>
            <Text className="text-xs text-gray-500">שערים בעד</Text>
          </View>
          <View className="items-center">
            <Text className="text-2xl font-bold">{data.seasonStats.goalsAgainst}</Text>
            <Text className="text-xs text-gray-500">שערים נגד</Text>
          </View>
          <View className="items-center">
            <Text className="text-2xl font-bold">{data.seasonStats.cleanSheets}</Text>
            <Text className="text-xs text-gray-500">רשת נקייה</Text>
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}
