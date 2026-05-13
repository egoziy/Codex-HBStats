import { ScrollView, View, Text, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useHome } from '@/hooks/useHome';
import { useTheme } from '@/contexts/ThemeContext';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { TeamCrest } from '@/design-system/TeamCrest';
import { StatusPill } from '@/design-system/StatusPill';
import { theme } from '@/design-system/theme';
import type { MatchCard } from '@shared/types/common';

export default function HomeScreen() {
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useHome();
  const { brand } = useTheme();

  if (isLoading && !data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.canvas.start }}>
        <ActivityIndicator color={brand.accent} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: theme.canvas.start }}>
        <Text style={{ color: theme.ink[700], fontSize: 14, textAlign: 'center' }}>
          לא הצלחנו לטעון את הדף. נסה שוב מאוחר יותר.
        </Text>
      </View>
    );
  }

  // Featured: prefer the first live game, fall back to nextMatch.
  const liveFeature = data.liveStrip[0] ?? null;
  const fav = data.favoriteTeam;

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header />
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Featured match hero — brand gradient like the prototype */}
        {liveFeature ? (
          <LiveFeatureHero match={liveFeature} accentStart={brand.accent} accentEnd={brand.accentDeep} onPress={() => router.push(`/games/${liveFeature.id}` as any)} />
        ) : data.nextMatch ? (
          <UpcomingFeatureHero match={data.nextMatch} accentStart={brand.accent} accentEnd={brand.accentDeep} onPress={() => router.push(`/games/${data.nextMatch!.id}` as any)} />
        ) : null}

        <View style={{ height: 16 }} />

        {/* Favourite team chip */}
        {fav ? (
          <Section title="המועדפת שלך">
            <Pressable onPress={() => router.push(`/teams/${fav.id}` as any)}>
              <Card>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
                  <TeamCrest mono={fav.nameHe.slice(0, 2)} bg={brand.accent} fg="white" size={36} logoUrl={fav.logoUrl} />
                  <Text style={{ flex: 1, color: theme.ink[900], fontSize: 16, fontWeight: '800', textAlign: 'right' }}>
                    {fav.nameHe}
                  </Text>
                  <Text style={{ color: brand.accent, fontSize: 12, fontWeight: '700' }}>← לדף הקבוצה</Text>
                </View>
              </Card>
            </Pressable>
          </Section>
        ) : null}

        {/* Live strip — show secondary live games */}
        {data.liveStrip.length > 1 ? (
          <Section title="גם משחקים חיים">
            <Card pad={false}>
              {data.liveStrip.slice(1).map((m, i, arr) => (
                <Pressable key={m.id} onPress={() => router.push(`/games/${m.id}` as any)}>
                  <View
                    style={{
                      paddingVertical: 11,
                      paddingHorizontal: 14,
                      borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                      borderBottomColor: theme.ink[100],
                      flexDirection: 'row-reverse',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: theme.ink[900], textAlign: 'right' }} numberOfLines={1}>
                      {m.home.name} — {m.away.name}
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: brand.accent }}>
                      {m.home.score ?? '-'}:{m.away.score ?? '-'}
                    </Text>
                    <StatusPill status="live" minute={m.minute} />
                  </View>
                </Pressable>
              ))}
            </Card>
          </Section>
        ) : null}

        {/* Standings preview */}
        {data.compactStandings.length > 0 ? (
          <Section title="טבלת ליגת העל" actionLabel="טבלה מלאה">
            <Card pad={false}>
              {data.compactStandings.slice(0, 5).map((row, i, arr) => (
                <View
                  key={row.rank}
                  style={{
                    paddingVertical: 11,
                    paddingHorizontal: 14,
                    borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                    borderBottomColor: theme.ink[100],
                    flexDirection: 'row-reverse',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ width: 22, fontSize: 12, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>
                    {row.rank}
                  </Text>
                  <Text style={{ flex: 1, marginHorizontal: 10, fontSize: 13.5, fontWeight: '600', color: theme.ink[900], textAlign: 'right' }} numberOfLines={1}>
                    {row.teamName}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.ink[500], marginEnd: 12 }}>{row.played}</Text>
                  <View
                    style={{
                      backgroundColor: brand.accentGlow,
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      minWidth: 30,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '800', color: theme.ink[900], textAlign: 'center' }}>
                      {row.points}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </Section>
        ) : null}

        {/* Next & last match cards */}
        {data.nextMatch && !liveFeature ? null : data.nextMatch ? (
          <Section title="המשחק הבא">
            <MatchPreviewRow match={data.nextMatch} onPress={() => router.push(`/games/${data.nextMatch!.id}` as any)} brandAccent={brand.accent} />
          </Section>
        ) : null}

        {data.lastMatch ? (
          <Section title="המשחק האחרון">
            <MatchPreviewRow match={data.lastMatch} onPress={() => router.push(`/games/${data.lastMatch!.id}` as any)} brandAccent={brand.accent} />
          </Section>
        ) : null}

        {/* News strip */}
        {data.newsStrip.length > 0 ? (
          <Section title="חדשות">
            <Card pad={false}>
              {data.newsStrip.slice(0, 5).map((n, i, arr) => (
                <View
                  key={n.id}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                    borderBottomColor: theme.ink[100],
                  }}
                >
                  <Text style={{ color: theme.ink[900], fontSize: 13.5, lineHeight: 18 }} numberOfLines={2}>
                    {n.preview}
                  </Text>
                  <Text style={{ color: theme.ink[500], fontSize: 11, fontWeight: '600', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {n.source}
                  </Text>
                </View>
              ))}
            </Card>
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

function MatchPreviewRow({ match, onPress, brandAccent }: { match: MatchCard; onPress: () => void; brandAccent: string }) {
  const time = (() => {
    const d = new Date(match.date);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  })();
  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';
  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: theme.ink[900], textAlign: 'right' }} numberOfLines={1}>
            {match.home.team.nameHe}
          </Text>
          <View style={{ marginHorizontal: 12, alignItems: 'center' }}>
            {isLive ? (
              <Text style={{ fontSize: 18, fontWeight: '800', color: brandAccent }}>
                {match.home.score}:{match.away.score}
              </Text>
            ) : isFinished ? (
              <Text style={{ fontSize: 18, fontWeight: '800', color: theme.ink[900] }}>
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
      </Card>
    </Pressable>
  );
}

function LiveFeatureHero({
  match,
  accentStart,
  accentEnd,
  onPress,
}: {
  match: { id: string; minute: number | null; home: { name: string; score: number | null }; away: { name: string; score: number | null } };
  accentStart: string;
  accentEnd: string;
  onPress: () => void;
}) {
  return (
    <LinearGradient
      colors={[accentStart, accentEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ paddingVertical: 22, paddingHorizontal: 16 }}
    >
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 }}>
          <Text style={{ color: 'white', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>חי עכשיו · ליגת העל</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
        <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
          <TeamCrest mono={match.home.name.slice(0, 2)} bg="rgba(255,255,255,0.2)" fg="white" size={52} radius={14} />
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
            {match.home.name}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '600' }}>בית</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: 'white', fontSize: 32, fontWeight: '800', lineHeight: 36 }}>
            {match.home.score ?? '-'} – {match.away.score ?? '-'}
          </Text>
          <View
            style={{
              marginTop: 6,
              flexDirection: 'row-reverse',
              alignItems: 'center',
              gap: 4,
              backgroundColor: 'white',
              paddingHorizontal: 10,
              paddingVertical: 3,
              borderRadius: 999,
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accentStart }} />
            <Text style={{ color: accentStart, fontSize: 11, fontWeight: '800' }}>חי {match.minute ?? '-'}'</Text>
          </View>
        </View>
        <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
          <TeamCrest mono={match.away.name.slice(0, 2)} bg="rgba(255,255,255,0.2)" fg="white" size={52} radius={14} />
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
            {match.away.name}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '600' }}>חוץ</Text>
        </View>
      </View>
      <Pressable
        onPress={onPress}
        style={{
          alignSelf: 'center',
          marginTop: 18,
          backgroundColor: 'white',
          paddingVertical: 10,
          paddingHorizontal: 22,
          borderRadius: 999,
        }}
      >
        <Text style={{ color: accentStart, fontSize: 13, fontWeight: '800' }}>לעמוד המשחק</Text>
      </Pressable>
    </LinearGradient>
  );
}

