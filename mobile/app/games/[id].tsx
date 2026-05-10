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
    </ScrollView>
  );
}
