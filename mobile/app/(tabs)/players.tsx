import { useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, Image, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useStats } from '@/hooks/useStats';
import { useTheme } from '@/contexts/ThemeContext';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { TabBar } from '@/design-system/TabBar';
import { theme } from '@/design-system/theme';
import type { StatsLeaderEntry } from '@shared/types/mobile-api';

type StatTab = 'scorers' | 'assists' | 'yellow' | 'red';

const TAB_ITEMS = [
  { id: 'scorers', label: 'כובשים' },
  { id: 'assists', label: 'בשלנים' },
  { id: 'yellow', label: 'צהובים' },
  { id: 'red', label: 'אדומים' },
];

const TAB_VALUE_LABEL: Record<StatTab, string> = {
  scorers: 'שערים',
  assists: 'בישולים',
  yellow: 'צהובים',
  red: 'אדומים',
};

export default function PlayersTab() {
  const router = useRouter();
  const { brand } = useTheme();
  const { data, isLoading, refetch, isRefetching } = useStats();
  const [tab, setTab] = useState<StatTab>('scorers');

  const rows = (() => {
    if (!data) return [];
    switch (tab) {
      case 'scorers': return data.categories.topScorers;
      case 'assists': return data.categories.topAssists;
      case 'yellow':  return data.categories.topYellowCards;
      case 'red':     return data.categories.topRedCards;
    }
  })();

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

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header />
      <TabBar items={TAB_ITEMS} value={tab} onChange={(id) => setTab(id as StatTab)} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
        contentContainerStyle={{ paddingVertical: 16, gap: 12, paddingBottom: 32 }}
      >
        {rows.length === 0 ? (
          <Card>
            <Text style={{ textAlign: 'center', color: theme.ink[500], padding: 16 }}>
              אין נתונים זמינים בקטגוריה זו.
            </Text>
          </Card>
        ) : (
          <Card pad={false}>
            {rows.map((entry, i) => (
              <LeaderRow
                key={entry.playerId ? `${entry.playerId}-${i}` : `${entry.rank}-${entry.playerNameHe}`}
                entry={entry}
                valueLabel={TAB_VALUE_LABEL[tab]}
                isLast={i === rows.length - 1}
                onPress={entry.playerId ? () => router.push(`/players/${entry.playerId}` as any) : undefined}
                brandAccent={brand.accent}
                brandGlow={brand.accentGlow}
              />
            ))}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

function LeaderRow({
  entry,
  valueLabel,
  isLast,
  onPress,
  brandAccent,
  brandGlow,
}: {
  entry: StatsLeaderEntry;
  valueLabel: string;
  isLast: boolean;
  onPress?: () => void;
  brandAccent: string;
  brandGlow: string;
}) {
  const Content = (
    <View
      style={{
        flexDirection: 'row-reverse',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: theme.ink[100],
      }}
    >
      <Text style={{ width: 24, fontSize: 13, fontWeight: '800', color: theme.ink[500], textAlign: 'center' }}>
        {entry.rank}
      </Text>
      {entry.photoUrl ? (
        <Image source={{ uri: entry.photoUrl }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.ink[100] }} />
      ) : (
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.ink[100], alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: theme.ink[700] }}>
            {entry.playerNameHe.slice(0, 1)}
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 14, fontWeight: '700', color: theme.ink[900], textAlign: 'right' }}
          numberOfLines={1}
        >
          {entry.playerNameHe}
        </Text>
        <Text
          style={{ fontSize: 11, color: theme.ink[500], marginTop: 2, textAlign: 'right' }}
          numberOfLines={1}
        >
          {entry.teamNameHe}
          {entry.gamesPlayed != null ? ` · ${entry.gamesPlayed} מ'` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'center', minWidth: 50, backgroundColor: brandGlow, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 }}>
        <Text style={{ fontSize: 17, fontWeight: '900', color: theme.ink[900] }}>
          {entry.value}
        </Text>
        <Text style={{ fontSize: 9, fontWeight: '700', color: brandAccent, marginTop: -2 }}>
          {valueLabel}
        </Text>
      </View>
    </View>
  );
  if (onPress) return <Pressable onPress={onPress}>{Content}</Pressable>;
  return Content;
}
