import { createStore } from './createStore';

export interface Branch {
  id: string;
  clinicId: string;
  name: string;
  nameAr: string;
  address?: string;
  addressAr?: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
}

const BRANCHES_KEY = 'cf_branches';

export const branchStore = createStore<Branch>([], BRANCHES_KEY);

// ── CRUD helpers ────────────────────────────────────────────────────────────

export function getBranchesForClinic(clinicId: string): Branch[] {
  return branchStore.filter(b => b.clinicId === clinicId && b.isActive);
}

export function getBranch(id: string): Branch | undefined {
  return branchStore.get(b => b.id === id);
}

export function addBranch(branch: Omit<Branch, 'id' | 'createdAt'>): Branch {
  const newBranch: Branch = {
    ...branch,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  branchStore.add(newBranch);
  return newBranch;
}

export function updateBranch(id: string, updates: Partial<Branch>): void {
  branchStore.update(b => b.id === id, updates);
}

export function deleteBranch(id: string): void {
  branchStore.remove(b => b.id === id);
}

// ── User ↔ Branch access (localStorage) ─────────────────────────────────────

const UBA_KEY = 'cf_user_branch_access';

interface UserBranchAccess {
  userId: string;
  branchId: string;
}

function loadUBA(): UserBranchAccess[] {
  try { return JSON.parse(localStorage.getItem(UBA_KEY) || '[]'); }
  catch { return []; }
}
function saveUBA(list: UserBranchAccess[]): void {
  localStorage.setItem(UBA_KEY, JSON.stringify(list));
}

export function getUserBranches(userId: string): string[] {
  return loadUBA().filter(r => r.userId === userId).map(r => r.branchId);
}

export function grantBranchAccess(userId: string, branchId: string): void {
  const list = loadUBA();
  if (!list.find(r => r.userId === userId && r.branchId === branchId)) {
    list.push({ userId, branchId });
    saveUBA(list);
  }
}

export function revokeBranchAccess(userId: string, branchId: string): void {
  saveUBA(loadUBA().filter(r => !(r.userId === userId && r.branchId === branchId)));
}

// ── Active branch selection (per-session) ───────────────────────────────────

const ACTIVE_BRANCH_KEY = 'cf_active_branch';

export function getActiveBranchId(): string | null {
  return localStorage.getItem(ACTIVE_BRANCH_KEY);
}

export function setActiveBranchId(branchId: string | null): void {
  if (branchId) localStorage.setItem(ACTIVE_BRANCH_KEY, branchId);
  else localStorage.removeItem(ACTIVE_BRANCH_KEY);
}

// ── Resolve effective branch for queries ────────────────────────────────────
// Returns null meaning "all branches" when clinic has only one.

export function resolveActiveBranch(clinicId: string): string | null {
  const branches = getBranchesForClinic(clinicId);
  if (branches.length <= 1) return null;
  const stored = getActiveBranchId();
  if (stored && branches.find(b => b.id === stored)) return stored;
  return null;
}

// ── Demo seed ────────────────────────────────────────────────────────────────

export function seedDemoBranches(clinicId: string): void {
  const existing = getBranchesForClinic(clinicId);
  if (existing.length > 0) return;
  addBranch({ clinicId, name: 'Main Branch', nameAr: 'الفرع الرئيسي', address: '123 Main St', addressAr: '١٢٣ شارع الرئيسي', phone: '01000000001', isActive: true });
  addBranch({ clinicId, name: 'North Branch', nameAr: 'الفرع الشمالي', address: '456 North Ave', addressAr: '٤٥٦ شارع الشمال', phone: '01000000002', isActive: true });
}
