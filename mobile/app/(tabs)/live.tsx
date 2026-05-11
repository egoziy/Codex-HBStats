import { ScrollView, View, Text, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive } from '@/hooks/useLive';
import { Card } from '@/design-system/Card';
import { LiveDot } from '@/design-system/LiveDot';

function formatLastUpdated(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

export default function LiveScreen() {
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useLive();

  if (isLoading && !data) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (!data || data.groups.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
        <Text className="text-base text-gray-600 text-center">
          אין משחקים חיים כרגע.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <View className="flex-row justify-between items-center mb-2">
        <LiveDot />
        <Text className="text-xs text-gray-500">עודכן {formatLastUpdated(data.lastUpdated)}</Text>
      </View>
      {data.groups.map((group) => (
        <Card key={group.league.id}>
          <Text className="text-base font-bold mb-2">{group.league.nameHe}</Text>
          {group.matches.map((m) => (
            <Pressable key={m.id} onPress={() => router.push(`/games/${m.id}` as any)}>
              <View className="flex-row justify-between py-2 border-b border-gray-100">
                <View className="flex-1">
                  <Text className="text-sm">{m.home.team.nameHe}</Text>
                  <Text className="text-sm">{m.away.team.nameHe}</Text>
                </View>
                <View className="items-center px-3">
                  <Text className="text-sm font-semibold">{m.home.score ?? '-'} - {m.away.score ?? '-'}</Text>
                  <Text className="text-xs text-gray-500">{m.minute}'</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </Card>
      ))}
    </ScrollView>
  );
}
