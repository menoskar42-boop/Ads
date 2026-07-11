export type ReminderType = 'confirmation' | '24h' | '2h';
export type ReminderChannel = 'sms' | 'whatsapp' | 'email';

export interface ReminderLog {
  id: string;
  appointmentId: string;
  patientName: string;
  doctorName: string;
  date: string;
  time: string;
  type: ReminderType;
  channel: ReminderChannel;
  status: 'sent' | 'failed';
  sentAt: string;
  message: string;
}

let logs: ReminderLog[] = [];
const listeners: (() => void)[] = [];

const notify = () => listeners.forEach(fn => fn());

export const reminderStore = {
  getAll: () => [...logs],
  getForAppointment: (appointmentId: string) => logs.filter(l => l.appointmentId === appointmentId),
  add: (log: ReminderLog) => {
    logs = [log, ...logs];
    notify();
  },
  subscribe: (fn: () => void) => {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i > -1) listeners.splice(i, 1);
    };
  },
};

export function buildReminderMessage(
  type: ReminderType,
  patientName: string,
  doctorName: string,
  date: string,
  time: string,
  clinicName: string,
  clinicAddress: string,
  language: 'en' | 'ar',
): string {
  if (language === 'ar') {
    switch (type) {
      case 'confirmation':
        return `عزيزي ${patientName}، تم تأكيد موعدك في ${clinicName} بتاريخ ${date} الساعة ${time} مع ${doctorName}. العنوان: ${clinicAddress}`;
      case '24h':
        return `تذكير: لديك موعد غداً الساعة ${time} مع ${doctorName} في ${clinicName}. العنوان: ${clinicAddress}`;
      case '2h':
        return `تذكير: لديك موعد بعد ساعتين الساعة ${time} مع ${doctorName} في ${clinicName}`;
    }
  } else {
    switch (type) {
      case 'confirmation':
        return `Dear ${patientName}, your appointment at ${clinicName} is confirmed for ${date} at ${time} with ${doctorName}. Address: ${clinicAddress}`;
      case '24h':
        return `Reminder: You have an appointment tomorrow at ${time} with ${doctorName} at ${clinicName}. Address: ${clinicAddress}`;
      case '2h':
        return `Reminder: You have an appointment in 2 hours at ${time} with ${doctorName} at ${clinicName}`;
    }
  }
}

export function simulateSendReminder(params: {
  appointmentId: string;
  patientName: string;
  doctorName: string;
  date: string;
  time: string;
  type: ReminderType;
  channel: ReminderChannel;
  clinicName: string;
  clinicAddress: string;
  language: 'en' | 'ar';
}): ReminderLog {
  const message = buildReminderMessage(
    params.type,
    params.patientName,
    params.doctorName,
    params.date,
    params.time,
    params.clinicName,
    params.clinicAddress,
    params.language,
  );

  const log: ReminderLog = {
    id: `rem-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    appointmentId: params.appointmentId,
    patientName: params.patientName,
    doctorName: params.doctorName,
    date: params.date,
    time: params.time,
    type: params.type,
    channel: params.channel,
    status: 'sent',
    sentAt: new Date().toISOString(),
    message,
  };

  reminderStore.add(log);
  return log;
}
