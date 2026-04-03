/**
 * app/(tabs)/study/index.tsx
 * ─────────────────────────────────────────────────────────────
 * Study Pup Hub — two-page vertical swipe layout
 *
 * Changes from previous version:
 *  • Coins removed everywhere
 *  • snapToInterval replaced with FlatList-based paging (phone-safe)
 *  • Minutes studied TODAY stat added (resets daily)
 *  • Back navigation from any quest screen works via useFocusEffect
 *  • All AsyncStorage keys updated to match
 * ─────────────────────────────────────────────────────────────
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Colors ───────────────────────────────────────────────────
const C = {
  bg:          '#F0F4FF',
  purple:      '#7A55B0',
  purpleLight: '#DDD0FF',
  purplePale:  '#F0EAFF',
  green:       '#C8F3D7',
  blue:        '#CAE7FF',
  orange:      '#FFE4B0',
  yellow:      '#FFF0A8',
  ink:         '#1E1535',
  textMid:     '#6B5B8A',
  textLight:   '#A899C8',
  white:       '#FFFFFF',
  red:         '#FF6B6B',
};

// ─── Pup stages ───────────────────────────────────────────────
const PUP_STAGES = [
  { minXp: 0,    emoji: '🐶',   label: 'Newborn Pup',   color: C.blue        },
  { minXp: 100,  emoji: '🐕',   label: 'Playful Pup',   color: C.green       },
  { minXp: 300,  emoji: '🦮',   label: 'Smart Pup',     color: C.purpleLight },
  { minXp: 600,  emoji: '🐕‍🦺', label: 'Champion Pup', color: C.orange      },
  { minXp: 1000, emoji: '🌟🐕', label: 'Legend Pup',    color: C.yellow      },
];

const XP_REWARDS = { flashcards: 15, focus: 25, quiz: 10, reviewer: 8 } as const;
// Minutes each mode contributes to "today studied"
const MIN_REWARDS = { flashcards: 10, focus: 25, quiz: 8, reviewer: 12 } as const;
type StudyMode = keyof typeof XP_REWARDS;

const HUNGER_TICK_MS = 30 * 60 * 1000;

// ─── Mood config ──────────────────────────────────────────────
const MOODS = [
  { key: 'tired',  emoji: '😴', label: 'Tired',  sub: 'Short sessions',   pomoDuration: 15, color: C.blue   },
  { key: 'normal', emoji: '😊', label: 'Ready',  sub: 'Standard 25 min',  pomoDuration: 25, color: C.green  },
  { key: 'pumped', emoji: '🔥', label: 'Pumped', sub: 'Extended sessions', pomoDuration: 35, color: C.orange },
] as const;
type MoodKey = 'tired' | 'normal' | 'pumped';

// ─── AsyncStorage keys ────────────────────────────────────────
const SK = {
  xp:             'pup_xp',
  hunger:         'pup_hunger',
  lastSession:    'pup_last_session_ts',
  moodDate:       'pup_mood_date',
  mood:           'pup_mood',
  diary:          'pup_diary',
  lastMode:       'pup_last_mode',
  sessions:       'pup_sessions',
  streak:         'pup_streak',
  lastStreakDate:  'pup_last_streak_date',
  minsToday:      'pup_mins_today',
  minsTodayDate:  'pup_mins_today_date',
} as const;

// ─── Gemini diary (disabled: no API calls) ─────────────────────
async function fetchPupDiary(
  _mode: StudyMode,
  _stageLabel: string,
  _mood: MoodKey | null,
): Promise<string> {
  // Returning a static local message so no network / API key is used.
  return 'Biscuit curled up happily beside you. Nice work this session!';
}

// ─── Helpers ─────────────────────────────────────────────────
function getPupStage(xp: number) {
  return [...PUP_STAGES].reverse().find((s) => xp >= s.minXp) ?? PUP_STAGES[0];
}
function getHungerColor(h: number) {
  if (h >= 65) return '#4CAF50';
  if (h >= 35) return '#FF9800';
  return C.red;
}
function getHungerLabel(h: number) {
  if (h >= 80) return 'Full & happy';
  if (h >= 50) return 'Could use a snack';
  if (h >= 25) return 'Getting hungry…';
  return 'Very hungry! Study now!';
}
function todayStr() { return new Date().toDateString(); }
function formatMins(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

// ─── Component ───────────────────────────────────────────────
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function StudyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const PAGE_H = SCREEN_H - insets.top;

  const [xp,            setXp]           = useState(0);
  const [hunger,        setHunger]       = useState(100);
  const [sessions,      setSessions]     = useState(0);
  const [streak,        setStreak]       = useState(0);
  const [minsToday,     setMinsToday]    = useState(0);
  const [mood,          setMood]         = useState<MoodKey | null>(null);
  const [diary,         setDiary]        = useState('');
  const [diaryLoading,  setDiaryLoading] = useState(false);
  const [showMoodModal, setShowMoodModal]= useState(false);
  const [loaded,        setLoaded]       = useState(false);

  const stage      = useMemo(() => getPupStage(xp), [xp]);
  const nextStage  = useMemo(() => PUP_STAGES.find((s) => s.minXp > xp), [xp]);
  const xpProgress = nextStage
    ? ((xp - stage.minXp) / (nextStage.minXp - stage.minXp)) * 100
    : 100;
  const pomoDuration  = MOODS.find((m) => m.key === mood)?.pomoDuration ?? 25;
  const currentMood   = MOODS.find((m) => m.key === mood);

  // Bounce animation
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: -12, duration: 650, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0,   duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bounce]);

  // Load from AsyncStorage
  useEffect(() => {
    (async () => {
      const vals = await Promise.all([
        AsyncStorage.getItem(SK.xp),
        AsyncStorage.getItem(SK.hunger),
        AsyncStorage.getItem(SK.lastSession),
        AsyncStorage.getItem(SK.moodDate),
        AsyncStorage.getItem(SK.mood),
        AsyncStorage.getItem(SK.diary),
        AsyncStorage.getItem(SK.sessions),
        AsyncStorage.getItem(SK.streak),
        AsyncStorage.getItem(SK.lastStreakDate),
        AsyncStorage.getItem(SK.minsToday),
        AsyncStorage.getItem(SK.minsTodayDate),
      ]);
      const [
        savedXp, savedHunger, savedLastSession,
        savedMoodDate, savedMood, savedDiary,
        savedSessions, savedStreak, savedLastStreakDate,
        savedMinsToday, savedMinsTodayDate,
      ] = vals;

      let restoredHunger = Number(savedHunger ?? 100);
      let restoredStreak = Number(savedStreak ?? 0);
      // Reset mins today if it's a new day
      const restoredMins = savedMinsTodayDate === todayStr()
        ? Number(savedMinsToday ?? 0)
        : 0;

      if (savedLastSession) {
        const elapsed   = Date.now() - Number(savedLastSession);
        const intervals = Math.floor(elapsed / HUNGER_TICK_MS);
        restoredHunger  = Math.max(0, restoredHunger - intervals);
      }

      if (savedLastStreakDate) {
        const last     = new Date(savedLastStreakDate);
        const now      = new Date();
        const diffDays = Math.floor(
          (now.setHours(0, 0, 0, 0) - last.setHours(0, 0, 0, 0)) / 86400000,
        );
        if (diffDays > 1) restoredStreak = 0;
      }

      setXp(Number(savedXp ?? 0));
      setHunger(restoredHunger);
      setSessions(Number(savedSessions ?? 0));
      setStreak(restoredStreak);
      setMinsToday(restoredMins);
      if (savedDiary) setDiary(savedDiary);

      if (savedMoodDate === todayStr() && savedMood) {
        setMood(savedMood as MoodKey);
      } else {
        setShowMoodModal(true);
      }
      setLoaded(true);
    })();
  }, []);

  // On return from any study screen — award XP + update stats
  useFocusEffect(
    useCallback(() => {
      if (!loaded) return;
      (async () => {
        const lastMode = await AsyncStorage.getItem(SK.lastMode);
        if (!lastMode) return;
        await AsyncStorage.removeItem(SK.lastMode);

        const mode       = lastMode as StudyMode;
        const newXp      = xp      + (XP_REWARDS[mode]  ?? 0);
        const newHunger  = Math.min(100, hunger + 20);
        const newSessions= sessions + 1;

        // Minutes studied today
        const today            = todayStr();
        const savedMinsTodayDate = await AsyncStorage.getItem(SK.minsTodayDate);
        const base             = savedMinsTodayDate === today ? minsToday : 0;
        const newMinsToday     = base + (MIN_REWARDS[mode] ?? 10);

        // Streak
        const lastStreakDate = await AsyncStorage.getItem(SK.lastStreakDate);
        let newStreak = streak;
        if (lastStreakDate !== today) {
          newStreak += 1;
          await AsyncStorage.setItem(SK.lastStreakDate, today);
        }

        setXp(newXp);
        setHunger(newHunger);
        setSessions(newSessions);
        setStreak(newStreak);
        setMinsToday(newMinsToday);

        await Promise.all([
          AsyncStorage.setItem(SK.xp,            String(newXp)),
          AsyncStorage.setItem(SK.hunger,         String(newHunger)),
          AsyncStorage.setItem(SK.sessions,       String(newSessions)),
          AsyncStorage.setItem(SK.streak,         String(newStreak)),
          AsyncStorage.setItem(SK.lastSession,    String(Date.now())),
          AsyncStorage.setItem(SK.minsToday,      String(newMinsToday)),
          AsyncStorage.setItem(SK.minsTodayDate,  today),
        ]);

        // Gemini diary entry
        setDiaryLoading(true);
        const entry = await fetchPupDiary(mode, stage.label, mood);
        setDiary(entry);
        setDiaryLoading(false);
        await AsyncStorage.setItem(SK.diary, entry);
      })();
    }, [loaded, xp, hunger, sessions, streak, minsToday, mood, stage.label]),
  );

  const handleMoodSelect = async (key: MoodKey) => {
    setMood(key);
    setShowMoodModal(false);
    await Promise.all([
      AsyncStorage.setItem(SK.mood,     key),
      AsyncStorage.setItem(SK.moodDate, todayStr()),
    ]);
  };

  // Navigate to quest — sets the flag index.tsx reads on return
  const goTo = async (mode: StudyMode, path: string) => {
    // Removed: await AsyncStorage.setItem(SK.lastMode, mode);
    if (mode === 'focus') {
      router.push({ pathname: path as never, params: { pomoDuration } });
    } else {
      router.push(path as never);
    }
  };

  const pupExpression =
    hunger < 25       ? '😢' :
    mood === 'pumped' ? '🤩' :
    mood === 'tired'  ? '😴' :
    hunger > 75       ? '😄' : '🙂';

  const quests = [
    { mode: 'flashcards' as StudyMode, path: '/study/flashcards', emoji: '🧠', label: 'Flashcards', color: C.orange,      xp: XP_REWARDS.flashcards },
    { mode: 'focus'      as StudyMode, path: '/study/focus',      emoji: '⚡', label: 'Focus',      color: C.green,       xp: XP_REWARDS.focus      },
    { mode: 'quiz'       as StudyMode, path: '/study/quiz',       emoji: '⚔️', label: 'Quiz',       color: C.blue,        xp: XP_REWARDS.quiz       },
    { mode: 'reviewer'   as StudyMode, path: '/study/reviewer',   emoji: '📖', label: 'Reviewer',   color: C.purpleLight, xp: XP_REWARDS.reviewer   },
  ];

  const stats = [
    { label: 'XP',         value: String(xp), color: C.purpleLight },
    { label: 'Sessions',   value: String(sessions), color: C.blue        },
    { label: 'Streak',     value: `${streak}d`, color: C.orange      },
    { label: 'Today',      value: formatMins(minsToday), color: C.green       },
  ];

  // ── Pages for FlatList (phone-safe paging) ────────────────
  const pages = ['biscuit', 'command'];

  const renderPage = ({ item }: { item: string }) => {
    if (item === 'biscuit') {
      return (
        <View style={[s.page, { height: PAGE_H, width: SCREEN_W }]}>
          {/* Top bar */}
          <View style={s.topBar}>
            <View>
              <Text style={s.topGreeting}>Study space</Text>
              <Text style={s.topTitle}>Study Pup</Text>
            </View>
            {currentMood && (
              <View style={[s.chip, { backgroundColor: currentMood.color }]}>
                <Text style={s.chipText}>{currentMood.emoji} {currentMood.label}</Text>
              </View>
            )}
          </View>

          {/* Pup hero */}
          <View style={s.pupArea}>
            <Animated.Text style={[s.pupEmoji, { transform: [{ translateY: bounce }] }]}>
              {stage.emoji}
            </Animated.Text>
            <Text style={s.pupName}>Biscuit</Text>
            <View style={[s.stageBadge, { backgroundColor: stage.color }]}>
              <Text style={s.stageBadgeText}>{stage.label}</Text>
            </View>
          </View>

          {/* XP bar */}
          <View style={s.barBlock}>
            <View style={s.barRow}>
              <Text style={s.barLabel}>XP</Text>
              <Text style={s.barVal}>{xp}{nextStage ? ` / ${nextStage.minXp}` : ' (MAX)'}</Text>
            </View>
            <View style={s.track}>
              <View style={[s.fill, { width: `${xpProgress}%`, backgroundColor: C.purple }]} />
            </View>
            {nextStage && (
              <Text style={s.barHint}>{nextStage.minXp - xp} XP to {nextStage.label}</Text>
            )}
          </View>

          {/* Hunger bar */}
          <View style={s.barBlock}>
            <View style={s.barRow}>
              <Text style={s.barLabel}>Hunger</Text>
              <Text style={s.barVal}>{hunger}%</Text>
            </View>
            <View style={s.track}>
              <View style={[s.fill, { width: `${hunger}%`, backgroundColor: getHungerColor(hunger) }]} />
            </View>
            <Text style={s.barHint}>{getHungerLabel(hunger)}</Text>
          </View>

          <View style={s.swipeHint}>
            <Text style={s.swipeText}>Swipe up to manage Biscuit  ↑</Text>
          </View>
        </View>
      );
    }

    // Manage Your Dog page
    return (
      <View style={[s.page, s.pagePadBottom, { minHeight: PAGE_H, width: SCREEN_W }]}>
        <View style={s.p2TitleWrapper}>
          <Text style={s.p2Title}>Manage Your Dog</Text>
        </View>

        {/* Static Biscuit note (no online diary) */}
        <View style={[s.diaryCard, { backgroundColor: C.purplePale }]}>
          <Text style={s.diaryLabel}>Biscuit's Note</Text>
          <Text style={s.diaryText}>
            Biscuit is cheering you on from your home screen. Keep finishing quests to keep his hunger bar happy!
          </Text>
        </View>

        {/* Stats grid */}
        <View style={s.statsGrid}>
          {stats.map((stat) => (
            <View key={stat.label} style={[s.statCard, { backgroundColor: stat.color }]}>

              <Text style={s.statVal}>{stat.value}</Text>
              <Text style={s.statLbl}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Mood display */}
        {currentMood && (
          <View style={[s.moodDisplay, { backgroundColor: currentMood.color }]}>
            <Text style={s.moodDisplayEmoji}>{currentMood.emoji}</Text>
            <View>
              <Text style={s.moodDisplayTitle}>Today: {currentMood.label}</Text>
              <Text style={s.moodDisplaySub}>Focus sessions: {pomoDuration} min</Text>
            </View>
          </View>
        )}

        {/* Quest grid */}
        <Text style={s.questTitle}>Choose a Quest</Text>
        <View style={s.questGrid}>
          {quests.map((q) => (
            <TouchableOpacity
              key={q.mode}
              style={[s.questCard, { backgroundColor: q.color }]}
              onPress={() => goTo(q.mode, q.path)}
              activeOpacity={0.82}
            >
              <Text style={s.questEmoji}>{q.emoji}</Text>
              <Text style={s.questLabel}>{q.label}</Text>
              <View style={s.questXpBadge}>
                <Text style={s.questXpText}>+{q.xp} XP</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.swipeDownHint}>↓ Swipe down to see Biscuit</Text>
      </View>
    );
  };

  if (!loaded) return <View style={s.screen} />;

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>

      {/* Mood check-in modal */}
      <Modal visible={showMoodModal} transparent animationType="fade" statusBarTranslucent>
        <View style={s.overlay}>
          <View style={s.modalCard}>
            <Text style={s.modalEmoji}>🐾</Text>
            <Text style={s.modalTitle}>Good to see you!</Text>
            <Text style={s.modalSub}>
              How are you feeling? This sets Biscuit's training intensity.
            </Text>
            <View style={s.moodRow}>
              {MOODS.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => handleMoodSelect(m.key)}
                  style={[s.moodBtn, { backgroundColor: m.color }]}
                >
                  <Text style={s.moodBtnEmoji}>{m.emoji}</Text>
                  <Text style={s.moodBtnLabel}>{m.label}</Text>
                  <Text style={s.moodBtnSub}>{m.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Phone-safe vertical paging via FlatList */}
      <FlatList
        data={pages}
        keyExtractor={(item) => item}
        renderItem={renderPage}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToAlignment="start"
        // FlatList paging is far more reliable on physical devices
        // than ScrollView + snapToInterval
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  overlay: {
    flex: 1, backgroundColor: 'rgba(30,21,53,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', backgroundColor: C.white, borderRadius: 28,
    padding: 24, gap: 12, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, elevation: 12,
  },
  modalEmoji: { fontSize: 44 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: C.ink, textAlign: 'center' },
  modalSub:   { fontSize: 13, color: C.textMid, textAlign: 'center', lineHeight: 19 },
  moodRow:    { flexDirection: 'row', gap: 8, width: '100%', marginTop: 4 },
  moodBtn:    { flex: 1, borderRadius: 18, padding: 10, alignItems: 'center', gap: 3 },
  moodBtnEmoji: { fontSize: 26 },
  moodBtnLabel: { fontSize: 13, fontWeight: '900', color: C.ink },
  moodBtnSub:   { fontSize: 10, color: C.textMid, textAlign: 'center', lineHeight: 13 },

  page: {
    paddingHorizontal: 22, paddingTop: 16,
    gap: 16, justifyContent: 'center',
  },
  pagePadBottom: { paddingBottom: 48 },

  topBar:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topGreeting: { fontSize: 11, fontWeight: '700', color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.6 },
  topTitle:    { fontSize: 24, fontWeight: '900', color: C.ink },
  chip:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  chipText:    { fontSize: 13, fontWeight: '800', color: C.ink },

  pupArea:        { alignItems: 'center', gap: 6 },
  pupEmoji:       { fontSize: 88, lineHeight: 100 },
  pupExpression:  { fontSize: 30, marginTop: -10 },
  pupName:        { fontSize: 26, fontWeight: '900', color: C.ink },
  stageBadge:     { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 18 },
  stageBadgeText: { fontSize: 13, fontWeight: '800', color: C.ink },

  barBlock: { gap: 5 },
  barRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontSize: 11, fontWeight: '800', color: C.textMid, textTransform: 'uppercase', letterSpacing: 0.5 },
  barVal:   { fontSize: 11, fontWeight: '700', color: C.textMid },
  track:    { height: 11, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden' },
  fill:     { height: '100%', borderRadius: 7 },
  barHint:  { fontSize: 11, color: C.textLight },

  swipeHint: { alignItems: 'center', marginTop: 4 },
  swipeText: { fontSize: 12, color: C.textLight },

  p2TitleWrapper: { alignItems: 'center' },
  p2Title: { fontSize: 26, fontWeight: '900', color: C.ink, marginTop: 8, textAlign: 'center' },

  diaryCard:  { borderRadius: 20, padding: 16, gap: 8 },
  diaryLabel: { fontSize: 11, fontWeight: '800', color: C.textMid, textTransform: 'uppercase', letterSpacing: 0.6 },
  diaryText:  { fontSize: 14, color: C.ink, lineHeight: 22, fontStyle: 'italic' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard:  { width: '47%', borderRadius: 18, padding: 14, gap: 4, alignItems: 'center' },
  statEmoji: { fontSize: 22 },
  statVal:   { fontSize: 24, fontWeight: '900', color: C.ink },
  statLbl:   { fontSize: 11, fontWeight: '700', color: C.textMid, textTransform: 'uppercase', letterSpacing: 0.5 },

  moodDisplay:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14 },
  moodDisplayEmoji: { fontSize: 28 },
  moodDisplayTitle: { fontSize: 14, fontWeight: '900', color: C.ink },
  moodDisplaySub:   { fontSize: 12, color: C.textMid },

  questTitle: { fontSize: 16, fontWeight: '900', color: C.ink },
  questGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  questCard:  {
    width: '47%', borderRadius: 20, paddingVertical: 20,
    alignItems: 'center', gap: 8,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  questEmoji:   { fontSize: 28 },
  questLabel:   { fontSize: 14, fontWeight: '900', color: C.ink },
  questXpBadge: { backgroundColor: 'rgba(255,255,255,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  questXpText:  { fontSize: 11, fontWeight: '800', color: C.purple },

  swipeDownHint: { fontSize: 12, color: C.textLight, textAlign: 'center', marginTop: 4 },
});
