import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function AuthCallbackScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const { authReady, user } = useFirebaseBackend();

  if (authReady) {
    return <Redirect href={user ? '/(tabs)' : '../'} />;
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={palette.tint} />
      <ThemedText style={styles.title}>Checking your session...</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
});
