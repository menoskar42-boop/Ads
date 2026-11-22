// Research Data Auditor — AI explanation layer (OpenAI via fetch, no SDK).
//
// Reuses the same OPENAI_API_KEY the rest of OscarDevs uses. Its ONLY job is to
// explain, in plain language, the issues the deterministic validators already
// found. It is given the findings as facts and is forbidden from inventing
// medical conclusions or new problems — because a data-audit tool that
// hallucinates a finding is worse than useless, it is dangerous.
//
// Degrades gracefully: with no key, the report still renders fully from the
// deterministic engine; only the narrative paragraph is omitted.

const BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODEL = process.env.RESEARCH_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

function isEnabled() { return Boolean(process.env.OPENAI_API_KEY); }

function systemPrompt() {
  return [
    'You are a research-data QUALITY assistant. A deterministic engine has ALREADY analysed a medical research dataset and produced a list of concrete findings (missing data, out-of-range values, unit mistakes, formula mismatches, duplicates, outliers, precision, statistical readiness).',
    '',
    'Your ONLY task is to explain these findings to the researcher in clear, plain Arabic, and help them prioritise.',
    '',
    'Absolute rules (follow strictly):',
    '- Explain ONLY the findings you are given. Do NOT invent new findings, numbers, columns, or medical conclusions.',
    '- NEVER state a diagnosis or a clinical interpretation. You assess DATA QUALITY, not patients.',
    '- NEVER fabricate statistics (no p-values, no correlations, no AUC). You may only describe what the findings imply for future analysis in general terms.',
    '- If something is unclear or you are not certain, say exactly: "يحتاج مراجعة الباحث." Do not guess.',
    '- Do not tell the researcher to delete data. Recommend review and correction.',
    '',
    'Write 2–4 short paragraphs in Arabic:',
    '1. A one-line overall read of the dataset quality (tied to the score you are given).',
    '2. The most important issues to fix first and why they matter for analysis.',
    '3. A brief note on statistical readiness if relevant.',
    'Keep it concise and practical. End with: "دي مراجعة جودة بيانات آلية — القرار النهائي للباحث."',
  ].join('\n');
}

// Compact the report into a small factual brief for the model — never the raw
// data rows, only the aggregate findings, to keep tokens down and PII out.
function briefFromReport(report) {
  const s = report.summary;
  const top = report.findings.slice(0, 40).map((f) => `- [${f.severity}/${f.category}] ${f.problem}`);
  const catCounts = report.byCategory.map((c) => `${c.label}: ${c.count}`).join('، ');
  return [
    `Dataset: ${s.rows} صف × ${s.columns} عمود. نسبة النقص ${s.missingPct}%.`,
    `Quality score: ${s.score}/100 (${s.scoreLabel.label}).`,
    `Counts — حرج: ${s.counts.critical}، مرتفع: ${s.counts.high}، متوسط: ${s.counts.medium}، منخفض: ${s.counts.low}.`,
    `Impossible values: ${s.impossibleValues}. Duplicate patient IDs: ${s.duplicatePatients}.`,
    `By category: ${catCounts || 'لا يوجد'}.`,
    '',
    'Top findings:',
    ...top,
  ].join('\n');
}

/**
 * @returns { text, model } — text is '' when no key or on any failure (the
 * caller renders the deterministic report regardless).
 */
async function explain(report) {
  if (!isEnabled()) return { text: '', model: null, disabled: true };
  const brief = briefFromReport(report);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: `Here are the audit findings. Explain them for the researcher.\n\n${brief}` },
        ],
        max_tokens: 900,
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[research ai]', res.status, body.slice(0, 200));
      return { text: '', model: null, error: `OpenAI ${res.status}` };
    }
    const data = await res.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
    return { text, model: MODEL };
  } catch (e) {
    console.error('[research ai]', e.message);
    return { text: '', model: null, error: e.message };
  }
}

module.exports = { explain, isEnabled, MODEL };
