'use strict';

/**
 * Weekly engagement is an operational signal, not a clinical score.
 *
 * It counts what the patient recorded in the last few calendar days and keeps
 * the parts separate: a patient can check in without writing what they ate,
 * and can tick the plan without entering a check-in. Combining those into one
 * percentage would hide the exact follow-up question the dietitian needs.
 */

const DEFAULT_DAYS = 7;

function integer(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function summary(row, days) {
  const windowDays = integer(days, DEFAULT_DAYS);
  const activeDays = Math.max(0, Number(row && row.active_days) || 0);
  const checkinDays = Math.max(0, Number(row && row.checkin_days) || 0);
  const diaryDays = Math.max(0, Number(row && row.diary_days) || 0);
  const completedTicks = Math.max(0, Number(row && row.completed_ticks) || 0);
  const plannedItems = Math.max(0, Number(row && row.planned_items) || 0);
  const expectedTicks = plannedItems * windowDays;
  const adherencePct = expectedTicks
    ? Math.min(100, Math.round((completedTicks / expectedTicks) * 100))
    : null;

  // This is deliberately about follow-up workload, not patient performance.
  const attention = activeDays === 0 ? 'quiet' : activeDays < 3 ? 'low' : 'active';
  return {
    ...row,
    active_days: activeDays,
    checkin_days: checkinDays,
    diary_days: diaryDays,
    completed_ticks: completedTicks,
    planned_items: plannedItems,
    expected_ticks: expectedTicks,
    adherence_pct: adherencePct,
    attention,
    days: windowDays,
  };
}

function sortForFollowUp(rows, days) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => summary(row, days))
    .sort((a, b) => {
      const rank = { quiet: 0, low: 1, active: 2 };
      if (rank[a.attention] !== rank[b.attention]) return rank[a.attention] - rank[b.attention];
      if (a.active_days !== b.active_days) return a.active_days - b.active_days;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

module.exports = { DEFAULT_DAYS, summary, sortForFollowUp };