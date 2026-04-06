/**
 * app/(tabs)/study/quiz.tsx
 * ─────────────────────────────────────────────────────────────
 * Quiz Quest — "Face the Darkness / Battle Mode"
 *
 * Flow:
 *  1. User uploads a PDF
 *  2. Gemini 2.5 Flash generates 10 multiple-choice questions (A B C D)
 *  3. One question per screen, tap to select answer
 *  4. Instant feedback (correct ✅ / wrong ❌ with correct answer shown)
 *  5. Final score summary + return to hub
 *     (index.tsx detects return and awards XP via pup_last_mode)
 *
 * NO separate model needed — same gemini-2.5-flash key as flashcards.
 * The API key is not screen-locked; both can use it simultaneously.
 * ─────────────────────────────────────────────────────────────
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';

// ─── Types ────────────────────────────────────────────────────

type Choice = 'A' | 'B' | 'C' | 'D';

type QuizQuestion = {
  question: string;
  choices: Record<Choice, string>;
  answer: Choice;       // correct letter
  explanation: string;  // shown after answering
};

type AnswerState = {
  selected: Choice;
  isCorrect: boolean;
};

// ─── Gemini PDF → Quiz Questions ─────────────────────────────

async function generateQuizFromPDF(
  base64Pdf: string,
  apiKey: string,
): Promise<QuizQuestion[]> {
  const prompt = [
    'You are a quiz generator. Read the attached PDF and create multiple-choice questions.',
    'Return ONLY a valid JSON array. No markdown, no explanation, no code fences.',
    'Use EXACTLY this shape for each item:',
    '{',
    '  "question": "...",',
    '  "choices": { "A": "...", "B": "...", "C": "...", "D": "..." },',
    '  "answer": "A",',
    '  "explanation": "Brief explanation of why this is correct."',
    '}',
    'Rules:',
    '- Generate exactly 10 questions',
    '- Questions must test real understanding, not just memorization',
    '- All 4 choices must be plausible (no obviously wrong answers)',
    '- The correct answer must be one of: A, B, C, or D',
    '- Explanation must be 1-2 sentences max',
    '- Vary which letter is correct — do NOT always use A',
    '- Cover different topics from the PDF, not just one section',
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: base64Pdf } },
            { text: prompt },
          ],
        }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
      }),
    },
  );

  if (!response.ok) {
    if (response.status === 429) throw new Error('Rate limit hit. Wait a minute and try again.');
    if (response.status === 403) throw new Error('Invalid API key. Check EXPO_PUBLIC_GEMINI_API_KEY.');
    if (response.status === 400) throw new Error('PDF rejected. Try a smaller or text-based PDF.');
    const body = await response.text();
    throw new Error(`Gemini error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json() as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    error?: { message?: string };
  };

  if (data.error?.message) throw new Error(`Gemini: ${data.error.message}`);

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  if (!rawText) {
    const reason = data?.candidates?.[0]?.finishReason ?? 'unknown';
    throw new Error(`Gemini returned empty response (finishReason: ${reason}).`);
  }

  return parseQuestions(rawText);
}

// ─── Parser ───────────────────────────────────────────────────

function parseQuestions(raw: string): QuizQuestion[] {
  const stripped  = raw.replace(/```json|```/gi, '').trim();
  const start     = stripped.indexOf('[');
  const end       = stripped.lastIndexOf(']');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not find JSON array in Gemini response. Retry or try another PDF.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    const normalized = stripped.slice(start, end + 1)
      .replace(/[""]/g, '"').replace(/['']/g, "'").replace(/\u0000/g, '');
    parsed = JSON.parse(normalized);
  }

  if (!Array.isArray(parsed)) throw new Error('Gemini response was not a JSON array.');

  const questions = (parsed as Record<string, unknown>[])
    .filter((item) => {
      const choices = item.choices as Record<string, string> | undefined;
      return (
        typeof item.question    === 'string' && item.question.trim() &&
        typeof item.answer      === 'string' && ['A','B','C','D'].includes(item.answer as string) &&
        typeof item.explanation === 'string' &&
        choices &&
        typeof choices.A === 'string' && choices.A.trim() &&
        typeof choices.B === 'string' && choices.B.trim() &&
        typeof choices.C === 'string' && choices.C.trim() &&
        typeof choices.D === 'string' && choices.D.trim()
      );
    })
    .map((item) => ({
      question:    (item.question    as string).trim(),
      answer:      (item.answer      as Choice),
      explanation: (item.explanation as string).trim(),
      choices: {
        A: ((item.choices as Record<string,string>).A).trim(),
        B: ((item.choices as Record<string,string>).B).trim(),
        C: ((item.choices as Record<string,string>).C).trim(),
        D: ((item.choices as Record<string,string>).D).trim(),
      },
    }));

  if (!questions.length) throw new Error('No valid questions parsed. Try a different PDF.');
  return questions;
}

// ─── Score helpers ────────────────────────────────────────────

function getScoreLabel(correct: number, total: number): string {
  const pct = correct / total;
  if (pct === 1)   return '🏆 Perfect score! Biscuit is doing backflips!';
  if (pct >= 0.8)  return '🌟 Outstanding! Biscuit is so proud!';
  if (pct >= 0.6)  return '👍 Good job! Biscuit gives you a paw bump.';
  if (pct >= 0.4)  return '📚 Keep studying! Biscuit believes in you.';
  return '🐾 Biscuit says: review the material and try again!';
}

function getChoiceColor(
  letter: Choice,
  selected: Choice | null,
  correct: Choice,
  revealed: boolean,
): string {
  if (!revealed) return '#CAE7FF'; // default blue
  if (letter === correct)  return '#C8F3D7'; // green = correct
  if (letter === selected && selected !== correct) return '#FFD1D1'; // red = wrong pick
  return '#F4EEFF'; // neutral
}

// ─── Component ────────────────────────────────────────────────

export default function QuizScreen() {
  const router = useRouter();
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

  // ── PDF / generation state ────────────────────────────────
  const [pdfName,      setPdfName]      = useState<string | null>(null);
  const [pdfBase64,    setPdfBase64]    = useState<string | null>(null);
  const [isReading,    setIsReading]    = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // ── Quiz state ────────────────────────────────────────────
  const [questions,    setQuestions]    = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers,      setAnswers]      = useState<Record<number, AnswerState>>({});
  const [revealed,     setRevealed]     = useState(false);
  const [quizDone,     setQuizDone]     = useState(false);

  const currentQ  = questions[currentIndex];
  const totalQ    = questions.length;
  const answered  = answers[currentIndex];
  const score     = Object.values(answers).filter((a) => a.isCorrect).length;
  const choices   = (['A', 'B', 'C', 'D'] as Choice[]);

  // ── Step 1: Pick PDF ──────────────────────────────────────
  const handlePickPdf = async () => {
    try {
      // Dynamically import to avoid version issues
      const DocumentPicker = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];

      if (asset.size && asset.size > 15 * 1024 * 1024) {
        Alert.alert('Large PDF', 'Over 15 MB — Gemini may reject it. Try a smaller file.');
      }

      setIsReading(true);
      setPdfName(null);
      setPdfBase64(null);
      setQuestions([]);
      setCurrentIndex(0);
      setAnswers({});
      setRevealed(false);
      setQuizDone(false);

      console.log('[Quiz] Reading PDF:', asset.uri);
      const fetchResponse = await fetch(asset.uri);
      const blob          = await fetchResponse.blob();
      const base64        = await new Promise<string>((resolve, reject) => {
        const reader    = new FileReader();
        reader.onload   = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror  = () => reject(new Error('FileReader failed'));
        reader.readAsDataURL(blob);
      });

      console.log('[Quiz] PDF read OK, length:', base64.length);
      setPdfName(asset.name ?? 'document.pdf');
      setPdfBase64(base64);
    } catch (error) {
      Alert.alert('PDF Error', error instanceof Error ? error.message : 'Could not read PDF.');
    } finally {
      setIsReading(false);
    }
  };

  // ── Step 2: Generate quiz ─────────────────────────────────
  const handleGenerate = async () => {
    if (!apiKey) {
      Alert.alert('Missing API key', 'Set EXPO_PUBLIC_GEMINI_API_KEY in your .env and restart.');
      return;
    }
    if (!pdfBase64) {
      Alert.alert('No PDF', 'Upload a PDF first.');
      return;
    }

    try {
      setIsGenerating(true);
      setQuestions([]);
      setCurrentIndex(0);
      setAnswers({});
      setRevealed(false);
      setQuizDone(false);

      console.log('[Quiz] Generating questions...');
      const generated = await generateQuizFromPDF(pdfBase64, apiKey);
      console.log('[Quiz] Generated', generated.length, 'questions');
      setQuestions(generated);
    } catch (error) {
      Alert.alert('Generation failed', error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Answer a question ─────────────────────────────────────
  const handleAnswer = (letter: Choice) => {
    if (answered) return; // already answered this question
    const isCorrect = letter === currentQ.answer;
    setAnswers((prev) => ({ ...prev, [currentIndex]: { selected: letter, isCorrect } }));
    setRevealed(true);
  };

  // ── Next question ─────────────────────────────────────────
  const handleNext = () => {
    if (currentIndex >= totalQ - 1) {
      setQuizDone(true);
    } else {
      setCurrentIndex((i) => i + 1);
      setRevealed(false);
    }
  };

  // ── Finish → back to hub (triggers XP reward) ─────────────
  const handleFinish = () => {
    if (quizDone) {
      AsyncStorage.setItem('pup_last_mode', 'quiz');
    }
    router.back();
  };

  // ── Retry same PDF ────────────────────────────────────────
  const handleRetry = () => {
    setQuestions([]);
    setCurrentIndex(0);
    setAnswers({});
    setRevealed(false);
    setQuizDone(false);
  };

  // ── UI ────────────────────────────────────────────────────
  return (
    <ClayScreen
      greeting="Battle Mode"
      title="Quiz Quest"
      subtitle="Upload a PDF and face Biscuit's ultimate challenge."
      avatarLabel="⚔️"
    >

      {/* ── Step 1: Upload PDF ─────────────────────────────── */}
      {!questions.length && !quizDone && (
        <>
          <ClaySectionHeader icon="upload-file" title="Step 1 · Choose your PDF" />
          <ClayCard style={[styles.card, styles.orange]}>
            <ThemedText style={styles.cardTitle}>Upload PDF</ThemedText>
            <ThemedText style={styles.cardText}>
              {isReading
                ? 'Reading file...'
                : pdfName
                  ? `✅ Ready: ${pdfName}`
                  : 'No PDF selected yet.'}
            </ThemedText>
            <Pressable onPress={handlePickPdf} disabled={isReading}>
              <ClayCard style={[styles.actionBtn, isReading ? styles.disabled : styles.blue]}>
                <ThemedText style={styles.actionLabel}>
                  {isReading ? 'Reading...' : pdfName ? 'Change PDF' : 'Choose PDF'}
                </ThemedText>
              </ClayCard>
            </Pressable>
          </ClayCard>

          {/* ── Step 2: Generate ──────────────────────────── */}
          <ClaySectionHeader icon="auto-awesome" title="Step 2 · Generate Quiz" />
          <ClayCard style={[styles.card, styles.purple]}>
            <ThemedText style={styles.cardTitle}>AI Question Generator</ThemedText>
            <ThemedText style={styles.cardText}>
              {isGenerating
                ? 'Gemini is crafting your battle questions...'
                : pdfBase64
                  ? 'PDF ready. Tap below to generate 10 questions.'
                  : 'Upload a PDF first.'}
            </ThemedText>
            <Pressable onPress={handleGenerate} disabled={isGenerating || !pdfBase64}>
              <ClayCard style={[styles.actionBtn, isGenerating || !pdfBase64 ? styles.disabled : styles.green]}>
                <ThemedText style={styles.actionLabel}>
                  {isGenerating ? 'Generating...' : 'Generate Quiz'}
                </ThemedText>
              </ClayCard>
            </Pressable>
          </ClayCard>
        </>
      )}

      {/* ── Quiz in progress ───────────────────────────────── */}
      {questions.length > 0 && !quizDone && currentQ && (
        <>
          {/* Progress header */}
          <View style={styles.progressRow}>
            <ClayPill>
              <ThemedText style={styles.pillText}>
                Question {currentIndex + 1} / {totalQ}
              </ThemedText>
            </ClayPill>
            <ClayPill style={styles.scorePill}>
              <ThemedText style={styles.pillText}>Score: {score}</ThemedText>
            </ClayPill>
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((currentIndex) / totalQ) * 100}%` }]} />
          </View>

          {/* Question card */}
          <ClayCard style={[styles.questionCard, styles.blue]}>
            <ThemedText style={styles.questionLabel}>Question {currentIndex + 1}</ThemedText>
            <ThemedText style={styles.questionText}>{currentQ.question}</ThemedText>
          </ClayCard>

          {/* Choice buttons */}
          <View style={styles.choicesGrid}>
            {choices.map((letter) => (
              <Pressable
                key={letter}
                onPress={() => handleAnswer(letter)}
                disabled={!!answered}
                style={styles.choiceBtn}
              >
                <ClayCard
                  style={[
                    styles.choiceCard,
                    { backgroundColor: getChoiceColor(letter, answered?.selected ?? null, currentQ.answer, revealed) },
                  ]}
                >
                  <View style={styles.choiceRow}>
                    <View style={styles.choiceBadge}>
                      <ThemedText style={styles.choiceLetter}>{letter}</ThemedText>
                    </View>
                    <ThemedText style={styles.choiceText}>{currentQ.choices[letter]}</ThemedText>
                    {revealed && letter === currentQ.answer && (
                      <ThemedText style={styles.choiceTick}>✅</ThemedText>
                    )}
                    {revealed && letter === answered?.selected && letter !== currentQ.answer && (
                      <ThemedText style={styles.choiceTick}>❌</ThemedText>
                    )}
                  </View>
                </ClayCard>
              </Pressable>
            ))}
          </View>

          {/* Explanation + Next */}
          {revealed && (
            <>
              <ClayCard style={[styles.card, answered?.isCorrect ? styles.green : styles.orange]}>
                <ThemedText style={styles.explainLabel}>
                  {answered?.isCorrect ? '✅ Correct!' : `❌ Wrong! Correct answer: ${currentQ.answer}`}
                </ThemedText>
                <ThemedText style={styles.explainText}>{currentQ.explanation}</ThemedText>
              </ClayCard>

              <Pressable onPress={handleNext}>
                <ClayCard style={[styles.actionBtn, styles.purple]}>
                  <ThemedText style={styles.actionLabel}>
                    {currentIndex >= totalQ - 1 ? '🏁 See Results' : 'Next Question →'}
                  </ThemedText>
                </ClayCard>
              </Pressable>
            </>
          )}
        </>
      )}

      {/* ── Results screen ─────────────────────────────────── */}
      {quizDone && (
        <>
          <ClayCard style={[styles.scoreCard, styles.purple]}>
            <ThemedText style={styles.scoreTitle}>Quiz Complete! ⚔️</ThemedText>
            <ThemedText style={styles.scoreBig}>{score} / {totalQ}</ThemedText>
            <ThemedText style={styles.scorePercent}>
              {Math.round((score / totalQ) * 100)}% correct
            </ThemedText>
            <ThemedText style={styles.scoreLabel}>{getScoreLabel(score, totalQ)}</ThemedText>
          </ClayCard>

          {/* Per-question recap */}
          <ClaySectionHeader icon="fact-check" title="Answer recap" />
          {questions.map((q, i) => {
            const ans = answers[i];
            return (
              <ClayCard
                key={i}
                style={[styles.recapCard, ans?.isCorrect ? styles.green : styles.orange]}
              >
                <View style={styles.recapHeader}>
                  <ThemedText style={styles.recapQ}>Q{i + 1}.</ThemedText>
                  <ThemedText style={styles.recapResult}>
                    {ans?.isCorrect ? '✅' : `❌ → ${q.answer}`}
                  </ThemedText>
                </View>
                <ThemedText style={styles.recapText}>{q.question}</ThemedText>
              </ClayCard>
            );
          })}

          <View style={styles.buttonRow}>
            <Pressable onPress={handleRetry} style={styles.flex}>
              <ClayCard style={[styles.actionBtn, styles.blue]}>
                <ThemedText style={styles.actionLabel}>🔄 Try Again</ThemedText>
              </ClayCard>
            </Pressable>
            <Pressable onPress={handleFinish} style={styles.flex}>
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
            {questions.length ? '✅ Finish Session · Feed Biscuit 🐾' : 'Go Back'}
          </ThemedText>
        </ClayCard>
      </Pressable>

    </ClayScreen>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const ink     = '#2D2250';
const textMid = '#6B5B8A';

const styles = StyleSheet.create({
  card:        { gap: 8 },
  cardTitle:   { fontSize: 16, fontWeight: '900', color: ink },
  cardText:    { fontSize: 13, color: textMid, lineHeight: 19 },

  actionBtn:   { alignItems: 'center', paddingVertical: 13 },
  actionLabel: { fontSize: 13, fontWeight: '800', color: ink },

  backRow:      { alignSelf: 'flex-start', marginBottom: 8 },
  backBtn:      { backgroundColor: 'rgba(255,255,255,0.8)' },
  backBtnLabel: { fontSize: 13, fontWeight: '900', color: ink },

  progressRow:   { flexDirection: 'row', gap: 8, alignItems: 'center' },
  scorePill:     { backgroundColor: 'rgba(255,255,255,0.55)' },
  pillText:      { fontSize: 11, fontWeight: '800', color: textMid },
  progressTrack: {
    width: '100%', height: 8, borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden',
  },
  progressFill:  { height: '100%', borderRadius: 4, backgroundColor: '#7A55B0' },

  questionCard:  { gap: 10 },
  questionLabel: { fontSize: 11, fontWeight: '800', color: textMid, textTransform: 'uppercase', letterSpacing: 0.6 },
  questionText:  { fontSize: 16, fontWeight: '700', color: ink, lineHeight: 24 },

  choicesGrid:  { gap: 8 },
  choiceBtn:    { width: '100%' },
  choiceCard:   { paddingVertical: 12, paddingHorizontal: 14 },
  choiceRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  choiceBadge:  {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  choiceLetter: { fontSize: 13, fontWeight: '900', color: ink },
  choiceText:   { flex: 1, fontSize: 13, color: ink, lineHeight: 19 },
  choiceTick:   { fontSize: 16 },

  explainLabel: { fontSize: 14, fontWeight: '900', color: ink },
  explainText:  { fontSize: 13, color: textMid, lineHeight: 19 },

  scoreCard:    { gap: 10, alignItems: 'center', paddingVertical: 24 },
  scoreTitle:   { fontSize: 20, fontWeight: '900', color: ink },
  scoreBig:     { fontSize: 52, fontWeight: '900', color: ink, lineHeight: 60 },
  scorePercent: { fontSize: 16, fontWeight: '800', color: textMid },
  scoreLabel:   { fontSize: 14, color: textMid, textAlign: 'center', lineHeight: 21 },

  recapCard:    { gap: 4 },
  recapHeader:  { flexDirection: 'row', justifyContent: 'space-between' },
  recapQ:       { fontSize: 12, fontWeight: '800', color: textMid },
  recapResult:  { fontSize: 12, fontWeight: '800', color: ink },
  recapText:    { fontSize: 12, color: textMid, lineHeight: 18 },

  buttonRow:    { flexDirection: 'row', gap: 10 },
  flex:         { flex: 1 },

  disabled:  { opacity: 0.45 },
  blue:      { backgroundColor: '#CAE7FF' },
  green:     { backgroundColor: '#C8F3D7' },
  orange:    { backgroundColor: '#FFE4B0' },
  purple:    { backgroundColor: '#DDD0FF' },
});
