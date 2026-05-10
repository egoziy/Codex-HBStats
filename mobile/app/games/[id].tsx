import { ScrollView, View, Text, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMatch } from '@/hooks/useMatch';
import { Card } from '@/design-system/Card';
import { LiveDot } from '@/design-system/LiveDot';
import type { MatchEvent } from '@shared/types/mobile-api';

function EventRow({ event }: { event: MatchEvent }) {
  const icon = {
    goal: '⚽',
    yellow: '🟨',
    red: '🟥',
    sub: '🔄',
    penalty: '🎯',
  }[event.type];
  const align = event.team === 'home' ? 'flex-row' : 'flex-row-reverse';
  return (
    <View className={`${align} items-center gap-2 py-1`}>
      <Text className="text-sm w-8 text-gray-500">{event.minute}'</Text>
      <Text className="text-base">{icon}</Text>
      <Text className="flex-1 text-sm">{event.player ?? '—'}</Text>
    </View>
  );
}

export default function MatchScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { data, isLoading } = useMatch(id);

  if (isLoading || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  const { match, homeTeam, awayTeam, events } = data;
  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <View className="flex-row items-center justify-between">
          <View className="items-center flex-1">
            {homeTeam.logoUrl && <Image source={{ uri: homeTeam.logoUrl }} className="w-16 h-16 rounded" />}
            <Text className="text-sm mt-2 text-center">{homeTeam.nameHe}</Text>
          </View>
          <View className="items-center px-4">
            {match.status === 'live' && <LiveDot />}
            <Text className="text-3xl font-bold">
              {match.score.home ?? '-'} - {match.score.away ?? '-'}
            </Text>
            <Text className="text-xs text-gray-500 mt-1">
              {match.status === 'live' ? `${match.minute ?? '-'}'` : match.status}
            </Text>
          </View>
          <View className="items-center flex-1">
            {awayTeam.logoUrl && <Image source={{ uri: awayTeam.logoUrl }} className="w-16 h-16 rounded" />}
            <Text className="text-sm mt-2 text-center">{awayTeam.nameHe}</Text>
          </View>
        </View>
        {match.venue && (
          <Text className="text-xs text-gray-500 text-center mt-3">
            {match.venue.name}{match.venue.city ? `, ${match.venue.city}` : ''}
          </Text>
        )}
      </Card>

      {events.length > 0 && (
        <Card>
          <Text className="text-base font-bold mb-2">אירועים</Text>
          {events.map((e) => <EventRow key={e.id} event={e} />)}
        </Card>
      )}

      {(data.lineups.home.players.length > 0 || data.lineups.away.players.length > 0) && (
        <Card>
          <Text className="text-base font-bold mb-2">הרכבים</Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-sm font-semibold mb-1">{homeTeam.nameHe}</Text>
              {data.lineups.home.formation && (
                <Text className="text-xs text-gray-500 mb-2">{data.lineups.home.formation}</Text>
              )}
              {data.lineups.home.players.filter((p) => p.isStarting).map((p) => (
                <Text key={p.player.id} className="text-sm py-1">
                  {p.player.jerseyNumber ?? '—'} · {p.player.nameHe}
                </Text>
              ))}
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold mb-1">{awayTeam.nameHe}</Text>
              {data.lineups.away.formation && (
                <Text className="text-xs text-gray-500 mb-2">{data.lineups.away.formation}</Text>
              )}
              {data.lineups.away.players.filter((p) => p.isStarting).map((p) => (
                <Text key={p.player.id} className="text-sm py-1">
                  {p.player.jerseyNumber ?? '—'} · {p.player.nameHe}
                </Text>
              ))}
            </View>
          </View>
        </Card>
      )}

      {data.matchStats && (
        <Card>
          <Text className="text-base font-bold mb-2">סטטיסטיקה</Text>
          {data.matchStats.possession && (
            <View className="flex-row justify-between py-1">
              <Text className="text-sm">{data.matchStats.possession.home}%</Text>
              <Text className="text-sm text-gray-500">החזקה</Text>
              <Text className="text-sm">{data.matchStats.possession.away}%</Text>
            </View>
          )}
          {data.matchStats.shots && (
            <View className="flex-row justify-between py-1">
              <Text className="text-sm">{data.matchStats.shots.home}</Text>
              <Text className="text-sm text-gray-500">בעיטות</Text>
              <Text className="text-sm">{data.matchStats.shots.away}</Text>
            </View>
          )}
          {data.matchStats.corners && (
            <View className="flex-row justify-between py-1">
              <Text className="text-sm">{data.matchStats.corners.home}</Text>
              <Text className="text-sm text-gray-500">קרנות</Text>
              <Text className="text-sm">{data.matchStats.corners.away}</Text>
            </View>
          )}
        </Card>
      )}

      {data.h2h && data.h2h.lastN.length > 0 && (
        <Card>
          <Text className="text-base font-bold mb-2">היסטוריה ישירה</Text>
          <View className="flex-row justify-around py-2">
            <View className="items-center">
              <Text className="text-xl font-bold">{data.h2h.wins.home}</Text>
              <Text className="text-xs text-gray-500">{homeTeam.nameHe}</Text>
            </View>
            <View className="items-center">
              <Text className="text-xl font-bold">{data.h2h.wins.draw}</Text>
              <Text className="text-xs text-gray-500">תיקו</Text>
            </View>
            <View className="items-center">
              <Text className="text-xl font-bold">{data.h2h.wins.away}</Text>
              <Text className="text-xs text-gray-500">{awayTeam.nameHe}</Text>
            </View>
          </View>
        </Card>
      )}
    </ScrollView>
  );
}
