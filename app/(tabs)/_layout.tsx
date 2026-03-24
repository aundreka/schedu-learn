import { Redirect, Tabs, useRouter } from 'expo-router';
import React from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function TabLayout() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const tabBarBackground = colorScheme === 'dark' ? '#0F1417' : '#FFFFFF';
  const headerBackground = colorScheme === 'dark' ? '#151718' : '#FFFFFF';
  const { authReady, user } = useFirebaseBackend();

  if (!authReady) {
    return null;
  }

  if (!user) {
    return <Redirect href="/callback" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.tint,
        tabBarInactiveTintColor: palette.tabIconDefault,
        headerStyle: {
          backgroundColor: headerBackground,
        },
        headerShadowVisible: false,
        headerTitle: '',
        headerLeft: () => (
          <View style={styles.headerLeft}>
            <Image source={require('@/assets/images/icon.png')} style={styles.logoImage} />
            <View>
              <ThemedText style={styles.logoText}>SchedU Learn</ThemedText>
              <ThemedText style={[styles.logoSubtext, { color: palette.icon }]}>
                Student planner
              </ThemedText>
            </View>
          </View>
        ),
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => router.push('/profile')}
            style={({ pressed }) => [
              styles.profileButton,
              {
                backgroundColor: pressed ? palette.tint : 'transparent',
                borderColor: palette.icon,
              },
            ]}>
            {({ pressed }) => (
              <MaterialIcons
                name="person-outline"
                size={22}
                color={pressed ? headerBackground : palette.text}
              />
            )}
          </Pressable>
        ),
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: tabBarBackground,
          borderTopColor: colorScheme === 'dark' ? '#232A2F' : '#E5E9F0',
          height: 76,
          paddingTop: 8,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <MaterialIcons size={size} name="home-filled" color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons size={size} name="calendar-month" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarIcon: ({ color, size }) => <MaterialIcons size={size} name="add-circle" color={color} />,
        }}
      />
      <Tabs.Screen
        name="study"
        options={{
          title: 'Study',
          tabBarIcon: ({ color, size }) => <MaterialIcons size={size} name="school" color={color} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, size }) => <MaterialIcons size={size} name="bar-chart" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    overflow: 'hidden',
  },
  logoImage: {
    width: 36,
    height: 36,
    borderRadius: 12,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '700',
  },
  logoSubtext: {
    fontSize: 12,
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
