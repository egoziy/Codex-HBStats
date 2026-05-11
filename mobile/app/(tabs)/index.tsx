import { ScrollView, View, Text, RefreshControl, ActivityIndicator, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useHome } from '@/hooks/useHome';
import { Card } from '@/design-system/Card';
import { MatchRow } from '@/design-system/MatchRow';
import { LiveDot } from '@/design-system/LiveDot';

export default function HomeScreen() {
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useHome();

  if (isLoading && !data) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
        <Text className="text-base text-gray-600 text-center">
          לא הצלחנו לטעון את הדף. נסה שוב מאוחר יותר.
        </Text>
      </View>
    );
  }

  const fav = data.favoriteTeam;
  const nextM = data.nextMatch;
  const lastM = data.lastMatch;

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      {fav && (
        <Pressable onPress={() => router.push(`/teams/${fav.id}` as any)}>
          <Card>
            <View className="flex-row items-center gap-3">
              {fav.logoUrl && (
                <Image source={{ uri: fav.logoUrl }} className="w-12 h-12 rounded" />
              )}
              <Text className="text-lg font-bold">{fav.nameHe}</Text>
            </View>
          </Card>
        </Pressable>
      )}

      {data.liveStrip.length > 0 && (
        <Card>
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-base font-semibold">משחקים חיים</Text>
            <LiveDot />
          </View>
          {data.liveStrip.map((m) => (
            <Pressable key={m.id} onPress={() => router.push(`/games/${m.id}` as any)}>
              <View className="py-2 border-b border-gray-100">
                <Text className="text-sm">{m.home.name} - {m.away.name}</Text>
                <Text className="text-xs text-gray-500">
                  {m.home.score ?? '-'}:{m.away.score ?? '-'} ({m.minute}')
                </Text>
              </View>
            </Pressable>
          ))}
        </Card>
      )}

      {nextM && (
        <Card>
          <Text className="text-base font-semibold mb-2">המשחק הבא</Text>
          <Pressable onPress={() => router.push(`/games/${nextM.id}` as any)}>
            <MatchRow match={nextM} />
          </Pressable>
        </Card>
      )}

      {lastM && (
        <Card>
          <Text className="text-base font-semibold mb-2">המשחק האחרון</Text>
          <Pressable onPress={() => router.push(`/games/${lastM.id}` as any)}>
            <MatchRow match={lastM} />
          </Pressable>
        </Card>
      )}

      {data.compactStandings.length > 0 && (
        <Card>
          <Text className="text-base font-semibold mb-2">טבלה</Text>
          {data.compactStandings.map((row) => (
            <View key={row.rank} className="flex-row justify-between py-1">
              <Text className="text-sm">{row.rank}. {row.teamName}</Text>
              <Text className="text-sm font-semibold">{row.points} ({row.played})</Text>
            </View>
          ))}
        </Card>
      )}

      {data.newsStrip.length > 0 && (
        <Card>
          <Text className="text-base font-semibold mb-2">חדשות</Text>
          {data.newsStrip.map((n) => (
            <View key={n.id} className="py-2 border-b border-gray-100">
              <Text className="text-sm" numberOfLines={2}>{n.preview}</Text>
              <Text className="text-xs text-gray-500 mt-1">{n.source}</Text>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
