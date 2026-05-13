import { ScrollView, View, Text, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useMatch } from '@/hooks/useMatch';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { LiveDot } from '@/design-system/LiveDot';
import { theme } from '@/design-system/theme';
import type { MatchEvent } from '@shared/types/mobile-api';

const EVENT_ICONS: Record<MatchEvent['type'], string> = {
  goal: '⚽',
  yellow: '🟨',
  red: '🟥',
  sub: '🔄',
  penalty: '🎯',
};

function EventRow({ event }: { event: MatchEvent }) {
  const align = event.team === 'home' ? 'flex-row' : 'flex-row-reverse';
  return (
    <View className={`${align} items-center gap-2 py-1.5`}>
      <View className="w-10 items-center">
        <Text className="text-[11px] font-black text-ink-500">{event.minute}'</Text>
      </View>
      <Text className="text-lg">{EVENT_ICONS[event.type]}</Text>
      <Text className="flex-1 text-sm font-bold text-ink-900">{event.player ?? '—'}</Text>
    </View>
  );
}

function StatRow({ label, home, away }: { label: string; home: string | number; away: string | number }) {
  return (
    <View className="flex-row items-center py-2 border-b border-ink-100">
      <Text className="w-12 text-sm font-black text-ink-900 text-start">{home}</Text>
      <Text className="flex-1 text-center text-[11px] font-semibold text-ink-500 uppercase tracking-wider">{label}</Text>
      <Text className="w-12 text-sm font-black text-ink-900 text-end">{away}</Text>
    </View>
  );
}

