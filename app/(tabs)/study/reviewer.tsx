/**
 * app/(tabs)/study/reviewer.tsx
 * ─────────────────────────────────────────────────────────────
 * Reviewer Quest — section-by-section PDF summary
 *
 * Changes:
 *  • Generated sections saved to AsyncStorage (persists across sessions)
 *  • Each section has edit mode: edit summary, add/edit/delete key points
 *  • Saved reviews listed below — user can reload a previous review
 *  • Back button always visible in header
 * ─────────────────────────────────────────────────────────────
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';

// ─── Types ────────────────────────────────────────────────────
type ReviewSection = {
  title:     string;
  summary:   string;
  keyPoints: string[];
};

type SavedReview = {
  id:       string;   // timestamp string
  pdfName:  string;
  sections: ReviewSection[];
  savedAt:  string;   // human-readable date
};

// ─── Storage key ─────────────────────────────────────────────
const REVIEWS_KEY = 'reviewer_saved_reviews';

// ─── Gemini PDF → Sections ────────────────────────────────────
async function generateReviewFromPDF(
  base64Pdf: string,
  apiKey: string,
): Promise<ReviewSection[]> {
  const prompt = [
    'You are a study reviewer. Read the attached PDF and generate a section-by-section summary.',
    'Return ONLY a valid JSON array. No markdown, no explanation, no code fences.',
    'Use EXACTLY this shape for each section:',
    '{ "title": "...", "summary": "2-4 sentences.", "keyPoints": ["point1","point2","point3"] }',
    'Rules:',
    '- Generate between 4 and 8 sections based on the PDF structure',
    '- Summary must be 2-4 sentences in plain simple English',
    '- keyPoints must be 3-5 items, each a single concise sentence',
    '- Cover the entire PDF — do not skip major topics',
    '- Do NOT add intro or closing text outside the JSON array',
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64Pdf } },
          { text: prompt },
        ]}],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
      }),
    },
  );

  if (!response.ok) {
    if (response.status === 429) throw new Error('Rate limit hit. Wait a minute and try again.');
    if (response.status === 403) throw new Error('Invalid API key. Check EXPO_PUBLIC_GEMINI_API_KEY.');
    if (response.status === 400) throw new Error('PDF rejected. Try a smaller or text-based PDF.');
    throw new Error(`Gemini error ${response.status}`);
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
  if (!rawText) throw new Error(`Gemini returned empty response.`);

  return parseSections(rawText);
}

function parseSections(raw: string): ReviewSection[] {
  const stripped = raw.replace(/```json|```/gi, '').trim();
  const start    = stripped.indexOf('[');
  const end      = stripped.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('No JSON array found in response.');

  let parsed: unknown;
  try { parsed = JSON.parse(stripped.slice(start, end + 1)); }
  catch {
    const n = stripped.slice(start, end + 1).replace(/[""]/g, '"').replace(/['']/g, "'");
    parsed = JSON.parse(n);
  }

  if (!Array.isArray(parsed)) throw new Error('Response was not an array.');

  return (parsed as Record<string, unknown>[])
    .filter((item) =>
      typeof item.title   === 'string' && item.title.trim() &&
      typeof item.summary === 'string' && item.summary.trim() &&
      Array.isArray(item.keyPoints),
    )
    .map((item) => ({
      title:     (item.title   as string).trim(),
      summary:   (item.summary as string).trim(),
      keyPoints: (item.keyPoints as unknown[])
        .filter((p) => typeof p === 'string')
        .map((p) => (p as string).trim()),
    }));
}

// ─── AsyncStorage helpers ─────────────────────────────────────
async function loadSavedReviews(): Promise<SavedReview[]> {
  try {
    const raw = await AsyncStorage.getItem(REVIEWS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveReview(review: SavedReview): Promise<void> {
  const existing = await loadSavedReviews();
  // Keep latest 10 reviews only
  const updated = [review, ...existing].slice(0, 10);
  await AsyncStorage.setItem(REVIEWS_KEY, JSON.stringify(updated));
}

async function deleteReview(id: string): Promise<SavedReview[]> {
  const existing = await loadSavedReviews();
  const updated  = existing.filter((r) => r.id !== id);
  await AsyncStorage.setItem(REVIEWS_KEY, JSON.stringify(updated));
  return updated;
}

// ─── Section colors ───────────────────────────────────────────
const COLORS = ['#DDD0FF','#C8F3D7','#CAE7FF','#FFE4B0','#FFF0A8','#FFD6EA'];

// ─── Section card component ───────────────────────────────────
function SectionCard({
  section,
  index,
  isRead,
  onToggleRead,
  onUpdate,
}: {
  section:      ReviewSection;
  index:        number;
  isRead:       boolean;
  onToggleRead: () => void;
  onUpdate:     (updated: ReviewSection) => void;
}) {
  const [expanded,    setExpanded]    = useState(true);
  const [editMode,    setEditMode]    = useState(false);
  const [editSummary, setEditSummary] = useState(section.summary);
  const [editPoints,  setEditPoints]  = useState<string[]>([...section.keyPoints]);
  const color = COLORS[index % COLORS.length];

  const handleSaveEdit = () => {
    const filtered = editPoints.filter((p) => p.trim().length > 0);
    onUpdate({ ...section, summary: editSummary.trim(), keyPoints: filtered });
    setEditMode(false);
  };

  const handleCancelEdit = () => {
    setEditSummary(section.summary);
    setEditPoints([...section.keyPoints]);
    setEditMode(false);
  };

  const updatePoint = (i: number, val: string) => {
    setEditPoints((prev) => prev.map((p, idx) => idx === i ? val : p));
  };

  const deletePoint = (i: number) => {
    setEditPoints((prev) => prev.filter((_, idx) => idx !== i));
  };

  const addPoint = () => {
    setEditPoints((prev) => [...prev, '']);
  };

  return (
    <ClayCard style={[styles.sectionCard, { backgroundColor: color }]}>

      {/* Header */}
      <Pressable onPress={() => setExpanded((v) => !v)}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <ThemedText style={styles.sectionIdx}>§{index + 1}</ThemedText>
            <ThemedText style={styles.sectionTitle}>{section.title}</ThemedText>
          </View>
          <View style={styles.sectionHeaderRight}>
            {isRead && (
              <ClayPill style={styles.readPill}>
                <ThemedText style={styles.readPillText}>✅ Read</ThemedText>
              </ClayPill>
            )}
            <ThemedText style={styles.chevron}>{expanded ? '▲' : '▼'}</ThemedText>
          </View>
        </View>
      </Pressable>

      {expanded && (
        <>
          {/* ── VIEW MODE ─────────────────────────────────── */}
          {!editMode && (
            <>
              <ThemedText style={styles.summaryText}>{section.summary}</ThemedText>

              <View style={styles.keyPointsBox}>
                <ThemedText style={styles.keyPointsLabel}>Key Points</ThemedText>
                {section.keyPoints.map((point, i) => (
                  <View key={i} style={styles.keyPointRow}>
                    <ThemedText style={styles.keyPointDot}>•</ThemedText>
                    <ThemedText style={styles.keyPointText}>{point}</ThemedText>
                  </View>
                ))}
              </View>

              <View style={styles.sectionActions}>
                <Pressable onPress={onToggleRead} style={styles.flex}>
                  <ClayCard style={[styles.actionBtn, isRead ? styles.readDone : styles.readDefault]}>
                    <ThemedText style={styles.actionLabel}>
                      {isRead ? '✅ Read' : 'Mark as Read'}
                    </ThemedText>
                  </ClayCard>
                </Pressable>
                <Pressable onPress={() => setEditMode(true)} style={styles.flex}>
                  <ClayCard style={[styles.actionBtn, styles.editBtn]}>
                    <ThemedText style={styles.actionLabel}>✏️ Edit</ThemedText>
                  </ClayCard>
                </Pressable>
              </View>
            </>
          )}

          {/* ── EDIT MODE ─────────────────────────────────── */}
          {editMode && (
            <>
              <ThemedText style={styles.editLabel}>Summary</ThemedText>
              <TextInput
                value={editSummary}
                onChangeText={setEditSummary}
                multiline
                style={styles.textArea}
                placeholder="Edit summary..."
                placeholderTextColor="#A899C8"
              />

              <ThemedText style={styles.editLabel}>Key Points</ThemedText>
              {editPoints.map((point, i) => (
                <View key={i} style={styles.editPointRow}>
                  <TextInput
                    value={point}
                    onChangeText={(val) => updatePoint(i, val)}
                    style={styles.editPointInput}
                    placeholder={`Point ${i + 1}…`}
                    placeholderTextColor="#A899C8"
                  />
                  <TouchableOpacity onPress={() => deletePoint(i)} style={styles.deleteBtn}>
                    <ThemedText style={styles.deleteBtnText}>✕</ThemedText>
                  </TouchableOpacity>
                </View>
              ))}

              <Pressable onPress={addPoint}>
                <ClayCard style={[styles.actionBtn, styles.addPointBtn]}>
                  <ThemedText style={styles.actionLabel}>+ Add Point</ThemedText>
                </ClayCard>
              </Pressable>

              <View style={styles.sectionActions}>
                <Pressable onPress={handleSaveEdit} style={styles.flex}>
                  <ClayCard style={[styles.actionBtn, styles.saveBtn]}>
                    <ThemedText style={styles.actionLabel}>💾 Save</ThemedText>
                  </ClayCard>
                </Pressable>
                <Pressable onPress={handleCancelEdit} style={styles.flex}>
                  <ClayCard style={[styles.actionBtn, styles.cancelBtn]}>
                    <ThemedText style={styles.actionLabel}>Cancel</ThemedText>
                  </ClayCard>
                </Pressable>
              </View>
            </>
          )}
        </>
      )}
    </ClayCard>
  );
}

