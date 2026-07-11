// ─── loyaltyStore.ts ─────────────────────────────────────────────────────────
// Loyalty points system: earn on invoices, redeem for discounts
// Persisted to localStorage under key: cf_loyalty_v1

export interface LoyaltyTransaction {
  id: string;
  patientId: string;
  clinicId: string;
  type: 'earn' | 'redeem' | 'expire' | 'bonus';
  points: number;           // positive = earned/bonus, negative = redeemed/expired
  description: string;
  descriptionAr: string;
  referenceId?: string;     // invoiceId or appointmentId
  createdAt: string;        // ISO date
}

export interface LoyaltyConfig {
  clinicId: string;
  pointsPerEgp: number;       // e.g. 1 point per 10 EGP paid
  egpPerPoint: number;        // e.g. 1 EGP per 100 points redeemed
  minRedeemPoints: number;    // minimum points needed to redeem
  maxRedeemPercent: number;   // max % of invoice redeemable (e.g. 20)
  isEnabled: boolean;
}

// ─── Default config per clinic ────────────────────────────────────────────────
const DEFAULT_CONFIG: Omit<LoyaltyConfig, 'clinicId'> = {
  pointsPerEgp: 0.1,       // 1 point per 10 EGP
  egpPerPoint: 0.01,        // 1 EGP per 100 points  (100 pts = 1 EGP)
  minRedeemPoints: 500,
  maxRedeemPercent: 20,
  isEnabled: true,
};

// ─── Persistence helpers ──────────────────────────────────────────────────────
const TX_KEY = 'cf_loyalty_v1';
const CFG_KEY = 'cf_loyalty_cfg_v1';

