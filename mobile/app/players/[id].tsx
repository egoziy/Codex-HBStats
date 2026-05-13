import { ScrollView, View, Text, ActivityIndicator, Image, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePlayer } from '@/hooks/usePlayer';
import { Card } from '@/design-system/Card';
import type { PlayerCareerEntry } from '@shared/types/mobile-api';

const roleLabel: Record<'started' | 'subbed_in' | 'unused' | 'subbed_out', string> = {
  started: 'התחיל',
  subbed_in: 'נכנס',
  unused: 'ספסל',
  subbed_out: 'הוחלף',
};

function formatHebrewDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

function calculateAge(iso: string | null): number | null {
  if (!iso) return null;
  const birth = new Date(iso);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

export default function PlayerScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { data, isLoading } = usePlayer(id);

  if (isLoading || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  const stats = data.currentSeasonStats;
  const age = calculateAge(data.player.dateOfBirth);

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <View className="flex-row items-center gap-3">
          {data.player.photoUrl ? (
            <Image source={{ uri: data.player.photoUrl }} className="w-20 h-20 rounded-full" />
          ) : (
            <View className="w-20 h-20 rounded-full bg-gray-200 items-center justify-center">
              <Text className="text-2xl text-gray-600 font-bold">
                {data.player.nameHe.slice(0, 1)}
              </Text>
            </View>
          )}
          <View className="flex-1">
            <Text className="text-xl font-bold">{data.player.nameHe}</Text>
            {data.player.position ? <Text className="text-sm text-gray-500">{data.player.position}</Text> : null}
            {data.player.nationality ? <Text className="text-sm text-gray-500">{data.player.nationality}</Text> : null}
          </View>
        </View>
        {data.currentTeam ? (
          <Pressable onPress={() => router.push(`/teams/${data.currentTeam!.id}` as any)}>
            <Text className="text-sm text-blue-600 mt-2">
              קבוצה: {data.currentTeam.nameHe}
            </Text>
          </Pressable>
        ) : null}
      </Card>

      {(data.player.dateOfBirth || data.player.marketValue || data.player.contractUntil) ? (
        <Card>
          <Text className="text-base font-bold mb-3">פרטים אישיים</Text>
          <View className="gap-2">
            {data.player.dateOfBirth ? (
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-500">תאריך לידה</Text>
                <Text className="text-sm font-bold">
                  {formatHebrewDate(data.player.dateOfBirth)}
                  {age !== null ? `  (גיל ${age})` : ''}
                </Text>
              </View>
            ) : null}
            {data.player.marketValue ? (
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-500">שווי שוק</Text>
                <Text className="text-sm font-bold">{data.player.marketValue}</Text>
              </View>
            ) : null}
            {data.player.contractUntil ? (
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-500">חוזה עד</Text>
                <Text className="text-sm font-bold">{formatHebrewDate(data.player.contractUntil)}</Text>
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}

      {stats ? (
        <Card>
          <Text className="text-base font-bold mb-2">סטטיסטיקות עונה</Text>
          <View className="flex-row flex-wrap gap-3 justify-around">
            <View className="items-center"><Text className="text-2xl font-bold">{stats.appearances}</Text><Text className="text-xs text-gray-500">משחקים</Text></View>
            <View className="items-center"><Text className="text-2xl font-bold">{stats.goals}</Text><Text className="text-xs text-gray-500">שערים</Text></View>
            <View className="items-center"><Text className="text-2xl font-bold">{stats.assists}</Text><Text className="text-xs text-gray-500">בישולים</Text></View>
            <View className="items-center"><Text className="text-2xl font-bold">{stats.yellowCards}</Text><Text className="text-xs text-gray-500">צהובים</Text></View>
            <View className="items-center"><Text className="text-2xl font-bold">{stats.redCards}</Text><Text className="text-xs text-gray-500">אדומים</Text></View>
            <View className="items-center"><Text className="text-2xl font-bold">{Math.round(stats.minutes / 60)}h</Text><Text className="text-xs text-gray-500">דקות</Text></View>
          </View>
        </Card>
      ) : null}

      {data.career.length > 0 ? (
        <Card>
          <Text className="text-base font-bold mb-2">היסטוריית קריירה</Text>
          {data.career.map((row, i) => (
            <CareerRow key={row.season + '-' + i} row={row} />
          ))}
        </Card>
      ) : null}

      {data.recentMatches.length > 0 ? (
        <Card>
          <Text className="text-base font-bold mb-2">5 משחקים אחרונים</Text>
          {data.recentMatches.map((m) => (
            <Pressable key={m.matchId} onPress={() => router.push(`/games/${m.matchId}` as any)}>
              <View className="py-2 border-b border-gray-100">
                <View className="flex-row justify-between">
                  <Text className="text-sm">{m.opponent}</Text>
                  <Text className="text-xs text-gray-500">{roleLabel[m.role]}</Text>
                </View>
                {m.contribution.goals > 0 || m.contribution.assists > 0 ? (
                  <Text className="text-xs text-gray-500 mt-1">
                    {m.contribution.goals > 0 && `⚽ ${m.contribution.goals} `}
                    {m.contribution.assists > 0 && `🅰 ${m.contribution.assists}`}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}

function CareerRow({ row }: { row: PlayerCareerEntry }) {
  return (
    <View className="py-2 border-b border-gray-100">
      <View className="flex-row justify-between">
        <Text className="text-sm font-bold">{row.season}</Text>
        <Text className="text-xs text-gray-500">{row.competition ?? ''}</Text>
      </View>
      {row.team ? <Text className="text-xs text-gray-500 mt-0.5">{row.team}</Text> : null}
      <View className="flex-row gap-3 mt-1">
        {row.apps !== null ? <CareerStat label="הופעות" value={row.apps} /> : null}
        {row.goals !== null ? <CareerStat label="שערים" value={row.goals} /> : null}
        {row.assists !== null ? <CareerStat label="בישולים" value={row.assists} /> : null}
        {row.rating !== null ? <CareerStat label="ציון" value={row.rating.toFixed(1)} /> : null}
      </View>
    </View>
  );
}

function CareerStat({ label, value }: { label: string; value: number | string }) {
  return (
    <View className="flex-row gap-1">
      <Text className="text-xs text-gray-500">{label}</Text>
      <Text className="text-xs font-bold">{value}</Text>
    </View>
  );
}
