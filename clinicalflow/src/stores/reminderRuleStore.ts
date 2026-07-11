import { createStore } from './createStore';

export type ReminderTrigger = '24h_before' | '2h_before' | 'post_visit' | 'no_show';

export interface ReminderRule {
  id: string;
  clinicId: string;
  trigger: ReminderTrigger;
  channel: 'whatsapp' | 'sms';
  templateAr: string;
  templateEn: string;
  isActive: boolean;
  createdAt: string;
}

export const reminderRuleStore = createStore<ReminderRule>([
  { id: 'rule-24h', clinicId: '', trigger: '24h_before', channel: 'whatsapp', templateAr: 'مرحباً {{name}}، تذكير بموعدك غداً {{date}} الساعة {{time}} مع {{doctor}} في {{clinic}}.', templateEn: 'Hi {{name}}, reminder: your appointment is tomorrow {{date}} at {{time}} with {{doctor}} at {{clinic}}.', isActive: true, createdAt: new Date().toISOString() },
  { id: 'rule-2h',  clinicId: '', trigger: '2h_before',  channel: 'whatsapp', templateAr: 'تذكير: موعدك بعد ساعتين الساعة {{time}} مع {{doctor}}. نراك قريباً 🏥', templateEn: 'Reminder: your appointment is in 2 hours at {{time}} with Dr. {{doctor}}. See you soon! 🏥', isActive: true, createdAt: new Date().toISOString() },
  { id: 'rule-post', clinicId: '', trigger: 'post_visit', channel: 'whatsapp', templateAr: 'شكراً لزيارتك {{name}}! نتمنى لك الشفاء العاجل. 💙', templateEn: 'Thank you for your visit, {{name}}! Wishing you a speedy recovery. 💙', isActive: false, createdAt: new Date().toISOString() },
], 'cf_reminder_rules');
