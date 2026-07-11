import { createStore } from './createStore';

export interface ChatbotScenario {
  id: string;
  clinicId: string;
  trigger: string;
  reply: string;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
}

export interface ChatbotSettings {
  id?: string;
  clinicId: string;
  isEnabled: boolean;
  welcomeMessage: string;
  outOfHoursMessage: string;
  bookingUrl: string;
  clinicPhone: string;
}

export const chatbotScenarioStore = createStore<ChatbotScenario>([], 'cf_chatbot_scenarios');
export const chatbotSettingsStore = createStore<ChatbotSettings>([], 'cf_chatbot_settings');

export const DEFAULT_SCENARIOS: Omit<ChatbotScenario, 'id' | 'clinicId' | 'createdAt'>[] = [
  { trigger: 'حجز موعد', reply: 'أهلاً بك! 😊 يمكنك حجز موعدك بسهولة من هنا: {bookingUrl}\nأو تواصل معنا: {phone}', isActive: true, usageCount: 0 },
  { trigger: 'كم سعر الكشف', reply: 'أهلاً! للاستفسار عن الأسعار يرجى التواصل مع الاستقبال على {phone} أو زيارتنا خلال أوقات العمل 🏥', isActive: true, usageCount: 0 },
  { trigger: 'إلغاء موعد', reply: 'نأسف لسماع ذلك! للإلغاء يرجى الاتصال بنا على {phone} وسنساعدك فوراً. شكراً لإبلاغنا مسبقاً 🙏', isActive: true, usageCount: 0 },
  { trigger: 'مواعيد العمل', reply: '⏰ أوقات عملنا:\nالأحد - الخميس: 9 ص - 9 م\nالجمعة: 4 م - 9 م\nللحجز: {phone}', isActive: true, usageCount: 0 },
  { trigger: 'where are you', reply: 'Our clinic is located at {address}. You can also book online at: {bookingUrl} 📍', isActive: true, usageCount: 0 },
  { trigger: 'book appointment', reply: 'Hello! 😊 Book your appointment easily here: {bookingUrl}\nOr call us: {phone}', isActive: true, usageCount: 0 },
  { trigger: 'emergency', reply: '🚨 For emergencies please call 123 (ambulance) or come directly to our clinic. For urgent appointments call: {phone}', isActive: true, usageCount: 0 },
  { trigger: 'شكراً', reply: 'العفو! نتمنى لك دوام الصحة والعافية 💙 لأي استفسار نحن دائماً هنا.', isActive: true, usageCount: 0 },
];
