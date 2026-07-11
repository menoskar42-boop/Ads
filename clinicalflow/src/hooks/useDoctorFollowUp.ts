import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  loadFollowUpState,
  getPendingFollowUps,
  dismissFollowUpRule,
  trackActivity as trackAct,
  FollowUpRule,
  DoctorActivity,
} from '@/stores/doctorFollowUpStore';
import { toast } from 'sonner';

export const useDoctorFollowUp = () => {
  const { user }       = useAuth();
  const { language }   = useLanguage();
  const isDoctor       = user?.role === 'doctor';
  const isAr           = language === 'ar';

  const [pendingRules, setPendingRules] = useState<FollowUpRule[]>([]);
  const shownToastIds = useRef<Set<string>>(new Set());

  const refresh = useCallback(() => {
    if (!isDoctor || !user) return;

    const state   = loadFollowUpState(user.id);
    const pending = getPendingFollowUps(state);

    setPendingRules(prev => {
      const prevIds = prev.map(r => r.id).sort().join(',');
      const nextIds = pending.map(r => r.id).sort().join(',');
      if (prevIds === nextIds) return prev; // avoid unnecessary re-render
      return pending;
    });

    // Fire a sonner toast once per rule (spam-free — tracks shown IDs in a ref)
    pending.forEach(rule => {
      if (shownToastIds.current.has(rule.id)) return;
      shownToastIds.current.add(rule.id);

      // Console log for debugging / future channel integration
      console.log(`[FollowUp][${rule.channels.join('/')}] ${rule.id}:`, isAr ? rule.messageAr : rule.messageEn);

      toast.info(isAr ? rule.titleAr : rule.titleEn, {
        description: isAr ? rule.messageAr : rule.messageEn,
        duration:    8000,
        id:          rule.id, // deduplicate toasts with same id
      });
    });
  }, [user?.id, isDoctor, isAr]);

  // Run on mount + every 60 s
  useEffect(() => {
    if (!isDoctor) return;
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh, isDoctor]);

  // React immediately when trackActivity() fires a custom event
  useEffect(() => {
    if (!isDoctor) return;
    const handler = () => refresh();
    window.addEventListener('cf_followup_update', handler);
    return () => window.removeEventListener('cf_followup_update', handler);
  }, [refresh, isDoctor]);

  // Dismiss a rule (mark as sent — send-once guarantee)
  const dismiss = useCallback((ruleId: string) => {
    if (!user) return;
    dismissFollowUpRule(user.id, ruleId);
    setPendingRules(prev => prev.filter(r => r.id !== ruleId));
  }, [user?.id]);

  // Track an activity and immediately refresh pending rules
  const trackActivity = useCallback((activity: DoctorActivity) => {
    if (!user) return;
    trackAct(user.id, activity);
    // refresh is triggered via the custom event fired by trackAct
  }, [user?.id]);

  return { pendingRules, dismiss, trackActivity };
};
