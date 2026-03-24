import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function StudyScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const cardBackground = colorScheme === 'dark' ? '#1E2428' : '#F4F7FB';

  return (
    <AppScreen
      eyebrow="Study"
      title="Stay locked in with guided review sessions."
      description="Firebase stays responsible for auth and sync here. Gemini can be added later through any separate backend you want."
      summary={[
        { label: 'Firebase', value: 'Auth + Firestore' },
        { label: 'Gemini', value: 'Separate' },
        { label: 'Plan', value: 'Free-friendly' },
        { label: 'Backend', value: 'Flexible' },
      ]}
      agenda={[
        {
          title: 'Resume biology deck',
          subtitle: 'Continue from card 46 with spaced-repetition prompts.',
          icon: 'school',
        },
        {
          title: 'Practice set',
          subtitle: 'Solve a short timed round to sharpen retrieval speed.',
          icon: 'timer',
        },
        {
          title: 'Concept recap',
          subtitle: 'Read concise summaries before the next lecture starts.',
          icon: 'menu-book',
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => Linking.openURL('https://ai.google.dev/')}
        style={({ pressed }) => [
          styles.infoButton,
          { backgroundColor: pressed ? palette.icon : palette.tint },
        ]}>
        <MaterialIcons name="open-in-new" size={20} color="#FFFFFF" />
        <ThemedText style={styles.infoButtonText}>Open Gemini docs</ThemedText>
      </Pressable>
      <View style={[styles.planCard, { backgroundColor: cardBackground }]}>
        <ThemedText style={styles.planTitle}>Next step for AI</ThemedText>
        <ThemedText style={styles.planText}>
          Keep using Firebase on the free plan for login and realtime sync, then connect Gemini
          later through a separate backend like Vercel, Railway, Render, or Cloud Run.
        </ThemedText>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  infoButton: {
    borderRadius: 18,
    minHeight: 54,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  infoButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  planCard: {
    borderRadius: 22,
    padding: 18,
    gap: 8,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  planText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
