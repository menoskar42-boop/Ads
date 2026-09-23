'use strict';

const MAX_DAYS = 31;

function ymd(value) {
  const s = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function addDays(value, days) {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  const n = Math.round((b - a) / 86400000) + 1;
  return Number.isFinite(n) ? n : 0;
}

function readGoal(body, today) {
  const b = body || {};
  const start = ymd(b.starts_on) || today;
  const end = ymd(b.ends_on) || addDays(start, 6);
  const title = String(b.title || '').trim().slice(0, 160);
  const target = Number(b.target_value);
  const mode = b.measure_mode === 'latest' ? 'latest' : 'sum';
  const unit = String(b.unit || '').trim().slice(0, 40) || null;
  if (!title) return { ok: false, why: 'goal_title' };
  if (!Number.isFinite(target) || target <= 0 || target > 1000000) return { ok: false, why: 'goal_target' };
  if (!start || !end || end < start) return { ok: false, why: 'goal_dates' };
  if (daysBetween(start, end) > MAX_DAYS) return { ok: false, why: 'goal_dates' };
  return { ok: true, value: { title, target_value: target, unit, starts_on: start, ends_on: end, measure_mode: mode } };
}

function readLog(body) {
  const b = body || {};
  const value = Number(b.value);
  const onDate = ymd(b.on_date);
  if (!Number.isFinite(value) || value < 0 || value > 1000000) return { ok: false, why: 'goal_value' };
  if (!onDate) return { ok: false, why: 'goal_date' };
  return { ok: true, value: { value, on_date: onDate, note: String(b.note || '').trim().slice(0, 300) || null } };
}

function progress(goal, logs) {
  const rows = Array.isArray(logs) ? logs : [];
  const current = goal && goal.measure_mode === 'latest'
    ? (rows.length ? Number(rows[rows.length - 1].value) : 0)
    : rows.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
  const target = Number(goal && goal.target_value) || 0;
  return {
    current: Math.round(current * 10) / 10,
    target,
    pct: target ? Math.min(100, Math.round((current / target) * 100)) : null,
    logged: rows.length,
  };
}

function decorate(goal, logs) {
  return Object.assign({}, goal, { logs: logs || [], progress: progress(goal, logs) });
}

module.exports = { MAX_DAYS, ymd, addDays, daysBetween, readGoal, readLog, progress, decorate };