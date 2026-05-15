import { useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, Image, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Path } from 'react-native-svg';
import { useMatch } from '@/hooks/useMatch';
import { useTheme } from '@/contexts/ThemeContext';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { LiveDot } from '@/design-system/LiveDot';
import { TabBar } from '@/design-system/TabBar';
import { theme } from '@/design-system/theme';
import type { MatchEvent } from '@shared/types/mobile-api';

type MatchTabId = 'overview' | 'events' | 'stats' | 'lineups';

const EVENT_ICONS: Record<MatchEvent['type'], string> = {
  goal: '⚽',
  yellow: '🟨',
  red: '🟥',
  sub: '🔄',
  penalty: '🎯',
};

const STATUS_LABEL_HE: Record<string, string> = {
  finished: 'הסתיים',
  live: 'חי',
  scheduled: 'טרם החל',
  cancelled: 'בוטל',
  postponed: 'נדחה',
};

/**
 * Row layout: in RTL the HOME team is visually on the right and AWAY on the
 * left. We force flexDirection explicitly (Expo Go doesn't auto-flip flex
 * direction even when I18nManager.forceRTL is set) so the layout is correct
 * everywhere — home events read right-to-left, away events read left-to-right.
 */
function EventRow({ event }: { event: MatchEvent }) {
  const flexDirection = event.team === 'home' ? 'row-reverse' : 'row';
  return (
    <View style={{ flexDirection, alignItems: 'center', gap: 8, paddingVertical: 6 }}>
      <View style={{ width: 36, alignItems: 'center' }}>
        <Text className="text-[11px] font-black text-ink-500">{event.minute}'</Text>
      </View>
      <Text className="text-lg">{EVENT_ICONS[event.type] ?? '•'}</Text>
      <Text
        className="flex-1 text-sm font-bold text-ink-900"
        style={{ textAlign: event.team === 'home' ? 'right' : 'left' }}
      >
        {event.player ?? '—'}
      </Text>
    </View>
  );
}

function StatRow({ label, home, away }: { label: string; home: string | number; away: string | number }) {
  // HOME value on the right (start in RTL), AWAY on the left — force row-reverse
  // so it always reads correctly regardless of Expo Go's RTL handling.
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f4' }}>
      <Text style={{ width: 48, textAlign: 'right' }} className="text-sm font-black text-ink-900">{home}</Text>
      <Text className="flex-1 text-center text-[11px] font-semibold text-ink-500 uppercase tracking-wider">{label}</Text>
      <Text style={{ width: 48, textAlign: 'left' }} className="text-sm font-black text-ink-900">{away}</Text>
    </View>
  );
}

