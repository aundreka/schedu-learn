import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ClayScreen, ClayCard } from '@/components/clay-ui';
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
    <ClayScreen title="Checking your session" subtitle="Getting your clay dashboard ready." onRefresh={async () => {}}>
      <ClayCard style={styles.card}>
        <ActivityIndicator size="large" color={palette.tint} />
        <ThemedText style={styles.text}>Connecting to Firebase...</ThemedText>
      </ClayCard>
    </ClayScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 28,
  },
  text: {
    fontSize: 14,
    color: '#6B5B8A',
    fontWeight: '700',
  },
});
