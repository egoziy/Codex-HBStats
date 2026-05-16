import { ScrollView, View, Text, ActivityIndicator, Image, Pressable } from 'react-native';
import { rtlRow } from '@/lib/rtl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Path } from 'react-native-svg';
import { useTeam } from '@/hooks/useTeam';
import { useTheme } from '@/contexts/ThemeContext';
import { absoluteImage } from '@/lib/config';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { MetricCell } from '@/design-system/MetricCell';
import { FormRow } from '@/design-system/FormPill';
import { theme } from '@/design-system/theme';

// Map the API's English form letters → Hebrew letters so FormPill colors right.
const FORM_HE: Record<string, string> = { W: 'נ', D: 'ת', L: 'ה' };

export default function TeamScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { data, isLoading } = useTeam(id);
  const { brand } = useTheme();

  if (isLoading || !data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.canvas.start }}>
        <ActivityIndicator color={brand.accent} />
      </View>
    );
  }

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/' as any));
  const formHe = data.recentForm.map((r) => FORM_HE[r] || 'ת').join('');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.canvas.start }}
      contentContainerStyle={{ paddingBottom: 32, gap: 12 }}
    >
      {/* Hero header */}
      <LinearGradient
        colors={[brand.accent, brand.accentDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 }}
      >
        {/* Top row: back arrow on the right */}
        <View style={{ flexDirection: rtlRow(), justifyContent: 'space-between', marginBottom: 16 }}>
          <Pressable onPress={goBack} hitSlop={10} style={{ padding: 4 }}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M9 6l6 6-6 6" />
            </Svg>
          </Pressable>
          <View />
        </View>

        <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 16 }}>
          {absoluteImage(data.team.logoUrl) ? (
            <Image source={{ uri: absoluteImage(data.team.logoUrl) }} style={{ width: 72, height: 72, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' }} />
          ) : (
            <View style={{ width: 72, height: 72, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: 'white', fontSize: 28, fontWeight: '900' }}>{data.team.nameHe.slice(0, 1)}</Text>
            </View>
          )}
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', textAlign: 'right' }}>{data.team.nameHe}</Text>
            {data.team.city ? (
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4, textAlign: 'right' }}>{data.team.city}</Text>
            ) : null}
            {data.coach ? (
              <View style={{ marginTop: 8, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
                <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>מאמן: {data.coach.name}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </LinearGradient>

      {/* Recent form */}
      {data.recentForm.length > 0 ? (
        <Section title="צורה אחרונה" dense>
          <Card>
            <View style={{ flexDirection: rtlRow(), justifyContent: 'flex-start' }}>
              <FormRow form={formHe} size={26} gap={6} />
            </View>
          </Card>
        </Section>
      ) : null}

      {/* Season stats grid */}
      <Section title="סטטיסטיקות עונה" dense>
        <Card pad={false}>
          <View style={{ flexDirection: rtlRow(), padding: 14, gap: 8 }}>
            <MetricCell value={data.seasonStats.goalsScored} label="שערים בעד" tone="accent" />
            <MetricCell value={data.seasonStats.goalsAgainst} label="שערים נגד" />
            <MetricCell value={data.seasonStats.cleanSheets} label="רשת נקייה" />
          </View>
        </Card>
      </Section>

      {/* Standings context */}
      {data.standingsContext ? (
        <Section title={`מקום ${data.standingsContext.rank} · ${data.standingsContext.points} נק'`} dense>
          <Card pad={false}>
            {data.standingsContext.around.map((row, i, arr) => {
              const isSelf = row.team.id === data.team.id;
              return (
                <View
                  key={row.rank}
                  style={{
                    flexDirection: rtlRow(),
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                    borderBottomColor: theme.ink[100],
                    backgroundColor: isSelf ? brand.accentGlow : 'transparent',
                  }}
                >
                  <Text style={{ width: 22, fontSize: 12, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>
                    {row.rank}
                  </Text>
                  <Text style={{ flex: 1, marginHorizontal: 10, fontSize: 13.5, fontWeight: isSelf ? '800' : '600', color: theme.ink[900], textAlign: 'right' }} numberOfLines={1}>
                    {row.team.nameHe}
                  </Text>
                  <View style={{ backgroundColor: brand.accentGlow, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, minWidth: 30 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: theme.ink[900], textAlign: 'center' }}>
                      {row.points}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </Section>
      ) : null}

      {data.nextMatch ? (
        <Section title="המשחק הבא" dense>
          <Card>
            <Pressable onPress={() => router.push(`/games/${data.nextMatch!.id}` as any)}>
              <MatchPreviewRow match={data.nextMatch} />
            </Pressable>
          </Card>
        </Section>
      ) : null}
      {data.lastMatch ? (
        <Section title="המשחק האחרון" dense>
          <Card>
            <Pressable onPress={() => router.push(`/games/${data.lastMatch!.id}` as any)}>
              <MatchPreviewRow match={data.lastMatch} />
            </Pressable>
          </Card>
        </Section>
      ) : null}

      {/* Squad */}
      {data.squad.length > 0 ? (
        <Section title="סגל" dense>
          <Card pad={false}>
            {data.squad.map((group, gi) => (
              <View key={group.position} style={{ borderTopWidth: gi === 0 ? 0 : 1, borderTopColor: theme.ink[100] }}>
                <View style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.ink[50] }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: theme.ink[700], textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {group.position}
                  </Text>
                </View>
                {group.players.map((p, pi) => (
                  <Pressable key={p.id} onPress={() => router.push(`/players/${p.id}` as any)}>
                    <View
                      style={{
                        flexDirection: rtlRow(),
                        alignItems: 'center',
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        borderBottomWidth: pi === group.players.length - 1 ? 0 : 1,
                        borderBottomColor: theme.ink[100],
                      }}
                    >
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: theme.ink[100], alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: theme.ink[700] }}>{p.jerseyNumber ?? '—'}</Text>
                      </View>
                      <Text style={{ flex: 1, marginHorizontal: 10, fontSize: 14, color: theme.ink[900], textAlign: 'right' }} numberOfLines={1}>
                        {p.nameHe}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ))}
          </Card>
        </Section>
      ) : null}
    </ScrollView>
  );
}

function MatchPreviewRow({ match }: { match: {
  home: { team: { nameHe: string }; score: number | null };
  away: { team: { nameHe: string }; score: number | null };
  date: string;
  status: string;
} }) {
  const d = new Date(match.date);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return (
    <View style={{ flexDirection: rtlRow(), alignItems: 'center' }}>
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: theme.ink[900], textAlign: 'right' }} numberOfLines={1}>
        {match.home.team.nameHe}
      </Text>
      <View style={{ marginHorizontal: 12, alignItems: 'center' }}>
        {match.status === 'finished' ? (
          <Text style={{ fontSize: 16, fontWeight: '800', color: theme.ink[900] }}>
            {match.home.score}–{match.away.score}
          </Text>
        ) : (
          <Text style={{ fontSize: 13, color: theme.ink[500] }}>{time}</Text>
        )}
      </View>
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: theme.ink[900], textAlign: 'left' }} numberOfLines={1}>
        {match.away.team.nameHe}
      </Text>
    </View>
  );
}
