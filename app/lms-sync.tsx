import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader, ClayStatCard } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import { useFirebaseBackend } from '@/providers/firebase-provider';

function formatRelativeSyncTime(iso?: string) {
  if (!iso) return 'Not synced yet';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const SkeletonCard = () => (
  <View style={styles.skeletonCard}>
     <View style={styles.skeletonTitle} />
     <View style={styles.skeletonSubtitle} />
  </View>
);

export default function LmsSyncScreen() {
  const router = useRouter();
  const { lmsFeed, tasks, syncOpenLmsFeed, connectLms, profile, resetLmsDemo, autoScheduleTask } = useFirebaseBackend();

  const [refreshing, setRefreshing] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<'feed' | 'history'>('feed'); 
  
  const [lmsModalVisible, setLmsModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lmsUrl, setLmsUrl] = useState('https://lms.lpucavite.edu.ph/');
  const [lmsUsername, setLmsUsername] = useState('');
  const [lmsPassword, setLmsPassword] = useState('');

  const sortedFeed = useMemo(() => {
    return [...lmsFeed].sort((a, b) => new Date(a.detectedDueAt).getTime() - new Date(b.detectedDueAt).getTime());
  }, [lmsFeed]);

  const latestUpdatedAt = useMemo(() => {
    if (!sortedFeed.length) return undefined;
    return [...sortedFeed].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]?.updatedAt;
  }, [sortedFeed]);

  const activeLmsTasks = useMemo(() => tasks.filter(t => t.source === 'lms' && t.status !== 'done'), [tasks]);
  
  const completedLmsTasks = useMemo(() => {
    return tasks
      .filter(t => t.source === 'lms' && t.status === 'done')
      .sort((a, b) => {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return timeB - timeA;
      });
  }, [tasks]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await new Promise(resolve => setTimeout(resolve, 1500)); 
      await syncOpenLmsFeed();
    } catch (error: any) {
      if (error.message === 'UP_TO_DATE') {
        Alert.alert('All Caught Up!', 'Your LMS is up to date. No new assignments were found.');
      } else {
        Alert.alert('LMS Sync', error.message || 'Unable to refresh feed.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleSubmitLms = async () => {
    if (!lmsUrl || !lmsUsername || !lmsPassword) {
      Alert.alert('Missing Info', 'Please fill out all fields.');
      return;
    }

    if (lmsPassword === 'wrongpassword') {
      Alert.alert('Authentication Failed', 'Invalid LPU Moodle credentials. Please check your password and try again.');
      return;
    }

    try {
      setIsSubmitting(true);
      await connectLms({ url: lmsUrl, username: lmsUsername, password: lmsPassword });
      setLmsModalVisible(false);
      await handleRefresh();
    } catch (e) {
      Alert.alert('Connection Error', e instanceof Error ? e.message : 'Failed to connect LMS');
    } finally {
      setIsSubmitting(false);
      setLmsPassword(''); 
    }
  };

  const handleAutoSchedule = async (taskId: string) => {
    Alert.alert("GEAR AI Scheduler", "Analyzing task difficulty and generating optimal study blocks...");
    await new Promise(resolve => setTimeout(resolve, 1200)); 
    await autoScheduleTask(taskId);
    Alert.alert("Success", "Added 3 hours of focused study time to your calendar!");
  };

  return (
    <ClayScreen
      greeting="Sync center"
      title="LMS Analytics"
      subtitle="Track your imported coursework and completion status."
      avatarLabel={profile?.avatarInitials ?? 'SL'}
      onRefresh={handleRefresh}
    >
      <View style={{ marginBottom: 16, alignItems: 'flex-start' }}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={18} color="#6B5B8A" />
          <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <ClayStatCard label="Live Tasks" value={`${activeLmsTasks.length}`} />
        <ClayStatCard label="Completed" value={`${completedLmsTasks.length}`} />
        <ClayStatCard label="Last Sync" value={formatRelativeSyncTime(latestUpdatedAt)} />
      </View>

      <View style={styles.tabContainer}>
        <Pressable onPress={() => setCurrentTab('feed')} style={[styles.tab, currentTab === 'feed' && styles.activeTab]}>
          <Text style={[styles.tabText, currentTab === 'feed' && styles.activeTabText]}>Current Feed</Text>
        </Pressable>
        <Pressable onPress={() => setCurrentTab('history')} style={[styles.tab, currentTab === 'history' && styles.activeTab]}>
          <Text style={[styles.tabText, currentTab === 'history' && styles.activeTabText]}>Past Archives</Text>
        </Pressable>
      </View>

      <ClaySectionHeader
        icon={currentTab === 'feed' ? "sync" : "history"}
        title={currentTab === 'feed' ? "Imported Feed" : "Archived Deadlines"}
        accessory={
          currentTab === 'feed' ? (
            <View style={styles.headerActions}>
              <Pressable onPress={() => setLmsModalVisible(true)} style={styles.refreshButton}>
                <ClayPill style={styles.connectPill}>
                  <ThemedText style={styles.pillText}>Connect LMS</ThemedText>
                </ClayPill>
              </Pressable>
              
              <Pressable onPress={handleRefresh} disabled={refreshing} style={styles.refreshButton}>
                <ClayPill><ThemedText style={styles.pillText}>{refreshing ? 'Extracting...' : 'Refresh Data'}</ThemedText></ClayPill>
              </Pressable>
            </View>
          ) : null
        }
      />

      <View style={styles.list}>
        
        {currentTab === 'feed' && (
          <>
            {refreshing && (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            )}

            {!refreshing && activeLmsTasks.length > 0 && <ThemedText style={styles.sectionTitle}>Currently in Planner</ThemedText>}
            {!refreshing && activeLmsTasks.map((task) => (
              <Pressable key={task.id} onPress={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}>
                <ClayCard style={[styles.activeCard, task.priority === 'urgent' && { borderLeftWidth: 4, borderLeftColor: '#F44336' }]}>
                   <View style={styles.row}>
                      <View style={styles.textContainer}>
                        <ThemedText style={styles.cardTitle}>{task.title}</ThemedText>
                        <ThemedText style={styles.courseText}>{task.subject}</ThemedText>
                      </View>
                      <View style={styles.badgeContainer}>
                        {task.priority === 'urgent' && (
                          <View style={[styles.badgeSynced, { backgroundColor: '#FFE4E4', marginRight: 4 }]}>
                             <ThemedText style={[styles.statusText, { color: '#D32F2F' }]}>URGENT</ThemedText>
                          </View>
                        )}
                        <View style={styles.badgeSynced}><ThemedText style={styles.statusText}>SYNCED</ThemedText></View>
                      </View>
                   </View>

                   <View style={styles.metaRow}>
                      <ThemedText style={styles.metaLabel}>Time Req.</ThemedText>
                      <ThemedText style={styles.metaValue}>{task.estimatedMinutes} mins</ThemedText>
                   </View>
                   <View style={styles.metaRow}>
                      <ThemedText style={styles.metaLabel}>Due</ThemedText>
                      <ThemedText style={styles.metaValue}>{formatDateTime(task.dueAt)}</ThemedText>
                   </View>

                   {expandedTaskId === task.id && (task as any).notes && (
                     <View style={styles.expandedContent}>
                       <ThemedText style={styles.notesText}>{(task as any).notes}</ThemedText>
                       
                       {task.id === 'mock-task-101' && (
                         <Pressable style={styles.autoScheduleBtn} onPress={() => handleAutoSchedule(task.id)}>
                           <Text style={styles.autoScheduleText}>✨ Auto-Schedule 3 Study Blocks</Text>
                         </Pressable>
                       )}
                     </View>
                   )}
                </ClayCard>
              </Pressable>
            ))}

            {!refreshing && activeLmsTasks.length === 0 && (
              <ClayCard style={styles.emptyCard}>
                <ThemedText style={styles.emptyTitle}>No LMS items yet</ThemedText>
                <ThemedText style={styles.emptyText}>Connect your account to pull assignments into this feed.</ThemedText>
              </ClayCard>
            )}

            <View style={styles.resetContainer}>
               <Pressable onPress={resetLmsDemo}>
                 <Text style={styles.resetText}>v1.0.0 (Reset Demo Data)</Text>
               </Pressable>
            </View>
          </>
        )}

        {currentTab === 'history' && (
          <>
            {completedLmsTasks.length > 0 ? (
              completedLmsTasks.map((task) => (
                <ClayCard key={task.id} style={styles.completedCard}>
                  <View style={styles.row}>
                    <MaterialIcons name="history" size={24} color="#6B5B8A" />
                    <View style={styles.completedTextContainer}>
                      <ThemedText style={styles.completedTitle}>{task.title}</ThemedText>
                      <ThemedText style={styles.courseText}>{task.subject}</ThemedText>
                      <ThemedText style={styles.completedAtText}>
                        ✓ Done on {task.completedAt ? formatDateTime(task.completedAt) : 'Unknown date'}
                      </ThemedText>
                    </View>
                  </View>
                </ClayCard>
              ))
            ) : (
              <ThemedText style={{ color: '#6B5B8A', textAlign: 'center', marginVertical: 20 }}>
                No completed assignments found. Connect LMS to pull historical data.
              </ThemedText>
            )}
          </>
        )}

      </View>

      <Modal visible={lmsModalVisible} transparent animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Connect OpenLMS</ThemedText>
            <ThemedText style={styles.modalSubtitle}>Enter your school credentials to sync with the database.</ThemedText>
            
            <TextInput placeholder="https://lms.lpucavite.edu.ph/" placeholderTextColor="#A899C8" style={styles.input} value={lmsUrl} onChangeText={setLmsUrl} autoCapitalize="none" />
            <TextInput placeholder="Username / Student ID" placeholderTextColor="#A899C8" style={styles.input} value={lmsUsername} onChangeText={setLmsUsername} autoCapitalize="none" />
            <TextInput placeholder="Password" placeholderTextColor="#A899C8" style={styles.input} secureTextEntry value={lmsPassword} onChangeText={setLmsPassword} />
            
            <Pressable style={styles.modalButton} onPress={handleSubmitLms} disabled={isSubmitting}>
              {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Save Connection</Text>}
            </Pressable>
            
            <Pressable style={[styles.modalButton, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#A899C8' }]} onPress={() => setLmsModalVisible(false)} disabled={isSubmitting}>
              <Text style={{ color: '#2D2250', fontWeight: '800' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ClayScreen>
  );
}

const styles = StyleSheet.create({
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(122,85,176,0.1)' },
  backButtonText: { fontSize: 13, fontWeight: '800', color: '#6B5B8A' },
  statsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  tabContainer: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 12, padding: 4, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '700', color: '#A899C8' },
  activeTabText: { color: '#7A55B0', fontWeight: '900' },
  headerActions: { flexDirection: 'row', gap: 8 },
  refreshButton: { opacity: 1 },
  connectPill: { backgroundColor: '#DDD0FF' },
  pillText: { fontSize: 11, fontWeight: '800', color: '#6B5B8A' },
  list: { gap: 10, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: '#6B5B8A', marginTop: 10, textTransform: 'uppercase', letterSpacing: 1 },
  activeCard: { backgroundColor: '#D7F5DF', gap: 12 },
  completedCard: { backgroundColor: '#F0F0F5', opacity: 0.8 },
  skeletonCard: { backgroundColor: '#E0E0E0', height: 100, borderRadius: 16, marginBottom: 10, opacity: 0.6, padding: 16, justifyContent: 'center', gap: 10 },
  skeletonTitle: { backgroundColor: '#C0C0C0', height: 20, width: '70%', borderRadius: 8 },
  skeletonSubtitle: { backgroundColor: '#C0C0C0', height: 14, width: '40%', borderRadius: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  textContainer: { flex: 1, gap: 4 },
  completedTextContainer: { flex: 1, marginLeft: 12, gap: 2 },
  cardTitle: { fontSize: 15, fontWeight: '900', color: '#2D2250' },
  completedTitle: { fontSize: 15, fontWeight: '900', color: '#2D2250', opacity: 0.7 }, 
  courseText: { fontSize: 12, fontWeight: '700', color: '#6B5B8A' },
  completedAtText: { fontSize: 11, fontWeight: '800', color: '#4CAF50', marginTop: 4 },
  badgeContainer: { flexDirection: 'row' },
  badgeSynced: { backgroundColor: 'rgba(255,255,255,0.6)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '900', color: '#2D2250' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  metaLabel: { fontSize: 12, fontWeight: '700', color: '#6B5B8A' },
  metaValue: { flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '800', color: '#2D2250' },
  expandedContent: { marginTop: 8, padding: 12, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 8 },
  notesText: { fontSize: 13, color: '#2D2250', lineHeight: 20 },
  autoScheduleBtn: { marginTop: 16, backgroundColor: '#7A55B0', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  autoScheduleText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  divider: { height: 1, backgroundColor: 'rgba(107, 91, 138, 0.2)', marginVertical: 15 },
  emptyCard: { gap: 12, alignItems: 'flex-start', marginTop: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#2D2250' },
  emptyText: { fontSize: 13, lineHeight: 18, color: '#6B5B8A' },
  resetContainer: { alignItems: 'center', marginTop: 40, marginBottom: 20 },
  resetText: { fontSize: 10, color: '#A899C8', opacity: 0.5 },
  modalContainer: { flex: 1, backgroundColor: 'rgba(45, 34, 80, 0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 24, padding: 24, gap: 12, elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#2D2250', textAlign: 'center' },
  modalSubtitle: { fontSize: 13, color: '#6B5B8A', marginBottom: 8, lineHeight: 18, textAlign: 'center' },
  input: { backgroundColor: '#F4EEFF', padding: 14, borderRadius: 12, fontSize: 14, fontWeight: '600', color: '#2D2250', borderWidth: 1, borderColor: 'rgba(122,85,176,0.1)' },
  modalButton: { backgroundColor: '#7A55B0', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 6 },
});