import { Redirect, Stack } from 'expo-router';

import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function AuthLayout() {
  const { authReady, user } = useFirebaseBackend();

  if (!authReady) {
    return null;
  }

  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="callback" />
    </Stack>
  );
}
