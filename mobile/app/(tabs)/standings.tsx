import { ScrollView, View, Text, RefreshControl, ActivityIndicator, Pressable, Image } from 'react-native';
import { rtlRow } from '@/lib/rtl';
import { useRouter } from 'expo-router';
import { useStandings } from '@/hooks/useStandings';
import { useTheme } from '@/contexts/ThemeContext';
import { absoluteImage } from '@/lib/config';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { FormRow } from '@/design-system/FormPill';
import { theme } from '@/design-system/theme';
import type { StandingsRow } from '@shared/types/mobile-api';

// Top-of-table colours: gold for 1st (champion line), accent for European qual,
// red bar for relegation. Visualised as a thin vertical strip on the row.
function zoneColor(rank: number, totalInGroup: number, brandAccent: string): string | null {
  if (rank === 1) return '#F59E0B';                    // gold — champion
  if (rank <= 2) return brandAccent;                   // CL qualifying
  if (rank <= 4) return '#EA580C';                     // Europa
  if (rank >= totalInGroup) return '#DC2626';          // relegation
  return null;
}

export default function StandingsScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  const { data, isLoading, refetch, isRefetching } = useStandings();

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
          <Text style={{ color: theme.ink[700], fontSize: 14 }}>
            הטבלה לא זמינה כרגע.
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
        {data.groups.map((group) => (
          <Section key={group.label} title={group.label} dense>
            <Card pad={false}>
              {/* Column header */}
              <View
                style={{
                  flexDirection: rtlRow(),
                  alignItems: 'center',
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  backgroundColor: theme.ink[50],
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 14,
                }}
              >
                <Text style={{ width: 24, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>#</Text>
                <Text style={{ flex: 1, marginHorizontal: 10, fontSize: 10, fontWeight: '700', color: theme.ink[500] }}>קבוצה</Text>
                <Text style={{ width: 24, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>מ'</Text>
                <Text style={{ width: 36, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>הפרש</Text>
                <Text style={{ width: 32, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>נק'</Text>
              </View>
              {group.rows.map((row, i) => (
                <StandingsRowView key={row.teamId} row={row} index={i} total={group.rows.length} onPress={() => router.push(`/teams/${row.teamId}` as any)} brand={brand} />
              ))}
            </Card>
            {/* Form row preview */}
            <View style={{ paddingHorizontal: 16, marginTop: 6 }}>
              <Text style={{ fontSize: 10, color: theme.ink[500], textAlign: 'right' }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: theme.result.win, marginEnd: 2 }} />
                {' '}נצחון {' · '}
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: theme.result.draw }} />
                {' '}תיקו{' · '}
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: theme.result.loss }} />
                {' '}הפסד
              </Text>
            </View>
          </Section>
        ))}
      </ScrollView>
    </View>
  );
}

function StandingsRowView({
  row,
  index,
  total,
  onPress,
  brand,
}: {
  row: StandingsRow;
  index: number;
  total: number;
  onPress: () => void;
  brand: { accent: string; accentGlow: string };
}) {
  const zc = zoneColor(row.position, total, brand.accent);
  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          flexDirection: rtlRow(),
          alignItems: 'center',
          paddingVertical: 11,
          paddingHorizontal: 14,
          borderBottomWidth: index === total - 1 ? 0 : 1,
          borderBottomColor: theme.ink[100],
          position: 'relative',
        }}
      >
        {/* Zone bar on the right edge (RTL start) */}
        {zc ? (
          <View
            style={{
              position: 'absolute',
              top: 8,
              bottom: 8,
              right: 0,
              width: 3,
              backgroundColor: zc,
              borderRadius: 2,
            }}
          />
        ) : null}

        <Text style={{ width: 24, fontSize: 13, fontWeight: '800', color: theme.ink[500], textAlign: 'center' }}>
          {row.position}
        </Text>

        <View style={{ flexDirection: rtlRow(), alignItems: 'center', flex: 1, marginHorizontal: 10, gap: 8 }}>
          {absoluteImage(row.logoUrl) ? (
            <Image source={{ uri: absoluteImage(row.logoUrl) }} style={{ width: 22, height: 22, borderRadius: 4 }} />
          ) : (
            <View style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: theme.ink[200] }} />
          )}
          <Text
            style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: theme.ink[900], textAlign: 'right' }}
            numberOfLines={1}
          >
            {row.teamNameHe}
          </Text>
        </View>

        <Text style={{ width: 24, fontSize: 11, color: theme.ink[500], textAlign: 'center' }}>{row.played}</Text>
        <Text
          style={{ width: 36, fontSize: 11, fontWeight: '600', color: row.goalsDiff > 0 ? theme.result.win : row.goalsDiff < 0 ? theme.result.loss : theme.ink[500], textAlign: 'center' }}
        >
          {row.goalsDiff > 0 ? `+${row.goalsDiff}` : row.goalsDiff}
        </Text>
        <View
          style={{
            width: 32,
            backgroundColor: brand.accentGlow,
            borderRadius: 6,
            paddingVertical: 2,
          }}
        >
          <Text style={{ fontSize: 13.5, fontWeight: '800', color: theme.ink[900], textAlign: 'center' }}>
            {row.points}
          </Text>
        </View>
      </View>
      {row.form ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 8, flexDirection: rtlRow() }}>
          <FormRow form={row.form} size={16} gap={3} />
        </View>
      ) : null}
    </Pressable>
  );
}
