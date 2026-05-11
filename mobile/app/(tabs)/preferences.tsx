import { ScrollView, View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/hooks/usePreferences';
import { Card } from '@/design-system/Card';

export default function PreferencesScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { data, isLoading } = usePreferences();

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
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <Text className="text-sm text-gray-500">משתמש</Text>
        <Text className="text-lg font-semibold">{user?.name ?? '—'}</Text>
        <Text className="text-sm text-gray-500">{user?.email ?? '—'}</Text>
      </Card>

      <Card>
        <Text className="text-base font-bold mb-2">קבוצות מועדפות</Text>
        {data.favoriteTeamApiIds.length === 0 ? (
          <Text className="text-sm text-gray-500">לא נבחרו עדיין</Text>
        ) : (
          <Text className="text-sm">
            {data.favoriteTeamApiIds.length} קבוצות נבחרו
          </Text>
        )}
        <Text className="text-xs text-gray-400 mt-2">
          עריכת המועדפים תתווסף בקרוב
        </Text>
      </Card>

      <Card>
        <Text className="text-base font-bold mb-2">ליגות מועדפות</Text>
        {data.favoriteCompetitionApiIds.length === 0 ? (
          <Text className="text-sm text-gray-500">לא נבחרו עדיין</Text>
        ) : (
          <Text className="text-sm">
            {data.favoriteCompetitionApiIds.length} ליגות נבחרו
          </Text>
        )}
      </Card>

      <Pressable onPress={onLogout}>
        <View className="bg-red-50 border border-red-200 rounded-md py-3 items-center mt-4">
          <Text className="text-red-700 font-semibold">התנתק</Text>
        </View>
      </Pressable>
    </ScrollView>
  );
}
