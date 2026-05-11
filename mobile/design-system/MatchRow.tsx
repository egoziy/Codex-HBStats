import { View, Text } from 'react-native';
import type { MatchCard } from '@shared/types/common';
import { LiveDot } from './LiveDot';

interface MatchRowProps {
  match: MatchCard;
}

function formatScore(home: number | null, away: number | null): string {
  if (home === null || away === null) return '-';
  return `${home} - ${away}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function MatchRow({ match }: MatchRowProps) {
  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';

  return (
    <View className="flex-row items-center justify-between py-3 px-2 border-b border-gray-100">
      <View className="flex-1">
        <Text className="text-base">{match.home.team.nameHe}</Text>
        <Text className="text-base">{match.away.team.nameHe}</Text>
      </View>
      <View className="px-3 items-center">
        {isLive ? (
          <>
            <LiveDot />
            <Text className="text-xs text-gray-500 mt-1">{match.minute}'</Text>
          </>
        ) : isFinished ? (
          <Text className="text-base font-semibold">
            {formatScore(match.home.score, match.away.score)}
          </Text>
        ) : (
          <Text className="text-sm text-gray-500">{formatTime(match.date)}</Text>
        )}
      </View>
    </View>
  );
}
