/**
 * app/(tabs)/study/focus.tsx
 * ─────────────────────────────────────────────────────────────
 * Focus Quest — Pomodoro timer with custom duration
 *
 * Changes:
 *  • Custom time stepper (+/- buttons) lets user override mood duration
 *  • Back button in header so user can always return to hub
 *  • Timer phases: Setup → Focusing → Break → Complete
 * ─────────────────────────────────────────────────────────────
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ClayCard, ClayScreen } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';

// ─── Biscuit encouragements ───────────────────────────────────
const ENCOURAGEMENTS = [
  { emoji: '🐾', text: "Biscuit is sitting beside you. You've got this." },
  { emoji: '🐶', text: 'Biscuit wagged his tail. Keep going, scholar!' },
  { emoji: '💪', text: "Biscuit sees your focus. He's so proud." },
  { emoji: '🌟', text: "Halfway there! Biscuit saved you a spot." },
  { emoji: '🍖', text: "Biscuit says: finish strong and he'll do a happy dance." },
  { emoji: '📚', text: 'Every second counts. Biscuit believes in you.' },
  { emoji: '🐕', text: 'Biscuit’s ears perk up every time you study.' },
  { emoji: '✨', text: "You're building something great. One minute at a time." },
];

const BREAK_MESSAGES = [
  { emoji: '🐾', text: 'Session done! Biscuit is doing zoomies in celebration.' },
  { emoji: '🎉', text: "Biscuit is so happy! Rest your eyes for a bit." },
  { emoji: '🐶', text: "Great work! Biscuit saved your seat. Take a breather." },
];

// ─── Helpers ─────────────────────────────────────────────────
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const BREAK_SECONDS      = 5 * 60;
const ENCOURAGE_INTERVAL = 2 * 60;
const MIN_DURATION       = 5;   // minimum 5 min
const MAX_DURATION       = 90;  // maximum 90 min

// ─── Component ───────────────────────────────────────────────
export default function FocusScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pomoDuration?: string }>();

  const moodDuration = Number(params.pomoDuration ?? 25);

  // ── Custom duration (user can override) ───────────────────
  const [customDuration, setCustomDuration] = useState(moodDuration);

  // ── Timer state ───────────────────────────────────────────
  const totalSeconds = customDuration * 60;
  const [secondsLeft,  setSecondsLeft]  = useState(totalSeconds);
  const [isRunning,    setIsRunning]    = useState(false);
  const [isFinished,   setIsFinished]   = useState(false);
  const [isBreak,      setIsBreak]      = useState(false);
  const [breakSeconds, setBreakSeconds] = useState(BREAK_SECONDS);
  const [sessionDone,  setSessionDone]  = useState(false);
  const [started,      setStarted]      = useState(false); // once started, hide stepper

  // ── Encouragement ─────────────────────────────────────────
  const [encourageIndex, setEncourageIndex] = useState(0);
  const elapsedRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset timer when customDuration changes (only before starting)
  useEffect(() => {
    if (!started) {
      setSecondsLeft(customDuration * 60);
    }
  }, [customDuration, started]);

  // ── Tick ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      if (isBreak) {
        setBreakSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setIsRunning(false);
            setSessionDone(true);
            return 0;
          }
          return prev - 1;
        });
      } else {
        elapsedRef.current += 1;
        if (elapsedRef.current % ENCOURAGE_INTERVAL === 0) {
          setEncourageIndex((i) => (i + 1) % ENCOURAGEMENTS.length);
        }
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setIsRunning(false);
            setIsFinished(true);
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, isBreak]);

  // ── Controls ──────────────────────────────────────────────
  const handleStart = () => { setStarted(true); setIsRunning(true); };
  const handlePause = () => setIsRunning(false);

  const handleReset = () => {
    setIsRunning(false); setIsFinished(false);
    setIsBreak(false); setStarted(false);
    setSecondsLeft(customDuration * 60);
    setBreakSeconds(BREAK_SECONDS); setSessionDone(false);
    elapsedRef.current = 0; setEncourageIndex(0);
  };

  const handleStartBreak = () => { setIsBreak(true); setIsRunning(true); };
  const handleSkipBreak  = () => { setSessionDone(true); setIsBreak(false); setIsRunning(false); };

  const handleFinish = () => {
    if (sessionDone) {
      AsyncStorage.setItem('pup_last_mode', 'focus');
    }
    router.back();
  };

  const adjustDuration = (delta: number) => {
    setCustomDuration((prev) => Math.min(MAX_DURATION, Math.max(MIN_DURATION, prev + delta)));
  };

  const progress = isBreak
    ? Math.round(((BREAK_SECONDS - breakSeconds) / BREAK_SECONDS) * 100)
    : Math.round(((totalSeconds - secondsLeft) / totalSeconds) * 100);

  const currentEncourage = isBreak
    ? BREAK_MESSAGES[encourageIndex % BREAK_MESSAGES.length]
    : ENCOURAGEMENTS[encourageIndex];

  const timerColor = sessionDone ? styles.green : isBreak ? styles.orange : isFinished ? styles.green : styles.blue;

  return (
    <ClayScreen
      greeting="Deep Focus"
      title="Focus Quest"
      subtitle={`Mood session: ${moodDuration} min · Custom: ${customDuration} min`}
      avatarLabel="⚡"
    >

      {/* ── Custom duration stepper (hidden once started) ─── */}
      {!started && (
        <ClayCard style={[styles.card, styles.purple]}>
          <ThemedText style={styles.cardTitle}>Set Your Duration</ThemedText>
          <ThemedText style={styles.cardText}>
            Mood suggestion: {moodDuration} min. Adjust to your preference.
          </ThemedText>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              onPress={() => adjustDuration(-5)}
              style={[styles.stepBtn, customDuration <= MIN_DURATION && styles.stepBtnDisabled]}
              disabled={customDuration <= MIN_DURATION}
            >
              <ThemedText style={styles.stepBtnText}>−5</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => adjustDuration(-1)}
              style={[styles.stepBtn, customDuration <= MIN_DURATION && styles.stepBtnDisabled]}
              disabled={customDuration <= MIN_DURATION}
            >
              <ThemedText style={styles.stepBtnText}>−1</ThemedText>
            </TouchableOpacity>

            <View style={styles.stepDisplay}>
              <ThemedText style={styles.stepValue}>{customDuration}</ThemedText>
              <ThemedText style={styles.stepUnit}>min</ThemedText>
            </View>

            <TouchableOpacity
              onPress={() => adjustDuration(1)}
              style={[styles.stepBtn, customDuration >= MAX_DURATION && styles.stepBtnDisabled]}
              disabled={customDuration >= MAX_DURATION}
            >
              <ThemedText style={styles.stepBtnText}>+1</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => adjustDuration(5)}
              style={[styles.stepBtn, customDuration >= MAX_DURATION && styles.stepBtnDisabled]}
              disabled={customDuration >= MAX_DURATION}
            >
              <ThemedText style={styles.stepBtnText}>+5</ThemedText>
            </TouchableOpacity>
          </View>
          {/* Quick presets */}
          <View style={styles.presetsRow}>
            {[15, 25, 35, 45, 60].map((preset) => (
              <TouchableOpacity
                key={preset}
                onPress={() => setCustomDuration(preset)}
                style={[styles.presetBtn, customDuration === preset && styles.presetBtnActive]}
              >
                <ThemedText style={[styles.presetText, customDuration === preset && styles.presetTextActive]}>
                  {preset}m
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </ClayCard>
      )}

      {/* ── Timer display ────────────────────────────────── */}
      <ClayCard style={[styles.timerCard, timerColor]}>
        <ThemedText style={styles.phaseLabel}>
          {sessionDone  ? 'Session Complete!'  :
           isBreak      ? 'Break Time'          :
           isFinished   ? 'Focus Done!'         :
           isRunning    ? 'Focusing…'           :
           started      ? 'Paused'              : 'Ready to focus'}
        </ThemedText>
        <ThemedText style={styles.timerDisplay}>
          {isBreak ? formatTime(breakSeconds) : formatTime(secondsLeft)}
        </ThemedText>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <ThemedText style={styles.progressLabel}>
          {isBreak ? `Break · ${progress}%` : `${progress}% of ${customDuration} min`}
        </ThemedText>
      </ClayCard>

      {/* ── Biscuit encouragement ────────────────────────── */}
      {!sessionDone && started && (
        <ClayCard style={[styles.card, styles.purple]}>
          <ThemedText style={styles.encourageEmoji}>{currentEncourage.emoji}</ThemedText>
          <ThemedText style={styles.encourageText}>{currentEncourage.text}</ThemedText>
        </ClayCard>
      )}

      {/* ── Controls ─────────────────────────────────────── */}
      {!isRunning && !isFinished && !sessionDone && (
        <Pressable onPress={handleStart}>
          <ClayCard style={[styles.actionBtn, styles.green]}>
            <ThemedText style={styles.actionLabel}>
              {!started ? '▶ Start Session' : '▶ Resume'}
            </ThemedText>
          </ClayCard>
        </Pressable>
      )}

      {isRunning && !isFinished && !sessionDone && (
        <Pressable onPress={handlePause}>
          <ClayCard style={[styles.actionBtn, styles.orange]}>
            <ThemedText style={styles.actionLabel}>⏸ Pause</ThemedText>
          </ClayCard>
        </Pressable>
      )}

      {isFinished && !isBreak && !sessionDone && (
        <View style={styles.buttonRow}>
          <Pressable onPress={handleStartBreak} style={styles.flex}>
            <ClayCard style={[styles.actionBtn, styles.green]}>
              <ThemedText style={styles.actionLabel}>☕ Take Break</ThemedText>
            </ClayCard>
          </Pressable>
          <Pressable onPress={handleSkipBreak} style={styles.flex}>
            <ClayCard style={[styles.actionBtn, styles.purple]}>
              <ThemedText style={styles.actionLabel}>⏭ Skip Break</ThemedText>
            </ClayCard>
          </Pressable>
        </View>
      )}

      {isBreak && isRunning && (
        <Pressable onPress={handleSkipBreak}>
          <ClayCard style={[styles.actionBtn, styles.orange]}>
            <ThemedText style={styles.actionLabel}>⏭ End Break Early</ThemedText>
          </ClayCard>
        </Pressable>
      )}

      {!sessionDone && started && (
        <Pressable onPress={handleReset}>
          <ClayCard style={[styles.actionBtn, styles.blue]}>
            <ThemedText style={styles.actionLabel}>↩ Reset Timer</ThemedText>
          </ClayCard>
        </Pressable>
      )}

      {/* ── Session complete ─────────────────────────────── */}
      {sessionDone && (
        <>
          <ClayCard style={[styles.card, styles.green]}>
            <ThemedText style={styles.completeTitle}>🐾 Biscuit is thrilled!</ThemedText>
              <ThemedText style={styles.completeText}>
                You completed a {customDuration}-minute focus session. Biscuit’s energy is refilling!
              </ThemedText>
            <ThemedText style={styles.rewardText}>+25 XP · Hunger +20</ThemedText>
          </ClayCard>
          <View style={styles.buttonRow}>
            <Pressable onPress={handleReset} style={styles.flex}>
              <ClayCard style={[styles.actionBtn, styles.blue]}>
                <ThemedText style={styles.actionLabel}>🔄 Another Round</ThemedText>
              </ClayCard>
            </Pressable>
            <Pressable onPress={() => router.back()} style={styles.flex}>
              <ClayCard style={[styles.actionBtn, styles.purple]}>
                <ThemedText style={styles.actionLabel}>✅ Back to Hub</ThemedText>
              </ClayCard>
            </Pressable>
          </View>
        </>
      )}

      {/* ── Finish Session ──────────────────────────────────── */}
      <Pressable onPress={handleFinish}>
        <ClayCard style={[styles.actionBtn, styles.purple]}>
          <ThemedText style={styles.actionLabel}>
            {'Go Back'}
          </ThemedText>
        </ClayCard>
      </Pressable>

    </ClayScreen>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const ink     = '#2D2250';
const textMid = '#6B5B8A';

const styles = StyleSheet.create({
  card:        { gap: 8 },
  cardTitle:   { fontSize: 16, fontWeight: '900', color: ink },
  cardText:    { fontSize: 13, color: textMid, lineHeight: 19 },

  // Duration stepper
  stepperRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  stepBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.35 },
  stepBtnText:     { fontSize: 14, fontWeight: '900', color: ink },
  stepDisplay:     { alignItems: 'center', minWidth: 70 },
  stepValue:       { fontSize: 36, fontWeight: '900', color: ink, lineHeight: 40 },
  stepUnit:        { fontSize: 12, color: textMid, fontWeight: '700' },

  presetsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  presetBtn:  {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.5)',
  },
  presetBtnActive: { backgroundColor: '#7A55B0' },
  presetText:      { fontSize: 12, fontWeight: '800', color: textMid },
  presetTextActive:{ color: '#fff' },

  // Timer
  timerCard:     { gap: 10, alignItems: 'center', paddingVertical: 24 },
  phaseLabel:    { fontSize: 12, fontWeight: '800', color: textMid, textTransform: 'uppercase', letterSpacing: 0.8 },
  timerDisplay:  { fontSize: 72, fontWeight: '900', color: ink, letterSpacing: -2, lineHeight: 80 },
  progressTrack: { width: '100%', height: 10, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 6, backgroundColor: '#7A55B0' },
  progressLabel: { fontSize: 12, fontWeight: '700', color: textMid },

  // Encouragement
  encourageEmoji: { fontSize: 26, textAlign: 'center' },
  encourageText:  { fontSize: 14, color: ink, lineHeight: 21, textAlign: 'center' },

  // Controls
  actionBtn:     { alignItems: 'center', paddingVertical: 14 },
  actionLabel:   { fontSize: 14, fontWeight: '800', color: ink },
  buttonRow:     { flexDirection: 'row', gap: 10 },
  flex:          { flex: 1 },

  // Complete
  completeTitle: { fontSize: 18, fontWeight: '900', color: ink, textAlign: 'center' },
  completeText:  { fontSize: 13, color: textMid, lineHeight: 20, textAlign: 'center' },
  rewardText:    { fontSize: 13, fontWeight: '800', color: '#7A55B0', textAlign: 'center', marginTop: 4 },

  blue:   { backgroundColor: '#CAE7FF' },
  green:  { backgroundColor: '#C8F3D7' },
  orange: { backgroundColor: '#FFE4B0' },
  purple: { backgroundColor: '#DDD0FF' },
});
