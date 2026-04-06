import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader, ClayStatCard } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import { useFirebaseBackend } from '@/providers/firebase-provider';
import type { GroupStudySlot } from '@/lib/firebase/types';

const SkeletonCard = () => (
  <View style={styles.skeletonCard}>
    <View style={styles.skeletonTitle} />
    <View style={styles.skeletonSubtitle} />
  </View>
);

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

function formatSlotRange(slot: GroupStudySlot) {
  const start = new Date(slot.startsAt);
  const end = new Date(slot.endsAt);
  return `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}-${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export default function LmsSyncScreen() {
  const {
    lmsFeed,
    profile,
    refreshMockLmsFeed,
    createTaskFromLmsFeed,
    connectLms,
    syncOpenLmsFeed,
    resetLmsDemo,
    autoScheduleTask,
    fetchGroupStudySlots,
    user,
  } = useFirebaseBackend();

  const [refreshing, setRefreshing] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [groupSlots, setGroupSlots] = useState<GroupStudySlot[]>([]);
  const [lmsModalVisible, setLmsModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lmsUrl, setLmsUrl] = useState('https://lms.lpucavite.edu.ph/');
  const [lmsUsername, setLmsUsername] = useState('');
  const [lmsPassword, setLmsPassword] = useState('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const loadGroupSlots = useCallback(async () => {
    if (!user) {
      setGroupSlots([]);
      return;
    }

    try {
      const slots = await fetchGroupStudySlots();
      setGroupSlots(slots);
    } catch (error) {
      console.error('Group study slots', error);
    }
  }, [fetchGroupStudySlots, user]);

  useEffect(() => {
    loadGroupSlots();
  }, [loadGroupSlots]);

  const sortedFeed = useMemo(() => {
    return [...lmsFeed].sort(
      (a, b) => new Date(a.detectedDueAt).getTime() - new Date(b.detectedDueAt).getTime()
    );
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
      await syncOpenLmsFeed();
      await loadGroupSlots();
      Alert.alert('LMS Sync', 'Feed refreshed with live LMS data.');
    } catch (error) {
      if (error instanceof Error && error.message.includes('connected')) {
        await refreshMockLmsFeed();
        await loadGroupSlots();
        Alert.alert('LMS Sync', 'Loaded sample feed while you connect your LMS account.');
      } else {
        Alert.alert('LMS Sync', error instanceof Error ? error.message : 'Unable to refresh feed.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleSubmitLms = async () => {
    if (!lmsUrl || !lmsUsername || !lmsPassword) {
      Alert.alert('Missing info', 'Please fill out your LMS URL, username, and password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await connectLms({ url: lmsUrl, username: lmsUsername, password: lmsPassword });
      setLmsModalVisible(false);
      await handleRefresh();
    } catch (error) {
      Alert.alert('Connection error', error instanceof Error ? error.message : 'Unable to connect to LMS.');
    } finally {
      setIsSubmitting(false);
      setLmsPassword('');
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

  const handleAutoSchedule = async (taskId: string) => {
    try {
      Alert.alert('GEAR AI Scheduler', 'Analyzing task difficulty and generating focused study blocks...');
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await autoScheduleTask(taskId);
      Alert.alert('Success', 'Added 3 hours of focused study time to your calendar!');
    } catch (error) {
      Alert.alert('Auto-schedule', error instanceof Error ? error.message : 'Unable to generate blocks.');
    }
  };

  return (
    <ClayScreen
      greeting="Sync center"
      title="LMS Feed"
      subtitle="Auto-detect assignments, quizzes, and exams while planning group study time."
      avatarLabel={profile?.avatarInitials ?? 'SL'}
      onRefresh={handleRefresh}
    >
      <View style={styles.pageWrapper}>
        <View style={styles.statsRow}>
          <ClayStatCard label="Items" value={`${sortedFeed.length}`} />
          <ClayStatCard label="Needs review" value={`${newCount}`} />
          <ClayStatCard label="Last sync" value={formatRelativeSyncTime(latestUpdatedAt)} />
          <ClayStatCard label="Group matches" value={`${groupSlots.length}`} />
        </View>

        <ClaySectionHeader
          icon="sync"
          title="Detected changes"
          accessory={
            <View style={styles.headerActions}>
              <Pressable onPress={() => setLmsModalVisible(true)} style={styles.refreshButton}>
                <ClayPill style={styles.connectPill}>
                  <ThemedText style={styles.pillText}>Connect LMS</ThemedText>
                </ClayPill>
              </Pressable>
              <Pressable onPress={handleRefresh} disabled={refreshing} style={styles.refreshButton}>
                <ClayPill>
                  <ThemedText style={styles.pillText}>{refreshing ? 'Extracting...' : 'Refresh data'}</ThemedText>
                </ClayPill>
              </Pressable>
            </View>
          }
        />

        <View style={styles.list}>
          {refreshing && (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          )}

          {!sortedFeed.length && !refreshing && (
            <ClayCard style={styles.emptyCard}>
              <ThemedText style={styles.emptyTitle}>No LMS items yet</ThemedText>
              <ThemedText style={styles.emptyText}>
                Connect your LMS to see assignments, quizzes, and exams in your sync feed.
              </ThemedText>
              <Pressable onPress={handleRefresh} style={styles.refreshButton}>
                <ClayPill>
                  <ThemedText style={styles.pillText}>Sync feed</ThemedText>
                </ClayPill>
              </Pressable>
            </ClayCard>
          )}

          {sortedFeed.map((item) => {
            const tone = getStatusTone(item.status);
            const isImporting = importingId === item.id;
            const isSynced = item.status === 'synced';
            const isExpanded = expandedItemId === item.id;

            return (
              <Pressable
                key={item.id}
                onPress={() => setExpandedItemId(isExpanded ? null : item.id)}
                style={{ width: '100%' }}
              >
                <ClayCard style={[styles.card, tone.card]}>
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

                  {isExpanded && item.linkedTaskId ? (
                    <View style={styles.expandedContent}>
                      <ThemedText style={styles.notesText}>Drop 3 focused study blocks into your calendar.</ThemedText>
                      <Pressable style={styles.autoScheduleBtn} onPress={() => handleAutoSchedule(item.linkedTaskId)}>
                        <Text style={styles.autoScheduleText}>✨ Auto-schedule focus time</Text>
                      </Pressable>
                    </View>
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
                        <ThemedText style={styles.actionButtonText}>{isSynced ? 'Imported' : 'Add to planner'}</ThemedText>
                      )}
                    </Pressable>
                  </View>
                </ClayCard>
              </Pressable>
            );
          })}
        </View>

        <ClaySectionHeader
          icon="groups"
          title="Group study coordination"
          subtitle="Find shared windows with classmates for synchronized study sessions."
          accessory={
            <Pressable onPress={loadGroupSlots} style={styles.refreshButton}>
              <ClayPill>
                <ThemedText style={styles.pillText}>Refresh slots</ThemedText>
              </ClayPill>
            </Pressable>
          }
        />

        <View style={styles.groupSection}>
          {groupSlots.length === 0 ? (
            <ClayCard style={styles.groupEmpty}>
              <ThemedText style={styles.emptyTitle}>No matches yet</ThemedText>
              <ThemedText style={styles.emptyText}>
                Add classes or connect your LMS to surface aligned free blocks.
              </ThemedText>
            </ClayCard>
          ) : (
            groupSlots.map((slot) => (
              <ClayCard key={slot.id} style={styles.groupCard}>
                <View style={styles.groupSlotRow}>
                  <View style={styles.groupSlotMeta}>
                    <ThemedText style={styles.groupTitle}>{slot.partnerName}</ThemedText>
                    <ThemedText style={styles.groupCourse}>{slot.subject}</ThemedText>
                  </View>
                  <View style={styles.groupBadge}>
                    <ThemedText style={styles.groupBadgeText}>{slot.mode === 'online' ? 'Online' : 'Onsite'}</ThemedText>
                  </View>
                </View>

                <View style={styles.groupTopicRow}>
                  <MaterialIcons name="calendar-month" size={16} color="#6B5B8A" />
                  <ThemedText style={styles.groupRange}>{formatSlotRange(slot)}</ThemedText>
                </View>

                <View style={styles.groupTopicRow}>
                  <MaterialIcons name="chat-bubble-outline" size={16} color="#6B5B8A" />
                  <ThemedText style={styles.groupTopic}>{slot.topic}</ThemedText>
                </View>

                <View style={styles.groupTopicRow}>
                  <MaterialIcons name="place" size={16} color="#6B5B8A" />
                  <ThemedText style={styles.groupTopic}>{slot.location}</ThemedText>
                </View>

                {slot.description ? <ThemedText style={styles.notesText}>{slot.description}</ThemedText> : null}

                <View style={styles.groupActions}>
                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        'Plan session',
                        `Propose a study session with ${slot.partnerName} during this shared block.`
                      )
                    }
                  >
                    <ClayPill>
                      <ThemedText style={styles.pillText}>Plan session</ThemedText>
                    </ClayPill>
                  </Pressable>
                </View>
              </ClayCard>
            ))
          )}
        </View>

        <View style={styles.resetContainer}>
          <Pressable onPress={resetLmsDemo}>
            <Text style={styles.resetText}>v1.0.0 (Reset LMS demo data)</Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={lmsModalVisible} transparent animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Connect OpenLMS</ThemedText>
            <ThemedText style={styles.modalSubtitle}>Enter your school credentials to sync coursework automatically.</ThemedText>

            <TextInput
              placeholder="https://lms.lpucavite.edu.ph/"
              placeholderTextColor="#A899C8"
              style={styles.input}
              value={lmsUrl}
              onChangeText={setLmsUrl}
              autoCapitalize="none"
            />
            <TextInput
              placeholder="Username"
              placeholderTextColor="#A899C8"
              style={styles.input}
              value={lmsUsername}
              onChangeText={setLmsUsername}
              autoCapitalize="none"
            />
            <TextInput
              placeholder="Password"
              placeholderTextColor="#A899C8"
              style={styles.input}
              value={lmsPassword}
              onChangeText={setLmsPassword}
              secureTextEntry
            />

            <Pressable style={styles.modalButton} onPress={handleSubmitLms} disabled={isSubmitting}>
              {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Save connection</Text>}
            </Pressable>

            <Pressable
              style={[styles.modalButton, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#A899C8' }]}
              onPress={() => setLmsModalVisible(false)}
              disabled={isSubmitting}
            >
              <Text style={{ color: '#2D2250', fontWeight: '800' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ClayScreen>
  );
}

const styles = StyleSheet.create({
  pageWrapper: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 6,
  },
  refreshButton: {
    opacity: 1,
  },
  connectPill: {
    backgroundColor: '#DDD0FF',
  },
  list: {
    gap: 8,
  },
  emptyCard: {
    gap: 8,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#2D2250',
  },
  emptyText: {
    fontSize: 11,
    lineHeight: 15,
    color: '#6B5B8A',
  },
  card: {
    gap: 6,
    padding: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#2D2250',
  },
  courseText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B5B8A',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#2D2250',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B5B8A',
  },
  metaValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 10,
    fontWeight: '800',
    color: '#2D2250',
  },
  linkedText: {
    fontSize: 9,
    color: '#6B5B8A',
  },
  actionsRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  actionButton: {
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  actionButtonDisabled: {
    opacity: 0.65,
  },
  actionButtonText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#2D2250',
  },
  pillText: {
    fontSize: 9,
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
  skeletonCard: {
    backgroundColor: '#E0E0E0',
    height: 72,
    borderRadius: 16,
    marginBottom: 8,
    opacity: 0.6,
    padding: 10,
    justifyContent: 'center',
    gap: 5,
  },
  skeletonTitle: {
    backgroundColor: '#C0C0C0',
    height: 20,
    width: '70%',
    borderRadius: 8,
  },
  skeletonSubtitle: {
    backgroundColor: '#C0C0C0',
    height: 14,
    width: '40%',
    borderRadius: 8,
  },
  expandedContent: {
    marginTop: 8,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 8,
  },
  notesText: {
    fontSize: 12,
    color: '#2D2250',
    lineHeight: 18,
  },
  autoScheduleBtn: {
    marginTop: 8,
    backgroundColor: '#7A55B0',
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  autoScheduleText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  groupSection: {
    gap: 8,
  },
  groupCard: {
    gap: 6,
    padding: 10,
  },
  groupSlotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  groupSlotMeta: {
    gap: 2,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#2D2250',
  },
  groupCourse: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B5B8A',
  },
  groupBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: 'rgba(122,85,176,0.08)',
  },
  groupBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#2D2250',
  },
  groupTopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupRange: {
    fontSize: 11,
    color: '#2D2250',
    fontWeight: '700',
  },
  groupTopic: {
    fontSize: 11,
    color: '#6B5B8A',
  },
  groupActions: {
    marginTop: 4,
    flexDirection: 'row',
  },
  groupEmpty: {
    gap: 10,
    alignItems: 'flex-start',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(45, 34, 80, 0.6)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 14,
    gap: 10,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2D2250',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#6B5B8A',
    marginBottom: 6,
    lineHeight: 16,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#F4EEFF',
    padding: 10,
    borderRadius: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#2D2250',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.1)',
  },
  modalButton: {
    backgroundColor: '#7A55B0',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  resetContainer: {
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 6,
  },
  resetText: {
    fontSize: 10,
    color: '#A899C8',
  },
});
