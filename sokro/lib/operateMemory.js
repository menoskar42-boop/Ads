'use strict';

// ── Operator Learning Memory ─────────────────────────────────────────────────
// Persists what WORKED so the Operator gets better over time:
//   • record()      — save a successful action path for a site (a reusable recipe)
//   • recall()      — the most recent successful path + last fingerprint for a site
//   • fingerprint() — a STRUCTURAL signature of a page (labels of its inputs/links,
//                     content-independent) so we can detect BIG layout changes
//   • bigChange()   — did the site's structure change a lot since last time?
//   • topHosts()    — the user's most-used sites (learned preferences over time)
// All best-effort: any DB error degrades to "no memory", never throws to the loop.
const { Pool } = require('pg');
let _pool;
function db() { if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL }); return _pool; }

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } }

// Structural fingerprint = "count:hash" over the SORTED labels of the page's
// inputs and clickables (not the body text), so it changes when the site is
// redesigned but stays stable as content changes.
function fingerprint(state) {
  const labels = []
    .concat((state.inputs || []).map((e) => 'i:' + (e.label || e.type || '')))
    .concat((state.clickables || []).map((e) => 'c:' + (e.label || '')))
    .map((s) => s.toLowerCase().trim()).filter(Boolean).sort();
  const joined = labels.join('|');
  let h = 0; for (let i = 0; i < joined.length; i++) { h = (h * 31 + joined.charCodeAt(i)) >>> 0; }
  return labels.length + ':' + h.toString(16);
}

// ≥40% change in structural element count OR a different hash at similar size = big.
function bigChange(oldFp, newFp) {
  if (!oldFp || !newFp || oldFp === newFp) return false;
  const a = String(oldFp).split(':'), b = String(newFp).split(':');
  const la = +a[0] || 0, lb = +b[0] || 0;
  const diff = Math.abs(la - lb) / Math.max(la, lb, 1);
  return diff >= 0.4;
}

async function recall(userId, host) {
  if (!userId || !host) return null;
  try {
    const r = await db().query('SELECT goal, fingerprint, trail, uses FROM sokro_operate_memory WHERE user_id=$1 AND host=$2 ORDER BY updated_at DESC LIMIT 1', [userId, host]);
    return r.rows[0] || null;
  } catch (_) { return null; }
}

// Record a successful run. If a row for (user, host) exists we bump uses + refresh
// the recipe/fingerprint; otherwise insert. Keeps one "best known" row per site.
async function record(userId, host, goal, fp, trail) {
  if (!userId || !host) return;
  const compact = (trail || []).filter((t) => t && t.ok).map((t) => ({ action: t.action, idx: t.idx, text: t.text, thought: t.thought }));
  try {
    const ex = await db().query('SELECT id FROM sokro_operate_memory WHERE user_id=$1 AND host=$2 ORDER BY updated_at DESC LIMIT 1', [userId, host]);
    if (ex.rows[0]) {
      await db().query('UPDATE sokro_operate_memory SET goal=$1, fingerprint=$2, trail=$3, uses=uses+1, updated_at=now() WHERE id=$4', [goal, fp, JSON.stringify(compact), ex.rows[0].id]);
    } else {
      await db().query('INSERT INTO sokro_operate_memory (user_id, host, goal, fingerprint, trail) VALUES ($1,$2,$3,$4,$5)', [userId, host, goal, fp, JSON.stringify(compact)]);
    }
  } catch (_) {}
}

async function topHosts(userId, n) {
  if (!userId) return [];
  try {
    const r = await db().query('SELECT host, SUM(uses)::int AS uses FROM sokro_operate_memory WHERE user_id=$1 GROUP BY host ORDER BY uses DESC LIMIT $2', [userId, n || 5]);
    return r.rows;
  } catch (_) { return []; }
}

module.exports = { hostOf, fingerprint, bigChange, recall, record, topHosts };
