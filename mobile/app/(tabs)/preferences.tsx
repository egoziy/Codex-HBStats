import { ScrollView, View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePreferences } from '@/hooks/usePreferences';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { theme } from '@/design-system/theme';

export default function PreferencesScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { data, isLoading } = usePreferences();
  const { color, brand, schemes, setColor } = useTheme();

  const onLogout = () => {
    Alert.alert('יציאה', 'האם להתנתק?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'התנתק',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  if (isLoading || !data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.canvas.start }}>
        <ActivityIndicator color={brand.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.canvas.start }}
      contentContainerStyle={{ paddingVertical: 16, gap: 16, paddingBottom: 32 }}
    >
      <Section title="משתמש">
        <Card>
          <Text style={{ color: theme.ink[500], fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>
            מחובר כ
          </Text>
          <Text style={{ color: theme.ink[900], fontSize: 18, fontWeight: '800', marginTop: 2 }}>
            {user?.name ?? '—'}
          </Text>
          <Text style={{ color: theme.ink[500], fontSize: 13, marginTop: 2 }}>{user?.email ?? '—'}</Text>
        </Card>
      </Section>

      <Section title="צבע מותג" actionLabel="">
        <Card>
          <Text style={{ color: theme.ink[700], fontSize: 13, marginBottom: 12 }}>
            הצבע נשמר במכשיר ומסונכרן עם בחירת הצבע באתר.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {schemes.map((s) => {
              const selected = s.name === color;
              return (
                <Pressable
                  key={s.name}
                  onPress={() => setColor(s.name)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? s.preview : theme.ink[200],
                    backgroundColor: selected ? s.preview + '14' : 'transparent',
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: s.preview,
                      marginBottom: 6,
                    }}
                  />
                  <Text
                    style={{
                      color: selected ? theme.ink[900] : theme.ink[700],
                      fontSize: 12,
                      fontWeight: selected ? '800' : '600',
                    }}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      </Section>

      <Section title="קבוצות מועדפות">
        <Card>
          {data.favoriteTeamApiIds.length === 0 ? (
            <Text style={{ color: theme.ink[500], fontSize: 13 }}>לא נבחרו עדיין</Text>
          ) : (
            <Text style={{ color: theme.ink[900], fontSize: 14, fontWeight: '600' }}>
              {data.favoriteTeamApiIds.length} קבוצות נבחרו
            </Text>
          )}
          <Text style={{ color: theme.ink[500], fontSize: 11, marginTop: 6 }}>
            עריכת המועדפים תתווסף בקרוב
          </Text>
        </Card>
      </Section>

      <Section title="ליגות מועדפות">
        <Card>
          {data.favoriteCompetitionApiIds.length === 0 ? (
            <Text style={{ color: theme.ink[500], fontSize: 13 }}>לא נבחרו עדיין</Text>
          ) : (
            <Text style={{ color: theme.ink[900], fontSize: 14, fontWeight: '600' }}>
              {data.favoriteCompetitionApiIds.length} ליגות נבחרו
            </Text>
          )}
        </Card>
      </Section>

      <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
        <Pressable onPress={onLogout}>
          <View
            style={{
              backgroundColor: '#FEE2E2',
              borderWidth: 1,
              borderColor: '#FCA5A5',
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#B91C1C', fontWeight: '700', fontSize: 14 }}>התנתק</Text>
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}
