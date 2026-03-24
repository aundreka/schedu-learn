import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Clay, Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const { authReady, loadingData, profile, user } = useFirebaseBackend();

  if (!authReady || loadingData) {
    return null;
  }

  if (!user) {
    return <Redirect href="/callback" />;
  }

  if (profile && !profile.onboardingCompleted) {
    return <Redirect href="/profile" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: palette.background,
        },
        tabBarActiveTintColor: palette.tint,
        tabBarInactiveTintColor: palette.tabIconDefault,
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 88,
          paddingTop: 10,
          paddingBottom: 20,
          backgroundColor: 'rgba(255,255,255,0.9)',
          borderTopWidth: 0,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          ...Clay.deepShadow,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          fontFamily: Fonts.rounded,
        },
        tabBarIconStyle: {
          marginBottom: 2,
        },
        tabBarBackground: () => <View style={styles.tabBarBackground} />,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <View style={styles.tabItem}>
              <MaterialIcons size={size} name="home-filled" color={color} />
              {focused ? <View style={styles.activeDot} /> : null}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size, focused }) => (
            <View style={styles.tabItem}>
              <MaterialIcons size={size} name="calendar-month" color={color} />
              {focused ? <View style={styles.activeDot} /> : null}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size, focused }) => (
            <View style={styles.tabItem}>
              <MaterialIcons size={size} name="task-alt" color={color} />
              {focused ? <View style={styles.activeDot} /> : null}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="study"
        options={{
          href: '/study',
          title: 'Study',
          tabBarIcon: ({ color, size, focused }) => (
            <View style={styles.tabItem}>
              <MaterialIcons size={size} name="menu-book" color={color} />
              {focused ? <View style={styles.activeDot} /> : null}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, size, focused }) => (
            <View style={styles.tabItem}>
              <MaterialIcons size={size} name="bar-chart" color={color} />
              {focused ? <View style={styles.activeDot} /> : null}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarBackground: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 44,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#7A55B0',
    marginTop: 3,
  },
});
