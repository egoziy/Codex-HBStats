import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'בית' }} />
      <Tabs.Screen name="live" options={{ title: 'לייב' }} />
      <Tabs.Screen name="preferences" options={{ title: 'הגדרות' }} />
    </Tabs>
  );
}