export default function MatchScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { data, isLoading } = useMatch(id);

  if (isLoading || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas-start">
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const { match, homeTeam, awayTeam, events } = data;
  const isLive = match.status === 'live';

  return (
    <ScrollView className="flex-1 bg-canvas-start" contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      {/* Hero — match scoreline on purple→blue gradient */}
      <LinearGradient
        colors={[theme.hero.start, theme.hero.end]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 28, overflow: 'hidden' }}
      >
        <View className="px-5 py-6">
          <View className="flex-row items-center justify-between">
            {/* HOME (right side in RTL) */}
            <View className="items-center flex-1">
              {homeTeam.logoUrl ? (
                <Image source={{ uri: homeTeam.logoUrl }} className="w-16 h-16 rounded-md bg-white/10" />
              ) : (
                <View className="w-16 h-16 rounded-md bg-white/15 items-center justify-center">
                  <Text className="text-2xl font-black text-white">{homeTeam.nameHe.slice(0, 1)}</Text>
                </View>
              )}
              <Text className="text-sm mt-2 text-center text-white font-bold" numberOfLines={2}>{homeTeam.nameHe}</Text>
            </View>
            {/* SCORE */}
            <View className="items-center px-4">
              {isLive ? (
                <View className="flex-row items-center gap-1.5 mb-1">
                  <LiveDot />
                  <Text className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/80">LIVE</Text>
                </View>
              ) : null}
              <Text className="text-4xl font-black text-white">
                {match.score.home ?? '-'} : {match.score.away ?? '-'}
              </Text>
              <Text className="text-xs text-white/70 mt-1 font-semibold">
                {isLive ? `דקה ${match.minute ?? '-'}'` : match.status}
              </Text>
            </View>
            {/* AWAY (left side in RTL) */}
            <View className="items-center flex-1">
              {awayTeam.logoUrl ? (
                <Image source={{ uri: awayTeam.logoUrl }} className="w-16 h-16 rounded-md bg-white/10" />
              ) : (
                <View className="w-16 h-16 rounded-md bg-white/15 items-center justify-center">
                  <Text className="text-2xl font-black text-white">{awayTeam.nameHe.slice(0, 1)}</Text>
                </View>
              )}
              <Text className="text-sm mt-2 text-center text-white font-bold" numberOfLines={2}>{awayTeam.nameHe}</Text>
            </View>
          </View>
          {match.venue ? (
            <View className="mt-4 self-center rounded-full bg-white/15 px-3 py-1.5 border border-white/20">
              <Text className="text-xs font-bold text-white">
                {match.venue.name}{match.venue.city ? ` · ${match.venue.city}` : ''}
              </Text>
            </View>
          ) : null}
        </View>
      </LinearGradient>

      {events.length > 0 ? (
        <Card>
          <Section title="אירועים">
            {events.map((e) => <EventRow key={e.id} event={e} />)}
          </Section>
        </Card>
      ) : null}

      {data.matchStats ? (
        <Card>
          <Section title="סטטיסטיקה">
            {data.matchStats.possession ? <StatRow label="החזקה" home={`${data.matchStats.possession.home}%`} away={`${data.matchStats.possession.away}%`} /> : null}
            {data.matchStats.shots ? <StatRow label="בעיטות" home={data.matchStats.shots.home} away={data.matchStats.shots.away} /> : null}
            {data.matchStats.corners ? <StatRow label="קרנות" home={data.matchStats.corners.home} away={data.matchStats.corners.away} /> : null}
          </Section>
        </Card>
      ) : null}

      {(data.lineups.home.players.length > 0 || data.lineups.away.players.length > 0) ? (
        <Card>
          <Section title="הרכבים">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-sm font-black text-ink-900">{homeTeam.nameHe}</Text>
                {data.lineups.home.formation ? (
                  <Text className="text-[11px] font-semibold text-ink-500 mb-2 uppercase tracking-wider">
                    מערך {data.lineups.home.formation}
                  </Text>
                ) : null}
                {data.lineups.home.players.filter((p) => p.isStarting).map((p) => (
                  <View key={p.player.id} className="flex-row items-center gap-2 py-1.5 border-b border-ink-100">
                    <View className="w-7 h-7 rounded-full bg-ink-100 items-center justify-center">
                      <Text className="text-[11px] font-black text-ink-700">{p.player.jerseyNumber ?? '—'}</Text>
                    </View>
                    <Text className="flex-1 text-sm text-ink-900" numberOfLines={1}>{p.player.nameHe}</Text>
                  </View>
                ))}
              </View>
              <View className="flex-1">
                <Text className="text-sm font-black text-ink-900">{awayTeam.nameHe}</Text>
                {data.lineups.away.formation ? (
                  <Text className="text-[11px] font-semibold text-ink-500 mb-2 uppercase tracking-wider">
                    מערך {data.lineups.away.formation}
                  </Text>
                ) : null}
                {data.lineups.away.players.filter((p) => p.isStarting).map((p) => (
                  <View key={p.player.id} className="flex-row items-center gap-2 py-1.5 border-b border-ink-100">
                    <View className="w-7 h-7 rounded-full bg-ink-100 items-center justify-center">
                      <Text className="text-[11px] font-black text-ink-700">{p.player.jerseyNumber ?? '—'}</Text>
                    </View>
                    <Text className="flex-1 text-sm text-ink-900" numberOfLines={1}>{p.player.nameHe}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Section>
        </Card>
      ) : null}

      {data.h2h && data.h2h.lastN.length > 0 ? (
        <Card>
          <Section title="היסטוריה ישירה">
            <View className="flex-row justify-around py-2">
              <View className="items-center flex-1">
                <Text className="text-3xl font-black text-ink-900">{data.h2h.wins.home}</Text>
                <Text className="text-[11px] font-semibold text-ink-500 mt-1 uppercase tracking-wider" numberOfLines={1}>{homeTeam.nameHe}</Text>
              </View>
              <View className="items-center flex-1">
                <Text className="text-3xl font-black text-ink-700">{data.h2h.wins.draw}</Text>
                <Text className="text-[11px] font-semibold text-ink-500 mt-1 uppercase tracking-wider">תיקו</Text>
              </View>
              <View className="items-center flex-1">
                <Text className="text-3xl font-black text-ink-900">{data.h2h.wins.away}</Text>
                <Text className="text-[11px] font-semibold text-ink-500 mt-1 uppercase tracking-wider" numberOfLines={1}>{awayTeam.nameHe}</Text>
              </View>
            </View>
          </Section>
        </Card>
      ) : null}
    </ScrollView>
  );
}
