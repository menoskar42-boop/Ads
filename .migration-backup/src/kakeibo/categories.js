// Expense categories (Kakeibo) — key + emoji + chart color. Labels come from i18n.
const CATEGORIES = [
  { key: 'needs',         icon: '🧺', color: '#3b82f6' },
  { key: 'food',          icon: '🍽️', color: '#f59e0b' },
  { key: 'transport',     icon: '🚌', color: '#10b981' },
  { key: 'bills',         icon: '🧾', color: '#6366f1' },
  { key: 'entertainment', icon: '🎬', color: '#ec4899' },
  { key: 'health',        icon: '🩺', color: '#ef4444' },
  { key: 'shopping',      icon: '🛍️', color: '#8b5cf6' },
  { key: 'investment',    icon: '📈', color: '#14b8a6' },
  { key: 'other',         icon: '📦', color: '#6b7280' },
];
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

const PAYMENT_METHODS = ['cash', 'card', 'wallet', 'transfer', 'other'];

module.exports = { CATEGORIES, CATEGORY_KEYS, CAT_MAP, PAYMENT_METHODS };
