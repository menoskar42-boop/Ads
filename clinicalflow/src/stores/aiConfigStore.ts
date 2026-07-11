export interface AIConfig {
  globallyEnabled: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPromptEn: string;
  systemPromptAr: string;
  bookingInstructions: string;
  apiKeyStatus: 'configured' | 'missing';
}

const DEFAULT_CONFIG: AIConfig = {
  globallyEnabled: true,
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 800,
  systemPromptEn: 'You are a smart medical booking assistant for Egyptian clinics. Help patients find suitable appointment slots, answer questions about clinic services, and guide them through the booking process professionally.',
  systemPromptAr: 'أنت مساعد حجز طبي ذكي للعيادات المصرية. ساعد المرضى في إيجاد مواعيد مناسبة والإجابة على أسئلتهم حول خدمات العيادة وإرشادهم خلال عملية الحجز باحترافية.',
  bookingInstructions: 'Always confirm patient name, preferred date, and doctor specialty. Suggest available slots within working hours (9 AM – 9 PM). Mention examination fees when asked.',
  apiKeyStatus: 'configured',
};

let config: AIConfig = { ...DEFAULT_CONFIG };

const listeners: (() => void)[] = [];

export const aiConfigStore = {
  get(): AIConfig {
    return { ...config };
  },
  update(partial: Partial<AIConfig>) {
    config = { ...config, ...partial };
    listeners.forEach(fn => fn());
  },
  subscribe(fn: () => void) {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i > -1) listeners.splice(i, 1);
    };
  },
  reset() {
    config = { ...DEFAULT_CONFIG };
    listeners.forEach(fn => fn());
  },
};
