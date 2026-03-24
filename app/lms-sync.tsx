import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader, ClayStatCard } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import { useFirebaseBackend } from '@/providers/firebase-provider';

function formatRelativeSyncTime(iso?: string) {
  if (!iso) return 'Not synced yet';

  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function formatDueDate(iso: string) {
  const due = new Date(iso);

  return due.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getStatusTone(status: string) {
  switch (status) {
    case 'new':
      return {
        label: 'New',
        card: styles.orange,
        badge: styles.badgeNew,
      };
    case 'updated':
      return {
        label: 'Updated',
        card: styles.blue,
        badge: styles.badgeUpdated,
      };
    case 'synced':
      return {
        label: 'Synced',
        card: styles.green,
        badge: styles.badgeSynced,
      };
    default:
      return {
        label: status,
        card: styles.orange,
        badge: styles.badgeNew,
      };
  }
}

export default function LmsSyncScreen() {
  const { lmsFeed, profile, refreshMockLmsFeed, createTaskFromLmsFeed, user } = useFirebaseBackend();

  const [refreshing, setRefreshing] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  const sortedFeed = useMemo(() => {
    return [...lmsFeed].sort((a, b) => {
      return new Date(a.detectedDueAt).getTime() - new Date(b.detectedDueAt).getTime();
    });
  }, [lmsFeed]);

  const newCount = useMemo(() => {
    return sortedFeed.filter((item) => item.status === 'new' || item.status === 'updated').length;
  }, [sortedFeed]);

  const latestUpdatedAt = useMemo(() => {
    if (!sortedFeed.length) return undefined;

    return [...sortedFeed]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
      ?.updatedAt;
  }, [sortedFeed]);

  const handleRefresh = async () => {
    if (!user) {
      Alert.alert('LMS Sync', 'You need to be signed in first.');
      return;
    }

    try {
      setRefreshing(true);
      await refreshMockLmsFeed();
      Alert.alert('LMS Sync', 'Feed refreshed.');
    } catch (error) {
      Alert.alert('LMS Sync', error instanceof Error ? error.message : 'Unable to refresh feed.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleImport = async (feedId: string, title: string, status: string) => {
    if (status === 'synced') {
      Alert.alert('Already imported', `"${title}" has already been added to your planner.`);
      return;
    }

    try {
      setImportingId(feedId);
      await createTaskFromLmsFeed(feedId);
      Alert.alert('Added to planner', `"${title}" was imported and auto-scheduled.`);
    } catch (error) {
      Alert.alert('LMS Sync', error instanceof Error ? error.message : 'Unable to import item.');
    } finally {
      setImportingId(null);
    }
  };

  return (
    <ClayScreen
      greeting="Sync center"
      title="LMS Feed"
      subtitle="Detected coursework that can be turned into real tasks and auto-scheduled."
      avatarLabel={profile?.avatarInitials ?? 'SL'}
      onRefresh={handleRefresh}
    >
      <View style={styles.statsRow}>
        <ClayStatCard label="Items" value={`${sortedFeed.length}`} />
        <ClayStatCard label="Needs review" value={`${newCount}`} />
        <ClayStatCard label="Last sync" value={formatRelativeSyncTime(latestUpdatedAt)} />
      </View>

      <ClaySectionHeader
        icon="sync"
        title="Detected Changes"
        accessory={
          <Pressable onPress={handleRefresh} disabled={refreshing} style={styles.refreshButton}>
            <ClayPill>
              <ThemedText style={styles.pillText}>
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </ThemedText>
            </ClayPill>
          </Pressable>
        }
      />

      <View style={styles.list}>
        {!sortedFeed.length ? (
          <ClayCard style={styles.emptyCard}>
            <ThemedText style={styles.emptyTitle}>No LMS items yet</ThemedText>
            <ThemedText style={styles.emptyText}>
              Pull assignments, quizzes, and exams into this feed, then add them to your planner.
            </ThemedText>

            <Pressable onPress={handleRefresh} disabled={refreshing}>
              <ClayPill>
                <ThemedText style={styles.pillText}>
                  {refreshing ? 'Refreshing...' : 'Load sample feed'}
                </ThemedText>
              </ClayPill>
            </Pressable>
          </ClayCard>
        ) : (
          sortedFeed.map((item) => {
            const tone = getStatusTone(item.status);
            const isImporting = importingId === item.id;
            const isSynced = item.status === 'synced';

            return (
              <ClayCard key={item.id} style={[styles.card, tone.card]}>
                <View style={styles.cardHeader}>
                  <View style={styles.titleBlock}>
                    <ThemedText style={styles.cardTitle}>{item.title}</ThemedText>
                    <ThemedText style={styles.courseText}>{item.course}</ThemedText>
                  </View>

                  <View style={[styles.statusBadge, tone.badge]}>
                    <ThemedText style={styles.statusText}>{tone.label}</ThemedText>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <ThemedText style={styles.metaLabel}>Type</ThemedText>
                  <ThemedText style={styles.metaValue}>{item.type}</ThemedText>
                </View>

                <View style={styles.metaRow}>
                  <ThemedText style={styles.metaLabel}>Due</ThemedText>
                  <ThemedText style={styles.metaValue}>{formatDueDate(item.detectedDueAt)}</ThemedText>
                </View>

                <View style={styles.metaRow}>
                  <ThemedText style={styles.metaLabel}>Source</ThemedText>
                  <ThemedText style={styles.metaValue}>{item.source}</ThemedText>
                </View>

                {item.linkedTaskId ? (
                  <ThemedText style={styles.linkedText}>Linked task: {item.linkedTaskId}</ThemedText>
                ) : null}

                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={() => handleImport(item.id, item.title, item.status)}
                    disabled={isSynced || isImporting}
                    style={[styles.actionButton, isSynced ? styles.actionButtonDisabled : null]}
                  >
                    {isImporting ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <ThemedText style={styles.actionButtonText}>
                        {isSynced ? 'Imported' : 'Add to planner'}
                      </ThemedText>
                    )}
                  </Pressable>
                </View>
              </ClayCard>
            );
          })
        )}
      </View>
    </ClayScreen>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  refreshButton: {
    opacity: 1,
  },
  list: {
    gap: 10,
  },
  emptyCard: {
    gap: 12,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2D2250',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6B5B8A',
  },
  card: {
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#2D2250',
  },
  courseText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B5B8A',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#2D2250',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B5B8A',
  },
  metaValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '800',
    color: '#2D2250',
  },
  linkedText: {
    fontSize: 11,
    color: '#6B5B8A',
  },
  actionsRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionButton: {
    minWidth: 130,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  actionButtonDisabled: {
    opacity: 0.65,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#2D2250',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B5B8A',
  },
  orange: {
    backgroundColor: '#FFE4B0',
  },
  blue: {
    backgroundColor: '#CAE7FF',
  },
  green: {
    backgroundColor: '#D7F5DF',
  },
  badgeNew: {
    backgroundColor: 'rgba(255,255,255,0.50)',
  },
  badgeUpdated: {
    backgroundColor: 'rgba(255,255,255,0.50)',
  },
  badgeSynced: {
    backgroundColor: 'rgba(255,255,255,0.60)',
  },
});