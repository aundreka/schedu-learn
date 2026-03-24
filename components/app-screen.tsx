import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type SummaryCard = {
  label: string;
  value: string;
};

type AgendaItem = {
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

type AppScreenProps = {
  eyebrow: string;
  title: string;
  description: string;
  summary: SummaryCard[];
  agenda: AgendaItem[];
  children?: ReactNode;
};

export function AppScreen({
  eyebrow,
  title,
  description,
  summary,
  agenda,
  children,
}: AppScreenProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const cardBackground = colorScheme === 'dark' ? '#1E2428' : '#F4F7FB';
  const accentBackground = colorScheme === 'dark' ? '#143647' : '#DDF2FF';

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ThemedView style={styles.hero}>
        <ThemedText style={[styles.eyebrow, { color: palette.tint }]}>{eyebrow}</ThemedText>
        <ThemedText style={styles.title}>{title}</ThemedText>
        <ThemedText style={[styles.description, { color: palette.icon }]}>{description}</ThemedText>
      </ThemedView>

      <View style={styles.summaryGrid}>
        {summary.map((item) => (
          <ThemedView key={item.label} style={[styles.summaryCard, { backgroundColor: cardBackground }]}>
            <ThemedText style={[styles.summaryLabel, { color: palette.icon }]}>{item.label}</ThemedText>
            <ThemedText style={styles.summaryValue}>{item.value}</ThemedText>
          </ThemedView>
        ))}
      </View>

      <ThemedView style={[styles.focusCard, { backgroundColor: accentBackground }]}>
        <ThemedText style={styles.focusTitle}>Today&apos;s focus</ThemedText>
        <ThemedText style={styles.focusText}>
          Keep your learning flow simple: plan what matters, capture new work fast, and review
          progress before the day ends.
        </ThemedText>
      </ThemedView>

      {children}

      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>Quick view</ThemedText>
        <ThemedText style={[styles.sectionHint, { color: palette.icon }]}>Updated for this screen</ThemedText>
      </View>

      <View style={styles.agendaList}>
        {agenda.map((item) => (
          <ThemedView key={item.title} style={[styles.agendaCard, { backgroundColor: cardBackground }]}>
            <View style={[styles.agendaIcon, { backgroundColor: accentBackground }]}>
              <MaterialIcons name={item.icon} size={20} color={palette.tint} />
            </View>
            <View style={styles.agendaCopy}>
              <ThemedText style={styles.agendaTitle}>{item.title}</ThemedText>
              <ThemedText style={[styles.agendaSubtitle, { color: palette.icon }]}>
                {item.subtitle}
              </ThemedText>
            </View>
          </ThemedView>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 120,
    gap: 24,
  },
  hero: {
    gap: 10,
  },
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCard: {
    minWidth: '47%',
    flexGrow: 1,
    borderRadius: 20,
    padding: 18,
    gap: 8,
  },
  summaryLabel: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  summaryValue: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
  },
  focusCard: {
    borderRadius: 24,
    padding: 20,
    gap: 10,
  },
  focusTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  focusText: {
    fontSize: 15,
    lineHeight: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  sectionHint: {
    fontSize: 13,
  },
  agendaList: {
    gap: 12,
  },
  agendaCard: {
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  agendaIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaCopy: {
    flex: 1,
    gap: 4,
  },
  agendaTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  agendaSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
});
