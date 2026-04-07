import { Stack } from 'expo-router';

export default function StudyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="flashcards" />
      <Stack.Screen name="focus" />
      <Stack.Screen name="quiz" />
      <Stack.Screen name="reviewer" />
    </Stack>
  );
}