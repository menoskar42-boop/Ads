// ── Doctor Follow-Up Automation Store ────────────────────────────────────────
// Tracks doctor activity flags and manages follow-up notification rules.
// Designed to be extended with WhatsApp / email / SMS channels in the future.

export type DoctorActivity =
  | 'has_created_patient'
  | 'has_created_booking'
  | 'has_used_ai'
  | 'has_enabled_whatsapp';

export interface DoctorFollowUpState {
  doctorId:             string;
  joinedAt:             string;   // ISO — when we first saw this doctor (set once)
  has_created_patient:  boolean;
  has_created_booking:  boolean;
  has_used_ai:          boolean;
  has_enabled_whatsapp: boolean;
  dismissedRuleIds:     string[]; // rules the doctor has already seen / dismissed
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const storeKey = (doctorId: string) => `cf_fu_${doctorId}`;

export function loadFollowUpState(doctorId: string): DoctorFollowUpState {
  try {
    const raw = localStorage.getItem(storeKey(doctorId));
    if (raw) return JSON.parse(raw) as DoctorFollowUpState;
  } catch { /* parse error */ }

  // First visit — initialise with current time
  const initial: DoctorFollowUpState = {
    doctorId,
    joinedAt:             new Date().toISOString(),
    has_created_patient:  false,
    has_created_booking:  false,
    has_used_ai:          false,
    has_enabled_whatsapp: false,
    dismissedRuleIds:     [],
  };
  saveFollowUpState(initial);
  return initial;
}

export function saveFollowUpState(state: DoctorFollowUpState): void {
  try { localStorage.setItem(storeKey(state.doctorId), JSON.stringify(state)); } catch { /* storage full */ }
}

// Mark a single activity flag as done and notify any listeners
export function trackActivity(doctorId: string, activity: DoctorActivity): void {
  const state = loadFollowUpState(doctorId);
  if (state[activity]) return; // already set — no-op
  saveFollowUpState({ ...state, [activity]: true });
  // Dispatch a custom event so useDoctorFollowUp hook refreshes immediately
  window.dispatchEvent(new CustomEvent('cf_followup_update', { detail: { doctorId } }));
}

export function dismissFollowUpRule(doctorId: string, ruleId: string): void {
  const state = loadFollowUpState(doctorId);
  if (state.dismissedRuleIds.includes(ruleId)) return;
  saveFollowUpState({ ...state, dismissedRuleIds: [...state.dismissedRuleIds, ruleId] });
  window.dispatchEvent(new CustomEvent('cf_followup_update', { detail: { doctorId } }));
}

// ── Follow-up rule definitions ────────────────────────────────────────────────
// Each rule specifies:
//   - when to fire (triggerAfterMs since joinedAt)
//   - whether the condition still applies (conditionFn)
//   - what to show (title + message in AR + EN)
//   - which channels to use (in_app now; WhatsApp / email / SMS in the future)

export interface FollowUpRule {
  id:              string;
  triggerAfterMs:  number;                     // delay after joinedAt
  conditionFn:     (s: DoctorFollowUpState) => boolean;
  titleAr:         string;
  titleEn:         string;
  messageAr:       string;
  messageEn:       string;
  channels:        ('in_app' | 'whatsapp' | 'email' | 'sms')[];
  urgency:         'high' | 'medium' | 'low';
  actionRoute?:    string;
  actionLabelAr?:  string;
  actionLabelEn?:  string;
}

export const FOLLOW_UP_RULES: FollowUpRule[] = [
  {
    id:             'fu_10min_no_patient',
    triggerAfterMs: 10 * 60 * 1000,                       // 10 minutes
    conditionFn:    (s) => !s.has_created_patient,
    titleAr:        'ابدأ بإضافة أول مريض',
    titleEn:        'Add your first patient',
    messageAr:      'لم تضف أي مريض بعد — أضف مريضاً الآن وابدأ استخدام الطابور.',
    messageEn:      'No patients yet. Add one now and start using the queue.',
    channels:       ['in_app'],
    urgency:        'medium',
    actionRoute:    '/patients',
    actionLabelAr:  'إضافة مريض',
    actionLabelEn:  'Add Patient',
  },
  {
    id:             'fu_1hr_no_booking',
    triggerAfterMs: 60 * 60 * 1000,                       // 1 hour
    conditionFn:    (s) => !s.has_created_booking,
    titleAr:        'جدول أول موعد',
    titleEn:        'Schedule your first booking',
    messageAr:      'المواعيد المُجدولة تزيد التزام المرضى ثلاثة أضعاف. سجّل أول موعد الآن.',
    messageEn:      'Scheduled appointments 3× patient commitment. Book your first now.',
    channels:       ['in_app'],
    urgency:        'medium',
    actionRoute:    '/appointments',
    actionLabelAr:  'إنشاء موعد',
    actionLabelEn:  'Create Booking',
  },
  {
    id:             'fu_1day_no_feature',
    triggerAfterMs: 24 * 60 * 60 * 1000,                  // 1 day
    conditionFn:    (s) => !s.has_used_ai && !s.has_enabled_whatsapp,
    titleAr:        'جرّب الذكاء الاصطناعي',
    titleEn:        'Try AI features',
    messageAr:      'وفّر وقتك مع المساعد الذكي — تلخيص الزيارات، الوصفات، والتشخيص.',
    messageEn:      'Save time with AI — visit summaries, prescriptions, diagnostics.',
    channels:       ['in_app'],
    urgency:        'low',
    actionRoute:    '/dashboard',
    actionLabelAr:  'استكشف الذكاء الاصطناعي',
    actionLabelEn:  'Explore AI',
  },
  {
    id:             'fu_3day_inactive',
    triggerAfterMs: 3 * 24 * 60 * 60 * 1000,              // 3 days
    conditionFn:    (s) => !s.has_created_patient && !s.has_created_booking,
    titleAr:        'فعّل عيادتك الآن',
    titleEn:        'Activate your clinic',
    messageAr:      'ترقّ إلى الباقة الاحترافية وفعّل الحجز عبر واتساب والتقارير المتقدمة.',
    messageEn:      'Upgrade to Pro — activate WhatsApp booking and advanced reports.',
    channels:       ['in_app'],
    urgency:        'high',
    actionLabelAr:  'ترقية الآن',
    actionLabelEn:  'Upgrade Now',
  },
];

// Returns rules whose trigger time has passed AND whose condition still holds
// AND that have NOT been dismissed yet (send-once guarantee)
export function getPendingFollowUps(state: DoctorFollowUpState): FollowUpRule[] {
  const elapsed = Date.now() - new Date(state.joinedAt).getTime();
  return FOLLOW_UP_RULES.filter(rule => {
    if (state.dismissedRuleIds.includes(rule.id)) return false; // already sent
    if (elapsed < rule.triggerAfterMs)             return false; // too early
    return rule.conditionFn(state);
  });
}
