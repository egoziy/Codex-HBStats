import '../global.css';
import { I18nManager } from 'react-native';
import { Stack } from 'expo-router';

// Force RTL once on launch (no-op if already RTL).
if (!I18nManager.isRTL) {
  I18nManager.forceRTL(true);
}

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
