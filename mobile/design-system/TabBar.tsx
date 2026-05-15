/**
 * TabBar — underline tabs used inside detail screens (match / team / player)
 * to switch between sub-sections. Matches the prototype's ILTabBar.
 */

import { View, Text, Pressable, ScrollView } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { theme } from './theme';

export interface TabItem {
  id: string;
  label: string;
}

interface TabBarProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
}

export function TabBar({ items, value, onChange }: TabBarProps) {
  const { brand } = useTheme();
  return (
    <View
      style={{
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: theme.ink[200],
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          // row-reverse so the first tab anchors to the start side in RTL
          // (force explicit since Expo Go doesn't auto-flip flex).
          flexDirection: 'row-reverse',
          gap: 20,
        }}
      >
        {items.map((tab) => {
          const active = tab.id === value;
          return (
            <Pressable key={tab.id} onPress={() => onChange(tab.id)} hitSlop={4}>
              <View style={{ paddingVertical: 12, position: 'relative' }}>
                <Text
                  style={{
                    color: active ? brand.accent : theme.ink[500],
                    fontSize: 13.5,
                    fontWeight: active ? '800' : '600',
                  }}
                >
                  {tab.label}
                </Text>
                {active ? (
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: -1,
                      height: 2,
                      backgroundColor: brand.accent,
                      borderRadius: 1,
                    }}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