export default function MatchScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { data, isLoading } = useMatch(id);
  const { brand } = useTheme();
  const [tab, setTab] = useState<MatchTabId>('overview');

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as any);
  };

  if (isLoading || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas-start">
        <ActivityIndicator color={brand.accent} />
      </View>
    );
  }

  const { match, homeTeam, awayTeam, events } = data;
  const isLive = match.status === 'live';

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      {/* Hero — match scoreline on brand gradient. Sits above the TabBar
          and stays in place while the tab content scrolls below. */}
      <LinearGradient
        colors={[brand.accent, brand.accentDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View className="px-5 py-6">
          {/* Top row: back arrow on the right (RTL home), space-reserve on left. */}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Pressable onPress={goBack} hitSlop={10} style={{ padding: 4 }}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                {/* Arrow head pointing right (back in RTL = forward visually) */}
                <Path d="M9 6l6 6-6 6" />
              </Svg>
            </Pressable>
            <View />
          </View>
          {/* HOME on the right, AWAY on the left — forced via row-reverse so
              the layout reads correctly in both RTL and Expo Go (which does
              not auto-flip flex-row). */}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
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
            <View className="items-center px-4">
              {isLive ? (
                <View className="flex-row items-center gap-1.5 mb-1">
                  <LiveDot />
                  <Text className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/80">LIVE</Text>
                </View>
              ) : null}
              <Text className="text-4xl font-black text-white">
                {match.score.home ?? '-'} – {match.score.away ?? '-'}
              </Text>
              <Text className="text-xs text-white/70 mt-1 font-semibold">
                {isLive ? `דקה ${match.minute ?? '-'}'` : (STATUS_LABEL_HE[match.status] ?? match.status)}
              </Text>
            </View>
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

      <TabBar
        items={[
          { id: 'overview', label: 'סקירה' },
          { id: 'events',   label: 'אירועים' },
          { id: 'stats',    label: 'סטטיסטיקה' },
          { id: 'lineups',  label: 'הרכבים' },
        ]}
        value={tab}
        onChange={(id) => setTab(id as MatchTabId)}
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
        {tab === 'overview' ? (
          <>
            {/* Top stats highlights */}
            {data.matchStats ? (
              <Card>
                <Section title="הסטטיסטיקה החשובה">
                  {data.matchStats.possession ? <StatRow label="החזקה" home={`${data.matchStats.possession.home}%`} away={`${data.matchStats.possession.away}%`} /> : null}
                  {data.matchStats.shots ? <StatRow label="בעיטות" home={data.matchStats.shots.home} away={data.matchStats.shots.away} /> : null}
                  {data.matchStats.corners ? <StatRow label="קרנות" home={data.matchStats.corners.home} away={data.matchStats.corners.away} /> : null}
                </Section>
              </Card>
            ) : null}
            {/* Goals only — full timeline lives in the Events tab */}
            {events.filter((e) => e.type === 'goal').length > 0 ? (
              <Card>
                <Section title="שערים">
                  {events.filter((e) => e.type === 'goal').map((e) => <EventRow key={e.id} event={e} />)}
                </Section>
              </Card>
            ) : null}
            {/* H2H summary */}
            {data.h2h && data.h2h.lastN.length > 0 ? (
              <Card>
                <Section title="היסטוריה ישירה">
                  <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-around', paddingVertical: 8 }}>
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
          </>
        ) : null}

        {tab === 'events' ? (
          events.length > 0 ? (
            <Card>
              {events.map((e) => <EventRow key={e.id} event={e} />)}
            </Card>
          ) : (
            <Card>
              <Text style={{ textAlign: 'center', color: theme.ink[500], padding: 16 }}>
                אין אירועים זמינים למשחק זה.
              </Text>
            </Card>
          )
        ) : null}

        {tab === 'stats' ? (
          data.matchStats ? (
            <Card>
              {data.matchStats.possession ? <StatRow label="החזקה" home={`${data.matchStats.possession.home}%`} away={`${data.matchStats.possession.away}%`} /> : null}
              {data.matchStats.shots ? <StatRow label="בעיטות" home={data.matchStats.shots.home} away={data.matchStats.shots.away} /> : null}
              {data.matchStats.corners ? <StatRow label="קרנות" home={data.matchStats.corners.home} away={data.matchStats.corners.away} /> : null}
            </Card>
          ) : (
            <Card>
              <Text style={{ textAlign: 'center', color: theme.ink[500], padding: 16 }}>
                הסטטיסטיקה לא נטענה.
              </Text>
            </Card>
          )
        ) : null}

        {tab === 'lineups' ? (
          (data.lineups.home.players.length > 0 || data.lineups.away.players.length > 0) ? (
            <Card>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                <View className="flex-1">
                  <Text className="text-sm font-black text-ink-900">{homeTeam.nameHe}</Text>
                  {data.lineups.home.formation ? (
                    <Text className="text-[11px] font-semibold text-ink-500 mb-2 uppercase tracking-wider">
                      מערך {data.lineups.home.formation}
                    </Text>
                  ) : null}
                  {data.lineups.home.players.filter((p) => p.isStarting).map((p) => (
                    <View key={p.player.id} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.ink[100] }}>
                      <View className="w-7 h-7 rounded-full bg-ink-100 items-center justify-center">
                        <Text className="text-[11px] font-black text-ink-700">{p.player.jerseyNumber ?? '—'}</Text>
                      </View>
                      <Text style={{ flex: 1, textAlign: 'right' }} className="text-sm text-ink-900" numberOfLines={1}>{p.player.nameHe}</Text>
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
                    <View key={p.player.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.ink[100] }}>
                      <View className="w-7 h-7 rounded-full bg-ink-100 items-center justify-center">
                        <Text className="text-[11px] font-black text-ink-700">{p.player.jerseyNumber ?? '—'}</Text>
                      </View>
                      <Text style={{ flex: 1, textAlign: 'left' }} className="text-sm text-ink-900" numberOfLines={1}>{p.player.nameHe}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Card>
          ) : (
            <Card>
              <Text style={{ textAlign: 'center', color: theme.ink[500], padding: 16 }}>
                ההרכבים לא נטענו.
              </Text>
            </Card>
          )
        ) : null}
      </ScrollView>
    </View>
  );
}
