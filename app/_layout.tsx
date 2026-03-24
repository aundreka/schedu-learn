import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { FirebaseProvider } from '@/providers/firebase-provider';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];

  return (
    <FirebaseProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="profile"
            options={{
              title: 'Profile',
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: palette.background,
              },
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              title: 'Settings',
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: palette.background,
              },
            }}
          />
          <Stack.Screen
            name="lms-sync"
            options={{
              title: 'LMS Sync',
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: palette.background,
              },
            }}
          />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </FirebaseProvider>
  );
}
