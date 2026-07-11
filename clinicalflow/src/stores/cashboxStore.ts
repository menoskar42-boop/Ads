// cashboxStore.ts — shift / cashbox sessions (STEP 4)
const KEY = 'cf_cashbox_sessions_v1';

export type CashboxStatus = 'open' | 'closed';

export interface CashboxSession {
  id: string;
  clinicId: string;
  userId: string;
  userName: string;
  startAmount: number;
  endAmount?: number;
  totalIncome: number;
  totalExpense: number;
  difference?: number;   // endAmount - (startAmount + totalIncome - totalExpense)
  openedAt: string;
  closedAt?: string;
  status: CashboxStatus;
}

function load(): CashboxSession[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function persist(items: CashboxSession[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage full */ }
}
function genId() { return `cb-${Date.now()}`; }

/** Open a new shift. Returns null if one is already open for this clinic. */
export function openShift(
  clinicId: string,
  userId: string,
  userName: string,
  startAmount: number,
): CashboxSession | null {
  const sessions = load();
  if (sessions.some(s => s.clinicId === clinicId && s.status === 'open')) return null;
  const session: CashboxSession = {
    id: genId(), clinicId, userId, userName,
    startAmount, totalIncome: 0, totalExpense: 0,
    openedAt: new Date().toISOString(), status: 'open',
  };
  sessions.push(session);
  persist(sessions);
  return session;
}

/** Close the current open shift. Calculates difference vs system total. */
export function closeShift(
  clinicId: string,
  endAmount: number,
): CashboxSession | null {
  const sessions = load();
  const idx = sessions.findIndex(s => s.clinicId === clinicId && s.status === 'open');
  if (idx === -1) return null;
  const s = sessions[idx];
  const expected = s.startAmount + s.totalIncome - s.totalExpense;
  sessions[idx] = {
    ...s,
    endAmount,
    difference: endAmount - expected,
    closedAt: new Date().toISOString(),
    status: 'closed',
  };
  persist(sessions);
  return sessions[idx];
}

/** Add income or expense to the active session */
export function recordToSession(clinicId: string, type: 'income' | 'expense', amount: number) {
  const sessions = load();
  const idx = sessions.findIndex(s => s.clinicId === clinicId && s.status === 'open');
  if (idx === -1) return;
  if (type === 'income') sessions[idx].totalIncome += amount;
  else sessions[idx].totalExpense += amount;
  persist(sessions);
}

export function getOpenSession(clinicId: string): CashboxSession | null {
  return load().find(s => s.clinicId === clinicId && s.status === 'open') ?? null;
}

export function getSessionHistory(clinicId: string, limit = 20): CashboxSession[] {
  return load()
    .filter(s => s.clinicId === clinicId)
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    .slice(0, limit);
}
