import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFirebaseBackend } from '@/providers/firebase-provider';

function formatRelativeSyncTime(iso?: string) {
  if (!iso) {
    return 'Not synced yet';
  }

  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
}

export default function LmsSyncScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const cardBackground = colorScheme === 'dark' ? '#1E2428' : '#F4F7FB';
  const accentBackground = colorScheme === 'dark' ? '#143647' : '#DDF2FF';
  const { lmsFeed, refreshMockLmsFeed, user } = useFirebaseBackend();

  const handleRefresh = async () => {
    try {
      await refreshMockLmsFeed();
    } catch (error) {
      Alert.alert('LMS sync', error instanceof Error ? error.message : 'Unable to refresh LMS data.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <ThemedText style={[styles.eyebrow, { color: palette.tint }]}>LMS Sync</ThemedText>
        <ThemedText style={styles.title}>Live-looking feed of detected tasks</ThemedText>
        <ThemedText style={[styles.subtitle, { color: palette.icon }]}>
          Firestore listeners stream mock LMS activity so the data feels live while you wire up the
          real integration later.
        </ThemedText>
      </View>

      <ThemedView style={[styles.syncBanner, { backgroundColor: accentBackground }]}>
        <View style={styles.syncRow}>
          <MaterialIcons name="sync" size={20} color={palette.tint} />
          <ThemedText style={styles.syncTitle}>
            Last checked {formatRelativeSyncTime(lmsFeed[0]?.syncedAt)}
          </ThemedText>
        </View>
        <ThemedText style={styles.syncText}>
          {user
            ? `${lmsFeed.length} items detected across your live Firestore feed.`
            : 'Sign in with Google to read live Firestore updates here.'}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={handleRefresh}
          style={({ pressed }) => [
            styles.refreshButton,
            { backgroundColor: pressed ? palette.icon : palette.tint },
          ]}>
          <MaterialIcons name="cloud-sync" size={18} color="#FFFFFF" />
          <ThemedText style={styles.refreshButtonText}>Pull mock LMS update</ThemedText>
        </Pressable>
      </ThemedView>

      <View style={styles.feed}>
        {lmsFeed.map((task) => (
          <ThemedView key={task.id} style={[styles.feedCard, { backgroundColor: cardBackground }]}>
            <View style={styles.feedHeader}>
              <View style={[styles.sourceBadge, { backgroundColor: accentBackground }]}>
                <ThemedText style={[styles.sourceText, { color: palette.tint }]}>
                  {task.source}
                </ThemedText>
              </View>
              <ThemedText style={[styles.statusText, { color: palette.icon }]}>{task.status}</ThemedText>
            </View>
            <ThemedText style={styles.taskTitle}>{task.title}</ThemedText>
            <ThemedText style={[styles.courseText, { color: palette.icon }]}>{task.course}</ThemedText>
            <View style={styles.dueRow}>
              <MaterialIcons name="schedule" size={16} color={palette.tint} />
              <ThemedText style={[styles.dueText, { color: palette.icon }]}>{task.due}</ThemedText>
            </View>
          </ThemedView>
        ))}
        {!lmsFeed.length ? (
          <ThemedView style={[styles.feedCard, { backgroundColor: cardBackground }]}>
            <ThemedText style={styles.taskTitle}>No LMS items yet</ThemedText>
            <ThemedText style={[styles.courseText, { color: palette.icon }]}>
              Sign in from Profile, then pull a mock LMS update to seed live-looking sync data.
            </ThemedText>
          </ThemedView>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 120,
    gap: 20,
  },
  header: {
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
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  syncBanner: {
    borderRadius: 22,
    padding: 18,
    gap: 10,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  syncTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  syncText: {
    fontSize: 14,
    lineHeight: 20,
  },
  refreshButton: {
    marginTop: 4,
    borderRadius: 16,
    minHeight: 46,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  feed: {
    gap: 12,
  },
  feedCard: {
    borderRadius: 22,
    padding: 18,
    gap: 10,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sourceBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sourceText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusText: {
    fontSize: 12,
    textTransform: 'uppercase',
  },
  taskTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  courseText: {
    fontSize: 14,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dueText: {
    fontSize: 14,
  },
});
