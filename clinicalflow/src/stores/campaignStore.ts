import { createStore } from './createStore';

// ─── Types ─────────────────────────────────────────────────────────────────
export type CampaignType    = 'recall' | 'broadcast';
export type CampaignSegment = 'all' | 'no_show' | 'specialty';

export interface Campaign {
  id: string;
  clinicId: string;
  name: string;
  nameAr: string;
  type: CampaignType;
  messageAr: string;
  messageEn: string;
  isActive: boolean;
  // recall: fire if no visit in the last X days
  daysSinceLastVisit?: number;
  // broadcast: which patients
  segment?: CampaignSegment;
  segmentSpecialtyId?: string;
  cooldownDays: number;   // don't re-send to same patient within N days
  lastRunAt?: string;
  createdAt: string;
}

export interface CampaignLog {
  id: string;
  campaignId: string;
  patientId: string;
  phone: string;
  sentAt: string;
  status: 'sent' | 'skipped' | 'failed';
}

// ─── Stores ────────────────────────────────────────────────────────────────
export const campaignStore    = createStore<Campaign>([],    'cf_campaigns');
export const campaignLogStore = createStore<CampaignLog>([], 'cf_campaign_logs');

// ─── Default message templates ────────────────────────────────────────────
export const RECALL_TEMPLATE_AR    = 'مرحباً {{name}}! مرّ {{days}} يوم على آخر زيارة للعيادة. هل تودّ حجز موعد متابعة؟';
export const BROADCAST_TEMPLATE_AR = 'مرحباً {{name}}! رسالة من عيادتنا.';
export const RECALL_TEMPLATE_EN    = 'Hi {{name}}! It has been {{days}} days since your last visit. Would you like to book a follow-up?';
export const BROADCAST_TEMPLATE_EN = 'Hi {{name}}! A message from our clinic.';

// ─── Template renderer ─────────────────────────────────────────────────────
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

// ─── Cooldown guard ────────────────────────────────────────────────────────
// Returns true if a "sent" log entry exists within the cooldown window.
export function isInCooldown(campaignId: string, patientId: string, cooldownDays: number): boolean {
  const log = campaignLogStore.get(
    l => l.campaignId === campaignId && l.patientId === patientId && l.status === 'sent',
  );
  if (!log) return false;
  return Date.now() - new Date(log.sentAt).getTime() < cooldownDays * 86_400_000;
}

// ─── Log helper ────────────────────────────────────────────────────────────
export function logCampaignSend(entry: Omit<CampaignLog, 'id'>): void {
  // Remove stale entry for same patient+campaign before inserting fresh one
  campaignLogStore.remove(
    l => l.campaignId === entry.campaignId && l.patientId === entry.patientId,
  );
  campaignLogStore.add({
    ...entry,
    id: `clog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
}
