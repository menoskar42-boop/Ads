import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getToken } from '@/utils/authToken';
import { loadFollowUpState, DoctorFollowUpState } from '@/stores/doctorFollowUpStore';
import { AuthUser } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sparkles, X, Loader2 } from 'lucide-react';

// ── Cooldown: show at most once per 30 minutes per session ────────
const COACH_SESSION_KEY = (id: string) => `cf_coach_${id}`;
const COOLDOWN_MS = 30 * 60 * 1000;

function canShowCoach(doctorId: string): boolean {
  try {
    const ts = sessionStorage.getItem(COACH_SESSION_KEY(doctorId));
    return !ts || Date.now() - Number(ts) > COOLDOWN_MS;
  } catch { return true; }
}
function markCoachShown(doctorId: string): void {
  try { sessionStorage.setItem(COACH_SESSION_KEY(doctorId), String(Date.now())); } catch { /* sessionStorage unavailable */ }
}

// ── Stage + context derivation ────────────────────────────────────
type DoctorStage = 'new' | 'started' | 'active' | 'inactive';

interface DoctorContext {
  stage: DoctorStage;
  missingSteps: string[];
}

function deriveContext(state: DoctorFollowUpState): DoctorContext {
  const missingSteps: string[] = [];
  if (!state.has_created_patient)  missingSteps.push('إضافة أول مريض');
  if (!state.has_created_booking)  missingSteps.push('حجز أول موعد');
  if (!state.has_used_ai)          missingSteps.push('تجربة الذكاء الاصطناعي');
  if (!state.has_enabled_whatsapp) missingSteps.push('تفعيل حجز واتساب');

  // Stage logic from spec
  const stage: DoctorStage =
    !state.has_created_patient && !state.has_created_booking ? 'new' :
    state.has_created_patient  && state.has_created_booking  ? 'active' :
    'started';

  return { stage, missingSteps };
}

// ── Static fallbacks (used when AI is unavailable) ────────────────
const FALLBACKS: Record<DoctorStage, string> = {
  new:      'ابدأ بإضافة أول مريض وجرّب طابور الانتظار — ستلاحظ الفرق فوراً! 🚀',
  started:  'خطوة رائعة! الخطوة التالية ستكتمل صورة عيادتك وتزيد من كفاءتها.',
  active:   'عيادتك شغّالة زي الفل! جرّب ميزة الذكاء الاصطناعي لتوفير وقت أكثر. 🤖',
  inactive: 'نفتقدك! عيادتك في انتظارك — جرّب ميزة جديدة النهارده. 🌟',
};

// ── Component ─────────────────────────────────────────────────────

interface DoctorCoachBubbleProps {
  user: AuthUser;
}

const DoctorCoachBubble: React.FC<DoctorCoachBubbleProps> = ({ user }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canShowCoach(user.id)) return;

    const state = loadFollowUpState(user.id);
    const { stage, missingSteps } = deriveContext(state);

    // Nothing left to guide — don't show
    if (missingSteps.length === 0) return;

    setVisible(true);
    markCoachShown(user.id);
    setLoading(true);

    const token = getToken();
    fetch('/api/doctor-coach', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        stage,
        missingSteps,
        doctorName: user.nameAr || user.name,
      }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setMessage(data.message || FALLBACKS[stage]))
      .catch(() => setMessage(FALLBACKS[stage]))
      .finally(() => setLoading(false));
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also re-show after activity updates (custom event from trackActivity)
  useEffect(() => {
    const handler = () => {
      const state = loadFollowUpState(user.id);
      const { missingSteps } = deriveContext(state);
      if (missingSteps.length === 0) setVisible(false);
    };
    window.addEventListener('cf_followup_update', handler);
    return () => window.removeEventListener('cf_followup_update', handler);
  }, [user.id]);

  if (!visible) return null;

  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 to-transparent px-4 py-3"
      data-testid="card-doctor-coach"
    >
      {/* Avatar */}
      <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles className="h-4 w-4 text-primary-foreground" />
      </div>

      {/* Message */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-primary mb-0.5">
          {isAr ? 'مساعدك الذكي' : 'AI Coach'}
        </p>
        {loading ? (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {isAr ? 'يفكر...' : 'Thinking…'}
          </span>
        ) : (
          <p
            className="text-sm text-foreground leading-relaxed"
            data-testid="text-coach-message"
            dir="rtl"
          >
            {message}
          </p>
        )}
      </div>

      {/* Dismiss */}
      <Button
        variant="ghost" size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => setVisible(false)}
        data-testid="button-dismiss-coach"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

export default DoctorCoachBubble;
