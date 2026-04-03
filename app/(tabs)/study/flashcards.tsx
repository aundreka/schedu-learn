/**
 * app/(tabs)/study/flashcards.tsx
 * ─────────────────────────────────────────────────────────────
 * Flashcards Quest — "Train Memory"
 *
 * Flow:
 *  1. User picks a PDF via expo-document-picker
 *  2. File is read as base64 via expo-file-system
 *  3. Sent to Gemini 2.5 Flash as native inlineData (PDF-aware)
 *  4. Gemini returns JSON flashcards → parsed + displayed
 *  5. User flips through cards, taps "Finish Session" to go back
 *     (index.tsx detects the return and awards XP via AsyncStorage flag)
 *
 * Why Gemini only (no OpenRouter):
 *  - Gemini 2.5 Flash natively reads PDFs as binary inlineData
 *  - OpenRouter free models don't support binary PDF input at all
 *  - Sending base64 PDF as plain text to OpenRouter = token limit errors
 * ─────────────────────────────────────────────────────────────
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';

// ─── Types ────────────────────────────────────────────────────

type Flashcard = {
  question: string;
  answer: string;
};

// ─── Gemini PDF → Flashcards ──────────────────────────────────

/**
 * Sends the PDF (as base64) to Gemini 2.5 Flash using the
 * native inlineData format. Gemini reads the actual PDF content
 * directly — no text pre-extraction needed.
 */