function loadTransactions(): LoyaltyTransaction[] {
  try {
    const raw = localStorage.getItem(TX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTransactions(txs: LoyaltyTransaction[]) {
  localStorage.setItem(TX_KEY, JSON.stringify(txs));
}

function loadConfigs(): Record<string, LoyaltyConfig> {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveConfigs(cfgs: Record<string, LoyaltyConfig>) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfgs));
}

// ─── Config API ───────────────────────────────────────────────────────────────
export function getClinicLoyaltyConfig(clinicId: string): LoyaltyConfig {
  const cfgs = loadConfigs();
  return cfgs[clinicId] ?? { ...DEFAULT_CONFIG, clinicId };
}

export function updateClinicLoyaltyConfig(clinicId: string, updates: Partial<LoyaltyConfig>): void {
  const cfgs = loadConfigs();
  cfgs[clinicId] = { ...getClinicLoyaltyConfig(clinicId), ...updates };
  saveConfigs(cfgs);
}

// ─── Transaction API ──────────────────────────────────────────────────────────
function genId(): string {
  return `lty-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Earn points when an invoice is paid */
export function earnPointsForInvoice(
  patientId: string,
  clinicId: string,
  paidAmount: number,
  invoiceId: string,
): LoyaltyTransaction | null {
  const cfg = getClinicLoyaltyConfig(clinicId);
  if (!cfg.isEnabled) return null;

  const points = Math.floor(paidAmount * cfg.pointsPerEgp);
  if (points <= 0) return null;

  const tx: LoyaltyTransaction = {
    id: genId(),
    patientId,
    clinicId,
    type: 'earn',
    points,
    description: `Earned ${points} points for invoice payment`,
    descriptionAr: `تم كسب ${points} نقطة مقابل دفع الفاتورة`,
    referenceId: invoiceId,
    createdAt: new Date().toISOString(),
  };

  const txs = loadTransactions();
  txs.push(tx);
  saveTransactions(txs);
  return tx;
}

/** Add bonus points manually (admin) */
export function addBonusPoints(
  patientId: string,
  clinicId: string,
  points: number,
  reason: string,
  reasonAr: string,
): LoyaltyTransaction {
  const tx: LoyaltyTransaction = {
    id: genId(),
    patientId,
    clinicId,
    type: 'bonus',
    points,
    description: reason,
    descriptionAr: reasonAr,
    createdAt: new Date().toISOString(),
  };
  const txs = loadTransactions();
  txs.push(tx);
  saveTransactions(txs);
  return tx;
}

/** Redeem points as invoice discount. Returns EGP discount amount or 0 if invalid */
export function redeemPoints(
  patientId: string,
  clinicId: string,
  pointsToRedeem: number,
  invoiceId: string,
  invoiceTotal: number,
): { success: boolean; discountEgp: number; error?: string; errorAr?: string } {
  const cfg = getClinicLoyaltyConfig(clinicId);
  if (!cfg.isEnabled) return { success: false, discountEgp: 0, error: 'Loyalty program is disabled', errorAr: 'برنامج الولاء غير مفعّل' };

  const balance = getPatientBalance(patientId, clinicId);
  if (pointsToRedeem > balance) {
    return { success: false, discountEgp: 0, error: 'Insufficient points', errorAr: 'رصيد النقاط غير كافٍ' };
  }
  if (pointsToRedeem < cfg.minRedeemPoints) {
    return { success: false, discountEgp: 0, error: `Minimum ${cfg.minRedeemPoints} points to redeem`, errorAr: `الحد الأدنى للاستبدال ${cfg.minRedeemPoints} نقطة` };
  }

  const discountEgp = pointsToRedeem * cfg.egpPerPoint;
  const maxDiscount = invoiceTotal * (cfg.maxRedeemPercent / 100);
  const finalDiscount = Math.min(discountEgp, maxDiscount);
  const finalPoints = Math.ceil(finalDiscount / cfg.egpPerPoint);

  const tx: LoyaltyTransaction = {
    id: genId(),
    patientId,
    clinicId,
    type: 'redeem',
    points: -finalPoints,
    description: `Redeemed ${finalPoints} points for ${finalDiscount.toFixed(2)} EGP discount`,
    descriptionAr: `تم استبدال ${finalPoints} نقطة بخصم ${finalDiscount.toFixed(2)} ج.م`,
    referenceId: invoiceId,
    createdAt: new Date().toISOString(),
  };

  const txs = loadTransactions();
  txs.push(tx);
  saveTransactions(txs);

  return { success: true, discountEgp: finalDiscount };
}

// ─── Query API ────────────────────────────────────────────────────────────────
export function getPatientBalance(patientId: string, clinicId: string): number {
  const txs = loadTransactions().filter(t => t.patientId === patientId && t.clinicId === clinicId);
  return txs.reduce((sum, t) => sum + t.points, 0);
}

export function getPatientTransactions(patientId: string, clinicId: string): LoyaltyTransaction[] {
  return loadTransactions()
    .filter(t => t.patientId === patientId && t.clinicId === clinicId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getClinicTopPatients(clinicId: string, limit = 10): Array<{ patientId: string; points: number }> {
  const txs = loadTransactions().filter(t => t.clinicId === clinicId);
  const map: Record<string, number> = {};
  txs.forEach(t => { map[t.patientId] = (map[t.patientId] ?? 0) + t.points; });
  return Object.entries(map)
    .map(([patientId, points]) => ({ patientId, points }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

/** Convert points to EGP value string */
export function calcPointsValue(points: number, clinicId: string): number {
  const cfg = getClinicLoyaltyConfig(clinicId);
  return points * cfg.egpPerPoint;
}

/**
 * Redeem points without tying to an invoice — used in Patient Portal.
 * Creates a 'redeem' transaction and returns the EGP discount credit.
 */
export function redeemPointsForBalance(
  patientId: string,
  clinicId: string,
  pointsToRedeem: number,
): { success: boolean; discountEgp: number; error?: string; errorAr?: string } {
  const cfg = getClinicLoyaltyConfig(clinicId);
  if (!cfg.isEnabled) return { success: false, discountEgp: 0, error: 'Loyalty disabled', errorAr: 'برنامج الولاء غير مفعّل' };
  const balance = getPatientBalance(patientId, clinicId);
  if (pointsToRedeem < cfg.minRedeemPoints)
    return { success: false, discountEgp: 0, error: `Min ${cfg.minRedeemPoints} pts`, errorAr: `الحد الأدنى ${cfg.minRedeemPoints} نقطة` };
  if (pointsToRedeem > balance)
    return { success: false, discountEgp: 0, error: 'Insufficient points', errorAr: 'رصيد غير كافٍ' };
  const discountEgp = pointsToRedeem * cfg.egpPerPoint;
  const tx: LoyaltyTransaction = {
    id: genId(), patientId, clinicId, type: 'redeem',
    points: -pointsToRedeem,
    description: `Redeemed ${pointsToRedeem} pts → ${discountEgp.toFixed(2)} EGP credit`,
    descriptionAr: `تم استبدال ${pointsToRedeem} نقطة بـ ${discountEgp.toFixed(2)} ج.م رصيد`,
    createdAt: new Date().toISOString(),
  };
  const txs = loadTransactions();
  txs.push(tx);
  saveTransactions(txs);
  return { success: true, discountEgp };
}

// ─── Referral helpers ─────────────────────────────────────────────────────────
const REF_KEY = 'cf_referral_events_v1';

export interface ReferralEvent {
  id: string;
  referrerId: string;
  refereeId: string;
  clinicId: string;
  pointsGiven: number;
  createdAt: string;
}

function loadReferralEvents(): ReferralEvent[] {
  try { return JSON.parse(localStorage.getItem(REF_KEY) || '[]'); } catch { return []; }
}
function saveReferralEvents(events: ReferralEvent[]) {
  localStorage.setItem(REF_KEY, JSON.stringify(events));
}

/** Generate a unique referral code for a new patient, e.g. "PAT-4821" */
export function generateReferralCode(): string {
  return `PAT-${Math.floor(1000 + Math.random() * 9000)}`;
}

/** Find a patient id by their referral code (scans patientStore) */
export function findPatientByReferralCode(code: string): string | null {
  try {
    const raw = localStorage.getItem('cf_registered_patients');
    if (!raw) return null;
    const patients: Array<{ id: string; referralCode?: string }> = JSON.parse(raw);
    return patients.find(p => p.referralCode === code)?.id ?? null;
  } catch { return null; }
}

/** Check if a referral bonus has already been applied for this referrer/referee pair */
export function referralAlreadyApplied(referrerId: string, refereeId: string): boolean {
  return loadReferralEvents().some(e => e.referrerId === referrerId && e.refereeId === refereeId);
}

/**
 * Apply referral bonus: +20 pts to referrer, +10 pts to referee.
 * Returns false if invalid: same person, already applied, or duplicate referrer.
 */
export function applyReferralBonus(
  referrerId: string,
  refereeId: string,
  clinicId: string,
): boolean {
  if (referrerId === refereeId) return false;                        // no self-referral
  if (referralAlreadyApplied(referrerId, refereeId)) return false;  // no duplicate

  const event: ReferralEvent = {
    id: `ref-${Date.now()}`,
    referrerId,
    refereeId,
    clinicId,
    pointsGiven: 20,
    createdAt: new Date().toISOString(),
  };
  saveReferralEvents([...loadReferralEvents(), event]);

  const txs = loadTransactions();
  txs.push({
    id: genId(), patientId: referrerId, clinicId, type: 'bonus',
    points: 20, description: 'Referral bonus — friend registered',
    descriptionAr: 'مكافأة الإحالة — صديق مسجّل', createdAt: event.createdAt,
  });
  txs.push({
    id: genId(), patientId: refereeId, clinicId, type: 'bonus',
    points: 10, description: 'Welcome bonus — registered via referral',
    descriptionAr: 'مكافأة الترحيب — تسجيل عبر رمز إحالة', createdAt: event.createdAt,
  });
  saveTransactions(txs);
  return true;
}

/** Earn +10 points when a visit is completed */
export function earnPointsForVisit(
  patientId: string,
  clinicId: string,
  appointmentId: string,
): LoyaltyTransaction | null {
  const cfg = getClinicLoyaltyConfig(clinicId);
  if (!cfg.isEnabled) return null;
  const txs = loadTransactions();
  if (txs.some(t => t.referenceId === `visit:${appointmentId}`)) return null; // idempotent
  const tx: LoyaltyTransaction = {
    id: genId(), patientId, clinicId, type: 'earn', points: 10,
    description: 'Earned 10 points for completing visit',
    descriptionAr: 'تم كسب 10 نقاط لإتمام الزيارة',
    referenceId: `visit:${appointmentId}`,
    createdAt: new Date().toISOString(),
  };
  txs.push(tx);
  saveTransactions(txs);
  return tx;
}

/** All referral events for a clinic (for admin leaderboard) */
export function getClinicReferralEvents(clinicId: string): ReferralEvent[] {
  return loadReferralEvents().filter(e => e.clinicId === clinicId);
}

/** Referral leaderboard: top referrers by count for a clinic */
export function getReferralLeaderboard(clinicId: string, limit = 10): Array<{ patientId: string; count: number; points: number }> {
  const events = getClinicReferralEvents(clinicId);
  const map: Record<string, { count: number; points: number }> = {};
  events.forEach(e => {
    if (!map[e.referrerId]) map[e.referrerId] = { count: 0, points: 0 };
    map[e.referrerId].count += 1;
    map[e.referrerId].points += e.pointsGiven;
  });
  return Object.entries(map)
    .map(([patientId, v]) => ({ patientId, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ─── Seed demo points (runs once) ────────────────────────────────────────────
const SEED_KEY = 'cf_loyalty_seeded_v1';

function seedDemoPoints() {
  if (localStorage.getItem(SEED_KEY)) return;
  const now = new Date();
  const d = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();
  const seeds: LoyaltyTransaction[] = [
    { id: 'ls-1',  patientId: 'pt-1',  clinicId: 'clinic-1', type: 'earn',   points: 1200, description: 'Earned for invoice payments',   descriptionAr: 'مكتسب من دفع الفواتير',      createdAt: d(30) },
    { id: 'ls-2',  patientId: 'pt-1',  clinicId: 'clinic-1', type: 'redeem', points: -500, description: 'Redeemed for 5 EGP discount',   descriptionAr: 'مستبدل بخصم 5 ج.م',          createdAt: d(15) },
    { id: 'ls-3',  patientId: 'pt-1',  clinicId: 'clinic-1', type: 'earn',   points: 300,  description: 'Earned for invoice payment',    descriptionAr: 'مكتسب من دفع الفاتورة',       createdAt: d(5)  },
    { id: 'ls-4',  patientId: 'pt-2',  clinicId: 'clinic-1', type: 'earn',   points: 5500, description: 'Earned for invoice payments',   descriptionAr: 'مكتسب من دفع الفواتير',      createdAt: d(60) },
    { id: 'ls-5',  patientId: 'pt-2',  clinicId: 'clinic-1', type: 'bonus',  points: 200,  description: 'Birthday bonus',               descriptionAr: 'مكافأة عيد الميلاد',          createdAt: d(10) },
    { id: 'ls-6',  patientId: 'pt-3',  clinicId: 'clinic-1', type: 'earn',   points: 850,  description: 'Earned for invoice payments',   descriptionAr: 'مكتسب من دفع الفواتير',      createdAt: d(45) },
    { id: 'ls-7',  patientId: 'pt-4',  clinicId: 'clinic-1', type: 'earn',   points: 10500,description: 'Earned for multiple visits',    descriptionAr: 'مكتسب من زيارات متعددة',      createdAt: d(90) },
    { id: 'ls-8',  patientId: 'pt-5',  clinicId: 'clinic-1', type: 'earn',   points: 350,  description: 'Earned for invoice payment',    descriptionAr: 'مكتسب من دفع الفاتورة',       createdAt: d(20) },
    { id: 'ls-9',  patientId: 'pt-6',  clinicId: 'clinic-1', type: 'earn',   points: 2200, description: 'Earned for invoice payments',   descriptionAr: 'مكتسب من دفع الفواتير',      createdAt: d(35) },
    { id: 'ls-10', patientId: 'pt-7',  clinicId: 'clinic-1', type: 'earn',   points: 680,  description: 'Earned for invoice payment',    descriptionAr: 'مكتسب من دفع الفاتورة',       createdAt: d(12) },
    { id: 'ls-11', patientId: 'pt-8',  clinicId: 'clinic-1', type: 'earn',   points: 420,  description: 'Earned for invoice payment',    descriptionAr: 'مكتسب من دفع الفاتورة',       createdAt: d(8)  },
    { id: 'ls-12', patientId: 'pt-20', clinicId: 'clinic-2', type: 'earn',   points: 750,  description: 'Earned for invoice payment',    descriptionAr: 'مكتسب من دفع الفاتورة',       createdAt: d(25) },
    { id: 'ls-13', patientId: 'pt-21', clinicId: 'clinic-2', type: 'earn',   points: 1100, description: 'Earned for invoice payments',   descriptionAr: 'مكتسب من دفع الفواتير',      createdAt: d(18) },
  ];
  const existing = loadTransactions();
  const merged = [...existing, ...seeds.filter(s => !existing.some(e => e.id === s.id))];
  saveTransactions(merged);
  localStorage.setItem(SEED_KEY, '1');
}

seedDemoPoints();