// ─── Main Component ───────────────────────────────────────────
export default function ReviewerScreen() {
  const router = useRouter();
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

  const [pdfName,       setPdfName]       = useState<string | null>(null);
  const [pdfBase64,     setPdfBase64]     = useState<string | null>(null);
  const [isReading,     setIsReading]     = useState(false);
  const [isGenerating,  setIsGenerating]  = useState(false);
  const [sections,      setSections]      = useState<ReviewSection[]>([]);
  const [readSet,       setReadSet]       = useState<Set<number>>(new Set());
  const [savedReviews,  setSavedReviews]  = useState<SavedReview[]>([]);
  const [showSaved,     setShowSaved]     = useState(false);
  const [isSaving,      setIsSaving]      = useState(false);

  const totalSections = sections.length;
  const readCount     = readSet.size;
  const allRead       = totalSections > 0 && readCount === totalSections;

  // Load saved reviews on mount
  useState(() => {
    loadSavedReviews().then(setSavedReviews);
  });

  // ── Pick PDF ──────────────────────────────────────────────
  const handlePickPdf = async () => {
    try {
      const DocumentPicker = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'], copyToCacheDirectory: true, multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];

      if (asset.size && asset.size > 15 * 1024 * 1024) {
        Alert.alert('Large PDF', 'Over 15 MB — Gemini may reject it.');
      }

      setIsReading(true);
      setPdfName(null); setPdfBase64(null);
      setSections([]); setReadSet(new Set());

      const fetchRes = await fetch(asset.uri);
      const blob     = await fetchRes.blob();
      const base64   = await new Promise<string>((resolve, reject) => {
        const reader   = new FileReader();
        reader.onload  = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsDataURL(blob);
      });

      setPdfName(asset.name ?? 'document.pdf');
      setPdfBase64(base64);
    } catch (error) {
      Alert.alert('PDF Error', error instanceof Error ? error.message : 'Could not read PDF.');
    } finally {
      setIsReading(false);
    }
  };

  // ── Generate ──────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!apiKey) { Alert.alert('Missing API key', 'Set EXPO_PUBLIC_GEMINI_API_KEY in .env.'); return; }
    if (!pdfBase64) { Alert.alert('No PDF', 'Upload a PDF first.'); return; }

    try {
      setIsGenerating(true);
      setSections([]); setReadSet(new Set());
      const generated = await generateReviewFromPDF(pdfBase64, apiKey);
      setSections(generated);
    } catch (error) {
      Alert.alert('Generation failed', error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Save review ───────────────────────────────────────────
  const handleSave = async () => {
    if (!sections.length) return;
    setIsSaving(true);
    const review: SavedReview = {
      id:      Date.now().toString(),
      pdfName: pdfName ?? 'Untitled PDF',
      sections,
      savedAt: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
    };
    await saveReview(review);
    const updated = await loadSavedReviews();
    setSavedReviews(updated);
    setIsSaving(false);
    Alert.alert('Saved! 💾', 'Your review has been saved and can be reloaded anytime.');
  };

  // ── Load saved ────────────────────────────────────────────
  const handleLoadReview = (review: SavedReview) => {
    setSections(review.sections);
    setPdfName(review.pdfName);
    setPdfBase64(null);
    setReadSet(new Set());
    setShowSaved(false);
  };

  // ── Delete saved ──────────────────────────────────────────
  const handleDeleteReview = async (id: string) => {
    Alert.alert('Delete review?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const updated = await deleteReview(id);
        setSavedReviews(updated);
      }},
    ]);
  };

  // ── Update section (from edit mode) ──────────────────────
  const updateSection = (index: number, updated: ReviewSection) => {
    setSections((prev) => prev.map((s, i) => i === index ? updated : s));
  };

  const toggleRead = (index: number) => {
    setReadSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleFinish = () => {
    if (sections.length > 0) {
      AsyncStorage.setItem('pup_last_mode', 'reviewer');
    }
    router.back();
  };

  return (
    <ClayScreen
      greeting="Read Together"
      title="Reviewer Quest"
      subtitle="Upload a PDF, study each section, and save your notes."
      avatarLabel="📖"
    >

      {/* ── Saved reviews toggle ──────────────────────────── */}
      {savedReviews.length > 0 && (
        <Pressable onPress={() => setShowSaved((v) => !v)}>
          <ClayCard style={[styles.savedToggle, styles.purple]}>
            <ThemedText style={styles.savedToggleText}>
              {showSaved ? '▲ Hide' : '▼ Load'} Saved Reviews ({savedReviews.length})
            </ThemedText>
          </ClayCard>
        </Pressable>
      )}

      {showSaved && (
        <>
          <ClaySectionHeader icon="bookmark" title="Your saved reviews" />
          {savedReviews.map((review) => (
            <ClayCard key={review.id} style={[styles.savedCard, styles.blue]}>
              <View style={styles.savedCardHeader}>
                <View style={styles.savedCardInfo}>
                  <ThemedText style={styles.savedCardName}>{review.pdfName}</ThemedText>
                  <ThemedText style={styles.savedCardDate}>
                    {review.savedAt} · {review.sections.length} sections
                  </ThemedText>
                </View>
                <View style={styles.savedCardActions}>
                  <TouchableOpacity
                    onPress={() => handleLoadReview(review)}
                    style={[styles.savedActionBtn, styles.loadBtn]}
                  >
                    <ThemedText style={styles.savedActionText}>Load</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteReview(review.id)}
                    style={[styles.savedActionBtn, styles.deleteReviewBtn]}
                  >
                    <ThemedText style={styles.savedActionText}>✕</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            </ClayCard>
          ))}
        </>
      )}

      {/* ── Step 1: Upload PDF ────────────────────────────── */}
      <ClaySectionHeader icon="upload-file" title="Step 1 · Choose your PDF" />
      <ClayCard style={[styles.card, styles.purple]}>
        <ThemedText style={styles.cardTitle}>Upload PDF</ThemedText>
        <ThemedText style={styles.cardText}>
          {isReading ? 'Reading file...' : pdfName ? `✅ Ready: ${pdfName}` : 'No PDF selected yet.'}
        </ThemedText>
        <Pressable onPress={handlePickPdf} disabled={isReading}>
          <ClayCard style={[styles.actionBtn, isReading ? styles.disabled : styles.blue]}>
            <ThemedText style={styles.actionLabel}>
              {isReading ? 'Reading...' : pdfName ? 'Change PDF' : 'Choose PDF'}
            </ThemedText>
          </ClayCard>
        </Pressable>
      </ClayCard>

      {/* ── Step 2: Generate ─────────────────────────────── */}
      <ClaySectionHeader icon="auto-awesome" title="Step 2 · Generate Summary" />
      <ClayCard style={[styles.card, styles.green]}>
        <ThemedText style={styles.cardTitle}>AI Section Reviewer</ThemedText>
        <ThemedText style={styles.cardText}>
          {isGenerating
            ? 'Biscuit is reading your PDF section by section...'
            : sections.length
              ? `✅ ${sections.length} sections ready to review.`
              : pdfBase64
                ? 'PDF loaded. Tap below to generate.'
                : 'Upload a PDF first.'}
        </ThemedText>
        <Pressable onPress={handleGenerate} disabled={isGenerating || !pdfBase64}>
          <ClayCard style={[styles.actionBtn, isGenerating || !pdfBase64 ? styles.disabled : styles.orange]}>
            <ThemedText style={styles.actionLabel}>
              {isGenerating ? 'Generating...' : 'Generate Review'}
            </ThemedText>
          </ClayCard>
        </Pressable>
      </ClayCard>

      {/* ── Progress + Save ───────────────────────────────── */}
      {sections.length > 0 && (
        <>
          <View style={styles.progressHeader}>
            <ClaySectionHeader icon="menu-book" title="Your review" />
            <ClayPill>
              <ThemedText style={styles.pillText}>{readCount} / {totalSections} read</ThemedText>
            </ClayPill>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${totalSections > 0 ? (readCount / totalSections) * 100 : 0}%` }]} />
          </View>

          {/* Save button */}
          <Pressable onPress={handleSave} disabled={isSaving}>
            <ClayCard style={[styles.actionBtn, isSaving ? styles.disabled : styles.yellow]}>
              <ThemedText style={styles.actionLabel}>
                {isSaving ? 'Saving...' : '💾 Save This Review'}
              </ThemedText>
            </ClayCard>
          </Pressable>
        </>
      )}

      {/* ── Section cards ────────────────────────────────── */}
      {sections.map((section, i) => (
        <SectionCard
          key={i}
          section={section}
          index={i}
          isRead={readSet.has(i)}
          onToggleRead={() => toggleRead(i)}
          onUpdate={(updated) => updateSection(i, updated)}
        />
      ))}

      {/* ── All read message ──────────────────────────────── */}
      {allRead && (
        <ClayCard style={[styles.card, styles.purple]}>
          <ThemedText style={styles.biscuitEmoji}>🐾</ThemedText>
          <ThemedText style={styles.biscuitText}>
            Biscuit curled up happily. You reviewed every section!
          </ThemedText>
          <ThemedText style={styles.rewardText}>+8 XP · Hunger +20</ThemedText>
        </ClayCard>
      )}

      {/* ── Finish Session ──────────────────────────────────── */}
      <Pressable onPress={handleFinish}>
        <ClayCard style={[styles.actionBtn, styles.purple]}>
          <ThemedText style={styles.actionLabel}>
            {sections.length ? '✅ Finish Session · Feed Biscuit 🐾' : 'Go Back'}
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
  card:      { gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: ink },
  cardText:  { fontSize: 13, color: textMid, lineHeight: 19 },

  actionBtn:   { alignItems: 'center', paddingVertical: 13 },
  actionLabel: { fontSize: 13, fontWeight: '800', color: ink },

  // Saved reviews
  savedToggle:     { alignItems: 'center', paddingVertical: 11 },
  savedToggleText: { fontSize: 13, fontWeight: '800', color: ink },
  savedCard:       { gap: 6 },
  savedCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  savedCardInfo:   { flex: 1, gap: 2 },
  savedCardName:   { fontSize: 14, fontWeight: '900', color: ink },
  savedCardDate:   { fontSize: 12, color: textMid },
  savedCardActions:{ flexDirection: 'row', gap: 6 },
  savedActionBtn:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  savedActionText: { fontSize: 12, fontWeight: '800', color: ink },
  loadBtn:         { backgroundColor: 'rgba(255,255,255,0.6)' },
  deleteReviewBtn: { backgroundColor: '#FFD1D1' },

  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pillText:       { fontSize: 11, fontWeight: '800', color: textMid },
  progressTrack:  { height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden', marginTop: -8 },
  progressFill:   { height: '100%', borderRadius: 4, backgroundColor: '#7A55B0' },

  // Section card
  sectionCard:       { gap: 10 },
  sectionHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sectionTitleRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  sectionHeaderRight:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionIdx:        { fontSize: 11, fontWeight: '900', color: textMid },
  sectionTitle:      { fontSize: 15, fontWeight: '900', color: ink, flex: 1 },
  chevron:           { fontSize: 12, color: textMid },
  readPill:          { backgroundColor: 'rgba(255,255,255,0.7)' },
  readPillText:      { fontSize: 10, fontWeight: '800', color: '#2D5A1B' },

  summaryText: { fontSize: 13, color: textMid, lineHeight: 20 },
  keyPointsBox: { gap: 6, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 12, padding: 12 },
  keyPointsLabel: { fontSize: 11, fontWeight: '800', color: textMid, textTransform: 'uppercase', letterSpacing: 0.6 },
  keyPointRow:  { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  keyPointDot:  { fontSize: 13, color: textMid, marginTop: 1 },
  keyPointText: { fontSize: 13, color: ink, lineHeight: 19, flex: 1 },

  sectionActions: { flexDirection: 'row', gap: 8 },
  flex:           { flex: 1 },
  readDefault:    { backgroundColor: 'rgba(255,255,255,0.5)' },
  readDone:       { backgroundColor: 'rgba(200,243,215,0.8)' },
  editBtn:        { backgroundColor: 'rgba(255,255,255,0.5)' },

  // Edit mode
  editLabel:      { fontSize: 11, fontWeight: '800', color: textMid, textTransform: 'uppercase', letterSpacing: 0.5 },
  textArea: {
    backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 12,
    padding: 10, fontSize: 13, color: ink, lineHeight: 20,
    minHeight: 80, textAlignVertical: 'top',
  },
  editPointRow:   { flexDirection: 'row', gap: 8, alignItems: 'center' },
  editPointInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 10, padding: 10, fontSize: 13, color: ink,
  },
  deleteBtn:     { width: 32, height: 32, borderRadius: 8, backgroundColor: '#FFD1D1', alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { fontSize: 12, fontWeight: '900', color: '#A03030' },
  addPointBtn:   { backgroundColor: 'rgba(255,255,255,0.4)' },
  saveBtn:       { backgroundColor: 'rgba(200,243,215,0.8)' },
  cancelBtn:     { backgroundColor: 'rgba(255,255,255,0.4)' },

  // Completion
  biscuitEmoji: { fontSize: 28, textAlign: 'center' },
  biscuitText:  { fontSize: 14, color: ink, lineHeight: 21, textAlign: 'center' },
  rewardText:   { fontSize: 13, fontWeight: '800', color: '#7A55B0', textAlign: 'center' },

  disabled: { opacity: 0.45 },
  blue:     { backgroundColor: '#CAE7FF' },
  green:    { backgroundColor: '#C8F3D7' },
  orange:   { backgroundColor: '#FFE4B0' },
  purple:   { backgroundColor: '#DDD0FF' },
  yellow:   { backgroundColor: '#FFF0A8' },
});
