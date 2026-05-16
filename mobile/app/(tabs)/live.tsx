import { ScrollView, View, Text, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { rtlRow } from '@/lib/rtl';
import { useRouter } from 'expo-router';
import { useLive } from '@/hooks/useLive';
import { useTheme } from '@/contexts/ThemeContext';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { StatusPill } from '@/design-system/StatusPill';
import { theme } from '@/design-system/theme';

function formatLastUpdated(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function LiveScreen() {
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useLive();
  const { brand } = useTheme();

  if (isLoading && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
        <Header />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
      </View>
    );
  }

  if (!data || data.groups.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
        <Header />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: brand.accentGlow, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 28 }}>⚽</Text>
          </View>
          <Text style={{ color: theme.ink[900], fontSize: 16, fontWeight: '800', textAlign: 'center' }}>
            אין משחקים חיים כרגע
          </Text>
          <Text style={{ color: theme.ink[500], fontSize: 13, textAlign: 'center', marginTop: 4 }}>
            משחקים שיתחילו בקרוב יופיעו כאן.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header />
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
        contentContainerStyle={{ paddingVertical: 16, gap: 16, paddingBottom: 32 }}
      >
        <View style={{ flexDirection: rtlRow(), justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: -4 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.ink[500], textTransform: 'uppercase', letterSpacing: 1 }}>
            עודכן {formatLastUpdated(data.lastUpdated)}
          </Text>
        </View>
        {data.groups.map((group) => (
          <Section key={group.league.id} title={group.league.nameHe} dense>
            <Card pad={false}>
              {group.matches.map((m, i, arr) => (
                <Pressable key={m.id} onPress={() => router.push(`/games/${m.id}` as any)}>
                  <View
                    style={{
                      flexDirection: rtlRow(),
                      alignItems: 'center',
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                      borderBottomColor: theme.ink[100],
                      gap: 8,
                    }}
                  >
                    {/* Teams stacked, home above away */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.ink[900], fontSize: 13.5, fontWeight: '700', textAlign: 'right' }} numberOfLines={1}>
                        {m.home.team.nameHe}
                      </Text>
                      <Text style={{ color: theme.ink[900], fontSize: 13.5, fontWeight: '700', textAlign: 'right', marginTop: 2 }} numberOfLines={1}>
                        {m.away.team.nameHe}
                      </Text>
                    </View>
                    {/* Score */}
                    <View style={{ alignItems: 'center', marginHorizontal: 4 }}>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: brand.accent }}>
                        {m.home.score ?? '-'}
                      </Text>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: brand.accent, marginTop: 2 }}>
                        {m.away.score ?? '-'}
                      </Text>
                    </View>
                    {/* Status pill */}
                    <StatusPill status="live" minute={m.minute} />
                  </View>
                </Pressable>
              ))}
            </Card>
          </Section>
        ))}
      </ScrollView>
    </View>
  );
}