function UpcomingFeatureHero({
  match,
  accentStart,
  accentEnd,
  onPress,
}: {
  match: MatchCard;
  accentStart: string;
  accentEnd: string;
  onPress: () => void;
}) {
  const d = new Date(match.date);
  const dateLabel = `${d.toLocaleDateString('he-IL', { weekday: 'short', day: '2-digit', month: '2-digit' })} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return (
    <LinearGradient
      colors={[accentStart, accentEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ paddingVertical: 22, paddingHorizontal: 16 }}
    >
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 }}>
          <Text style={{ color: 'white', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>המשחק הבא · ליגת העל</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
        <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
          <TeamCrest mono={match.home.team.nameHe.slice(0, 2)} bg="rgba(255,255,255,0.2)" fg="white" size={52} radius={14} logoUrl={match.home.team.logoUrl} />
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
            {match.home.team.nameHe}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '600' }}>בית</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>VS</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', marginTop: 6, textAlign: 'center' }}>
            {dateLabel}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
          <TeamCrest mono={match.away.team.nameHe.slice(0, 2)} bg="rgba(255,255,255,0.2)" fg="white" size={52} radius={14} logoUrl={match.away.team.logoUrl} />
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
            {match.away.team.nameHe}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '600' }}>חוץ</Text>
        </View>
      </View>
      <Pressable
        onPress={onPress}
        style={{
          alignSelf: 'center',
          marginTop: 18,
          backgroundColor: 'white',
          paddingVertical: 10,
          paddingHorizontal: 22,
          borderRadius: 999,
        }}
      >
        <Text style={{ color: accentStart, fontSize: 13, fontWeight: '800' }}>לעמוד המשחק</Text>
      </Pressable>
    </LinearGradient>
  );
}
