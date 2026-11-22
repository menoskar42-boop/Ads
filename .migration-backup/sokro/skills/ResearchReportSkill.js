'use strict';

// Skill: research a topic on the web and produce a concise written report with
// sources. Composes the `search_web` action + the LLM for synthesis. Maps to the
// user goal "ابحثلي على X واعملي تقرير". (Phase 11 turns the report into
// Excel/PDF; for now it returns structured markdown + sources.)
const { register } = require('./_registry');

async function run(ctx, input) {
  const query = String((input && (input.query || input.topic)) || '').trim();
  if (!query) return { ok: false, error: 'query/topic required' };

  const search = ctx.actions.get('search_web');
  if (!search) return { ok: false, error: 'search_web action unavailable' };
  const s = await search.run(ctx, { query, limit: (input && input.limit) || 8 });
  if (!s.ok) return { ok: false, error: s.error || 'search failed' };
  const sources = (s.output && s.output.results) || [];
  if (!sources.length) return { ok: false, error: 'no search results to report on' };

  const preamble = require('../assistant-profile').buildPreamble(ctx && ctx.prefs);
  const langInstr = require('../core/lang').replyInstruction(ctx && ctx.prefs && ctx.prefs.lang);
  const sys = preamble + ' ' + langInstr + ' You are a research assistant. Using ONLY the provided search results, write a concise, well-structured report. Use short sections and bullet points, and reference source numbers like [1], [2].';
  const user = `Topic: ${query}\nSearch results:\n${sources.map((r, i) => `[${i + 1}] ${r.title} — ${r.url}`).join('\n')}`;
  let report;
  try {
    // A deep report earns the SMART model (it's the heavy-reasoning task).
    const out = await ctx.llm.chat({ model: require('../core/config').llm.openai.smartModel, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] });
    report = out.text;
  } catch (e) {
    return { ok: false, error: 'report synthesis failed: ' + e.message };
  }

  if (ctx.log) ctx.log('research_report', { query, sources: sources.length });
  return { ok: true, output: { topic: query, report, sources } };
}

register({
  name: 'research_report',
  description: 'Research a topic on the web and produce a concise written report with cited sources.',
  permissions: ['network'],
  run,
});

module.exports = run;