async function generateFlashcardsFromPDF(
  base64Pdf: string,
  apiKey: string,
): Promise<Flashcard[]> {
  const prompt = [
    'You are a study assistant. Read the attached PDF and generate flashcards.',
    'Return ONLY a valid JSON array. No markdown, no explanation, no code fences.',
    'Use exactly this shape: [{"question": "...", "answer": "..."}]',
    'Rules:',
    '- Generate between 10 and 20 cards',
    '- Questions must test real understanding, not just recall',
    '- Answers must be concise (1–3 sentences max)',
    '- Cover key definitions, concepts, comparisons, and important facts',
    '- Do NOT include card numbers or labels in the text',
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              // ← This is the key: native PDF inlineData, not text
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: base64Pdf,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.2, // low temp = more consistent JSON output
        },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();

    // Give a helpful error message for the most common failure cases
    if (response.status === 400) {
      throw new Error(
        'Gemini rejected the PDF. The file may be too large (>20MB) or password-protected. Try a smaller PDF.',
      );
    }
    if (response.status === 403) {
      throw new Error(
        'Gemini API key is invalid or not enabled. Check EXPO_PUBLIC_GEMINI_API_KEY in your .env file.',
      );
    }
    if (response.status === 429) {
      throw new Error(
        'Gemini free tier rate limit hit. Wait a minute and try again.',
      );
    }

    throw new Error(`Gemini error ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    error?: { message?: string };
  };

  // Surface Gemini-level errors (e.g. safety blocks)
  if (data.error?.message) {
    throw new Error(`Gemini: ${data.error.message}`);
  }

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

  if (!rawText) {
    const reason = data?.candidates?.[0]?.finishReason ?? 'unknown';
    throw new Error(
      `Gemini returned an empty response (finishReason: ${reason}). ` +
      'The PDF may contain only images or be unreadable.',
    );
  }

  return parseFlashcards(rawText);
}

// ─── JSON Parser ──────────────────────────────────────────────

/**
 * Robustly extracts a JSON array from Gemini's response.
 * Handles cases where the model wraps output in markdown fences
 * or adds extra explanation text before/after the JSON.
 */
function parseFlashcards(raw: string): Flashcard[] {
  // Strip markdown code fences if present
  const stripped = raw.replace(/```json|```/gi, '').trim();

  // Find the outermost [ ... ] array bounds
  const start = stripped.indexOf('[');
  const end   = stripped.lastIndexOf(']');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      'Could not find a JSON array in Gemini\'s response. Try a different PDF or retry.',
    );
  }

  const jsonSlice = stripped.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    // Normalize fancy quotes some models occasionally output
    const normalized = jsonSlice
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/\u0000/g, '');
    parsed = JSON.parse(normalized);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Gemini returned JSON but it was not an array of flashcards.');
  }

  const cards = (parsed as Array<Record<string, unknown>>)
    .filter(
      (item) =>
        typeof item.question === 'string' &&
        typeof item.answer   === 'string' &&
        item.question.trim() &&
        item.answer.trim(),
    )
    .map((item) => ({
      question: (item.question as string).trim(),
      answer:   (item.answer   as string).trim(),
    }));

  if (!cards.length) {
    throw new Error(
      'Gemini responded with an empty flashcard list. The PDF might not have enough readable text.',
    );
  }

  return cards;
}

// ─── Component ────────────────────────────────────────────────

export default function FlashcardsScreen() {
  const router    = useRouter();
  const apiKey    = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

  // ── File state ───────────────────────────────────────────────
  const [pdfName,      setPdfName]      = useState<string | null>(null);
  const [pdfBase64,    setPdfBase64]    = useState<string | null>(null);
  const [isReading,    setIsReading]    = useState(false);

  // ── Generation state ─────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);

  // ── Card state ───────────────────────────────────────────────
  const [cards,        setCards]        = useState<Flashcard[]>([]);
  const [activeIndex,  setActiveIndex]  = useState(0);
  const [showAnswer,   setShowAnswer]   = useState(false);

  const activeCard   = cards[activeIndex];
  const isFirst      = activeIndex === 0;
  const isLast       = activeIndex >= cards.length - 1;
  const progressText = useMemo(() => {
    if (!cards.length) return 'No cards yet';
    return `${activeIndex + 1} / ${cards.length}`;
  }, [activeIndex, cards.length]);

  // ── Step 1: Pick PDF ─────────────────────────────────────────
  const handlePickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets.length) return;

      const asset = result.assets[0];

      // Guard: warn if file is very large (>15 MB = likely to hit free tier limits)
      if (asset.size && asset.size > 15 * 1024 * 1024) {
        Alert.alert(
          'Large PDF',
          'This PDF is over 15 MB. Gemini free tier may reject it. Try a smaller file for best results.',
        );
      }

      setIsReading(true);
      setPdfName(null);
      setPdfBase64(null);
      setCards([]);
      setActiveIndex(0);
      setShowAnswer(false);

      // Convert file URI → base64 using fetch + blob
      // This works on ALL Expo versions without any FileSystem import
      console.log('[Flashcards] Reading file at URI:', asset.uri);
      const fetchResponse = await fetch(asset.uri);
      const blob = await fetchResponse.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => {
          // result is "data:application/pdf;base64,XXXXX" — strip the prefix
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = () => reject(new Error('FileReader failed to read the PDF.'));
        reader.readAsDataURL(blob);
      });
      console.log('[Flashcards] File read OK, base64 length:', base64?.length ?? 0);

      if (!base64 || base64.length === 0) {
        throw new Error('File was read but returned empty. Try a different PDF.');
      }

      setPdfName(asset.name ?? 'document.pdf');
      setPdfBase64(base64);
    } catch (error) {
      Alert.alert(
        'PDF upload failed',
        error instanceof Error ? error.message : 'Could not read the PDF.',
      );
    } finally {
      setIsReading(false);
    }
  };

  // ── Step 2: Generate flashcards ──────────────────────────────
  const handleGenerate = async () => {
    if (!apiKey) {
      Alert.alert(
        'Missing API key',
        'Add EXPO_PUBLIC_GEMINI_API_KEY to your .env file and restart Expo.',
      );
      return;
    }

    if (!pdfBase64) {
      Alert.alert('No PDF loaded', 'Pick a PDF first before generating.');
      return;
    }

    try {
      setIsGenerating(true);
      setCards([]);
      setActiveIndex(0);
      setShowAnswer(false);

      console.log('[Flashcards] Starting generation, base64 length:', pdfBase64.length);
      const generated = await generateFlashcardsFromPDF(pdfBase64, apiKey);
      console.log('[Flashcards] Generated', generated.length, 'cards');
      setCards(generated);
    } catch (error) {
      Alert.alert(
        'Generation failed',
        error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Navigation ───────────────────────────────────────────────
  const goNext = () => {
    setActiveIndex((i) => Math.min(cards.length - 1, i + 1));
    setShowAnswer(false);
  };

  const goPrev = () => {
    setActiveIndex((i) => Math.max(0, i - 1));
    setShowAnswer(false);
  };

  // "Finish Session" → router.back() triggers useFocusEffect
  // in index.tsx which reads the pup_last_mode flag and awards XP
  const handleFinish = () => {
    if (cards.length > 0) {
      AsyncStorage.setItem('pup_last_mode', 'flashcards');
    }
    router.back();
  };

  // ── UI ───────────────────────────────────────────────────────
  return (
    <ClayScreen
      greeting="Train Memory"
      title="Flashcards Quest"
      subtitle="Upload a PDF and let Gemini build your study deck."
      avatarLabel="🧠"
    >

      {/* ── Step 1: Upload ──────────────────────────────────── */}
      <ClaySectionHeader icon="upload-file" title="Step 1 · Choose your PDF" />
      <ClayCard style={[styles.card, styles.orange]}>
        <ThemedText style={styles.cardTitle}>Upload PDF</ThemedText>
        <ThemedText style={styles.cardText}>
          {isReading
            ? 'Reading file...'
            : pdfName
              ? `✅ Ready: ${pdfName}`
              : 'No PDF selected yet. Tap below to choose one.'}
        </ThemedText>
        <Pressable onPress={handlePickPdf} disabled={isReading}>
          <ClayCard style={[styles.actionBtn, isReading ? styles.disabled : styles.blue]}>
            <ThemedText style={styles.actionBtnLabel}>
              {isReading ? 'Reading...' : pdfName ? 'Change PDF' : 'Choose PDF'}
            </ThemedText>
          </ClayCard>
        </Pressable>
      </ClayCard>

      {/* ── Step 2: Generate ────────────────────────────────── */}
      <ClaySectionHeader icon="auto-awesome" title="Step 2 · Generate with Gemini" />
      <ClayCard style={[styles.card, styles.green]}>
        <ThemedText style={styles.cardTitle}>AI Flashcard Generation</ThemedText>
        <ThemedText style={styles.cardText}>
          {isGenerating
            ? 'Gemini is reading your PDF and building your deck...'
            : cards.length
              ? `✅ ${cards.length} cards generated! Scroll down to review.`
              : pdfBase64
                ? 'PDF loaded. Tap below to generate your flashcards.'
                : 'Upload a PDF first, then generate.'}
        </ThemedText>

        <Pressable
          onPress={handleGenerate}
          disabled={isGenerating || !pdfBase64}
        >
          <ClayCard
            style={[
              styles.actionBtn,
              isGenerating || !pdfBase64 ? styles.disabled : styles.purple,
            ]}
          >
            <ThemedText style={styles.actionBtnLabel}>
              {isGenerating ? 'Generating...' : 'Generate Flashcards'}
            </ThemedText>
          </ClayCard>
        </Pressable>
      </ClayCard>

      {/* ── Step 3: Review deck ─────────────────────────────── */}
      {cards.length > 0 && (
        <>
          <ClaySectionHeader icon="style" title="Step 3 · Review your deck" />

          {/* Progress pill */}
          <View style={styles.progressRow}>
            <ClayPill>
              <ThemedText style={styles.pillText}>
                Card {progressText}
              </ThemedText>
            </ClayPill>
            <ClayPill style={styles.totalPill}>
              <ThemedText style={styles.pillText}>
                {cards.length} cards total
              </ThemedText>
            </ClayPill>
          </View>

          {/* Flashcard face */}
          <ClayCard style={[styles.flashcard, styles.blue]}>
            <ThemedText style={styles.faceLabel}>Question</ThemedText>
            <ThemedText style={styles.faceText}>{activeCard.question}</ThemedText>

            {showAnswer && (
              <>
                <View style={styles.divider} />
                <ThemedText style={styles.faceLabel}>Answer</ThemedText>
                <ThemedText style={styles.faceText}>{activeCard.answer}</ThemedText>
              </>
            )}

            <Pressable onPress={() => setShowAnswer((v) => !v)}>
              <ClayCard style={[styles.actionBtn, styles.orange]}>
                <ThemedText style={styles.actionBtnLabel}>
                  {showAnswer ? 'Hide Answer' : 'Reveal Answer'}
                </ThemedText>
              </ClayCard>
            </Pressable>
          </ClayCard>

          {/* Prev / Next */}
          <View style={styles.navRow}>
            <Pressable onPress={goPrev} disabled={isFirst} style={styles.navBtn}>
              <ClayCard style={[styles.actionBtn, isFirst ? styles.disabled : styles.green]}>
                <ThemedText style={styles.actionBtnLabel}>← Previous</ThemedText>
              </ClayCard>
            </Pressable>
            <Pressable onPress={goNext} disabled={isLast} style={styles.navBtn}>
              <ClayCard style={[styles.actionBtn, isLast ? styles.disabled : styles.purple]}>
                <ThemedText style={styles.actionBtnLabel}>Next →</ThemedText>
              </ClayCard>
            </Pressable>
          </View>
        </>
      )}

      {/* ── Finish Session ──────────────────────────────────── */}
      <Pressable onPress={handleFinish}>
        <ClayCard style={[styles.actionBtn, styles.purple]}>
          <ThemedText style={styles.actionBtnLabel}>
            {cards.length ? '✅ Finish Session · Feed Biscuit 🐾' : 'Go Back'}
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
  card:           { gap: 10 },
  cardTitle:      { fontSize: 16, fontWeight: '900', color: ink },
  cardText:       { fontSize: 13, color: textMid, lineHeight: 19 },

  actionBtn:      { alignItems: 'center', paddingVertical: 13 },
  actionBtnLabel: { fontSize: 13, fontWeight: '800', color: ink },

  noteBox: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 12,
    padding: 10,
  },
  noteText: { fontSize: 12, color: textMid, lineHeight: 17 },

  progressRow:  { flexDirection: 'row', gap: 8 },
  totalPill:    { backgroundColor: 'rgba(255,255,255,0.55)' },
  pillText:     { fontSize: 11, fontWeight: '800', color: textMid },

  flashcard:    { gap: 12 },
  faceLabel: {
    fontSize: 11, fontWeight: '800', color: textMid,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  faceText:     { fontSize: 15, color: ink, lineHeight: 22 },
  divider: {
    height: 1,
    backgroundColor: 'rgba(45,34,80,0.1)',
    marginVertical: 4,
  },

  navRow:       { flexDirection: 'row', gap: 10 },
  navBtn:       { flex: 1 },

  disabled:     { opacity: 0.45 },
  orange:       { backgroundColor: '#FFE4B0' },
  green:        { backgroundColor: '#C8F3D7' },
  blue:         { backgroundColor: '#CAE7FF' },
  purple:       { backgroundColor: '#DDD0FF' },
});
