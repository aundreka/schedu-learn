/**
 * test-gemini.js
 * ─────────────────────────────────────────────────────────────
 * Standalone test — run with Node.js to verify the full
 * Gemini PDF → flashcard pipeline works before touching the app.
 *
 * Usage:
 *   1. Put this file in your project root
 *   2. Put any small PDF in the same folder, name it "test.pdf"
 *   3. Run: node test-gemini.js
 * ─────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

const API_KEY  = 'AIzaSyBzRgAe5pUcIaQs_OjX1Bp3KLDUur9pbfU';
const MODEL    = 'gemini-2.5-flash';
const PDF_PATH = path.join(__dirname, 'test.pdf');

async function main() {
  // ── 1. Read PDF ─────────────────────────────────────────────
  if (!fs.existsSync(PDF_PATH)) {
    console.error('❌  test.pdf not found. Put a PDF named "test.pdf" in the same folder as this script.');
    process.exit(1);
  }

  const pdfBuffer = fs.readFileSync(PDF_PATH);
  const base64Pdf = pdfBuffer.toString('base64');
  const sizeMB    = (pdfBuffer.length / 1024 / 1024).toFixed(2);
  console.log(`✅  PDF loaded: ${sizeMB} MB`);

  // ── 2. Call Gemini ──────────────────────────────────────────
  console.log(`🔄  Calling ${MODEL}...`);

  const prompt = [
    'You are a study assistant. Read the attached PDF and generate flashcards.',
    'Return ONLY a valid JSON array. No markdown, no explanation, no code fences.',
    'Use exactly this shape: [{"question": "...", "answer": "..."}]',
    'Rules:',
    '- Generate between 5 and 10 cards (keep it short for this test)',
    '- Questions must test real understanding',
    '- Answers must be concise (1-2 sentences max)',
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: base64Pdf } },
            { text: prompt },
          ],
        }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
      }),
    }
  );

  console.log(`📡  HTTP status: ${response.status}`);

  if (!response.ok) {
    const errText = await response.text();
    console.error('❌  Gemini error:', errText);
    process.exit(1);
  }

  // ── 3. Parse response ───────────────────────────────────────
  const data    = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  if (!rawText) {
    console.error('❌  Gemini returned empty text.');
    console.error('Full response:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('\n📄  Raw Gemini output:\n');
  console.log(rawText);

  // ── 4. Parse JSON ───────────────────────────────────────────
  try {
    const stripped = rawText.replace(/```json|```/gi, '').trim();
    const start    = stripped.indexOf('[');
    const end      = stripped.lastIndexOf(']');
    const jsonSlice = stripped.slice(start, end + 1);
    const cards    = JSON.parse(jsonSlice);

    console.log(`\n✅  Successfully parsed ${cards.length} flashcards:\n`);
    cards.forEach((card, i) => {
      console.log(`Card ${i + 1}:`);
      console.log(`  Q: ${card.question}`);
      console.log(`  A: ${card.answer}`);
      console.log('');
    });
  } catch (err) {
    console.error('❌  JSON parse failed:', err.message);
    console.error('Raw text was:', rawText);
  }
}

main().catch((err) => {
  console.error('❌  Unexpected error:', err);
  process.exit(1);
});
