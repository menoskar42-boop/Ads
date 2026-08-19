// OncoScan AI report — calls an OpenAI vision model via fetch (no SDK), reusing
// the same OPENAI_API_KEY as Sokro. Non-diagnostic, structured, bilingual, with
// anti-hallucination guardrails. The browser sends already-rendered slice PNGs,
// so the server never touches pixel data.

const BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODEL = process.env.RAD_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o';

function systemPrompt(modality) {
  return [
    `You are a radiology DECISION-SUPPORT assistant reviewing a subset of representative slices from a ${modality} study.`,
    `You are NOT making a diagnosis. You produce a STRUCTURED DRAFT for a physician to review; the attending physician holds final responsibility.`,
    ``,
    `Rules (follow strictly):`,
    `- Describe ONLY what is visibly present in the provided slices. Do NOT invent findings, measurements, structures, or regions not shown.`,
    `- Only comment on anatomy actually covered by these slices; if coverage/quality is insufficient for a region, say so instead of guessing.`,
    `- Use professional radiology language and hedge appropriately ("appears", "suggestive of"). Do NOT state definitive diagnoses.`,
    `- Trust the stated modality (${modality}). Give quantitative descriptors only when clearly measurable on the image.`,
    ``,
    `Output the report with these sections, and for EACH section write English first then Arabic (parallel, clear):`,
    `- Technique / التقنية`,
    `- Findings / النتائج (bullet points grouped by region)`,
    `- Impression / الانطباع (brief)`,
    `- Recommendation / التوصية (e.g., clinical correlation, further imaging)`,
    ``,
    `End EVERY report with this exact disclaimer on its own line:`,
    `⚠️ Decision support only — NOT a diagnosis. Final interpretation and responsibility rest with the attending physician. / أداة دعم قرار — ليست تشخيصاً. التفسير النهائي والمسؤولية على الطبيب المعالج.`,
  ].join('\n');
}

// images: array of data URLs (data:image/jpeg;base64,...). Returns { text, usage }.
async function generateReport({ modality, context, focus, images }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) { const e = new Error('OPENAI_API_KEY not configured'); e.code = 'NO_KEY'; throw e; }
  const imgs = (images || []).slice(0, 16).filter((u) => typeof u === 'string' && u.startsWith('data:image'));
  if (!imgs.length) { const e = new Error('no images'); e.code = 'NO_IMAGES'; throw e; }

  const userText = [
    `Modality: ${modality}.`,
    context ? `Clinical context from the physician: ${context}` : `No clinical context provided.`,
    focus ? `Focus of this read: ${focus}` : ``,
    `Below are ${imgs.length} representative slices from the study. Produce the structured bilingual report.`,
  ].filter(Boolean).join('\n');

  const content = [{ type: 'text', text: userText }].concat(
    imgs.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } }))
  );

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: systemPrompt(modality) }, { role: 'user', content }],
      max_tokens: 1800,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
  const usage = data.usage || {};
  return { text, usage, model: MODEL };
}

// Q&A over a study. `history` is prior [{role:'user'|'assistant', content}] text
// turns; `images` are 1-2 current slice data URLs so spatial questions work.
async function chatAboutStudy({ modality, context, priorReport, history, question, images }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) { const e = new Error('OPENAI_API_KEY not configured'); e.code = 'NO_KEY'; throw e; }
  const q = String(question || '').trim();
  if (!q) { const e = new Error('empty'); e.code = 'EMPTY'; throw e; }

  const sys = [
    `You are a radiology DECISION-SUPPORT assistant answering a physician's question about THIS ${modality} study. You are NOT diagnosing.`,
    `Answer ONLY from what is visible in the attached slice(s) and the prior report/context. If the question can't be answered from these, say so plainly — do not invent findings.`,
    `Be concise. Hedge appropriately ("appears", "suggestive of") — no definitive diagnosis. Answer in English then Arabic.`,
    context ? `Clinical context: ${context}` : ``,
    priorReport ? `Prior AI report for this study (for reference):\n${String(priorReport).slice(0, 4000)}` : ``,
  ].filter(Boolean).join('\n');

  const messages = [{ role: 'system', content: sys }];
  (history || []).slice(-6).forEach((m) => {
    if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
      messages.push({ role: m.role, content: m.content });
    }
  });
  const imgs = (images || []).slice(0, 2).filter((u) => typeof u === 'string' && u.startsWith('data:image'));
  const content = [{ type: 'text', text: q }].concat(imgs.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } })));
  messages.push({ role: 'user', content });

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 900, temperature: 0.2 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`); err.status = res.status; throw err;
  }
  const data = await res.json();
  // usage بترجع زي التقرير بالظبط: من غيرها سقف التكلفة اليومي مابيشوفش
  // مصروف الشات خالص، فالسقف بيبقى بيحرس نص الفاتورة.
  return {
    text: (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim(),
    usage: data.usage || {}, model: MODEL,
  };
}

module.exports = { generateReport, chatAboutStudy, MODEL };
