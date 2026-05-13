import { ScrollView, View, Text, RefreshControl, ActivityIndicator, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useHome } from '@/hooks/useHome';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { MatchRow } from '@/design-system/MatchRow';
import { LiveDot } from '@/design-system/LiveDot';
import { theme } from '@/design-system/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useHome();

  if (isLoading && !data) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas-start">
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas-start p-6">
        <Text className="text-base text-ink-700 text-center">
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
      className="flex-1 bg-canvas-start"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={theme.accent} />}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
    >
      {fav ? (
        <Pressable onPress={() => router.push(`/teams/${fav.id}` as any)}>
          <Card>
            <View className="flex-row items-center gap-3">
              {fav.logoUrl ? (
                <Image source={{ uri: fav.logoUrl }} className="w-14 h-14 rounded-md" />
              ) : (
                <View className="w-14 h-14 rounded-md bg-ink-100 items-center justify-center">
                  <Text className="text-2xl font-black text-ink-700">{fav.nameHe.slice(0, 1)}</Text>
                </View>
              )}
              <View className="flex-1">
                <Text className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500">המועדפת שלך</Text>
                <Text className="text-lg font-black text-ink-900 mt-0.5">{fav.nameHe}</Text>
              </View>
            </View>
          </Card>
        </Pressable>
      ) : null}

      {data.liveStrip.length > 0 ? (
        <Card>
          <Section
            title="משחקים חיים"
            action={<LiveDot />}
          >
            {data.liveStrip.map((m) => (
              <Pressable key={m.id} onPress={() => router.push(`/games/${m.id}` as any)}>
                <View className="py-2.5 border-b border-ink-100">
                  <View className="flex-row justify-between items-center">
                    <Text className="text-sm font-bold text-ink-900">{m.home.name} — {m.away.name}</Text>
                    <Text className="text-xs font-black text-accent">
                      {m.home.score ?? '-'}:{m.away.score ?? '-'}
                    </Text>
                  </View>
                  <Text className="text-xs text-ink-500 mt-0.5">דקה {m.minute}'</Text>
                </View>
              </Pressable>
            ))}
          </Section>
        </Card>
      ) : null}

      {nextM ? (
        <Card>
          <Section title="המשחק הבא">
            <Pressable onPress={() => router.push(`/games/${nextM.id}` as any)}>
              <MatchRow match={nextM} />
            </Pressable>
          </Section>
        </Card>
      ) : null}

      {lastM ? (
        <Card>
          <Section title="המשחק האחרון">
            <Pressable onPress={() => router.push(`/games/${lastM.id}` as any)}>
              <MatchRow match={lastM} />
            </Pressable>
          </Section>
        </Card>
      ) : null}

      {data.compactStandings.length > 0 ? (
        <Card>
          <Section title="טבלה">
            {data.compactStandings.map((row) => (
              <View key={row.rank} className="flex-row items-center py-1.5 border-b border-ink-100">
                <Text className="text-sm font-black text-ink-500 w-8">{row.rank}.</Text>
                <Text className="text-sm font-bold text-ink-900 flex-1">{row.teamName}</Text>
                <Text className="text-xs text-ink-500 ms-2">{row.played}</Text>
                <Text className="text-sm font-black text-ink-900 ms-3 w-8 text-end">{row.points}</Text>
              </View>
            ))}
          </Section>
        </Card>
      ) : null}

      {data.newsStrip.length > 0 ? (
        <Card>
          <Section title="חדשות">
            {data.newsStrip.map((n) => (
              <View key={n.id} className="py-2 border-b border-ink-100">
                <Text className="text-sm text-ink-900" numberOfLines={2}>{n.preview}</Text>
                <Text className="text-[11px] font-semibold text-ink-500 mt-1 uppercase tracking-wider">{n.source}</Text>
              </View>
            ))}
          </Section>
        </Card>
      ) : null}
    </ScrollView>
  );
}
