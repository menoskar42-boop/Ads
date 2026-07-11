// Patient reminders — medication + appointment (STEP 5)
const KEY = 'cf_patient_reminders';

export type ReminderType = 'medication' | 'appointment';

export interface PatientReminder {
  id: string;
  patientId: string;
  type: ReminderType;
  label: string;
  labelAr: string;
  timeHHMM: string;    // "08:00"
  daysOfWeek: number[]; // 0=Sun…6=Sat; empty = daily
  enabled: boolean;
  refId?: string;      // medicationId or appointmentId
  createdAt: string;
}

function load(): PatientReminder[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function persist(items: PatientReminder[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage full */ }
}

export function getReminders(patientId: string): PatientReminder[] {
  return load().filter(r => r.patientId === patientId);
}

export function addReminder(r: Omit<PatientReminder, 'id' | 'createdAt'>): PatientReminder {
  const items = load();
  const item: PatientReminder = { ...r, id: `rem-${Date.now()}`, createdAt: new Date().toISOString() };
  items.push(item);
  persist(items);
  return item;
}

export function toggleReminder(id: string): boolean {
  const items = load();
  const idx = items.findIndex(r => r.id === id);
  if (idx === -1) return false;
  items[idx].enabled = !items[idx].enabled;
  persist(items);
  return items[idx].enabled;
}

export function deleteReminder(id: string): boolean {
  const items = load();
  const filtered = items.filter(r => r.id !== id);
  if (filtered.length === items.length) return false;
  persist(filtered);
  return true;
}

// Returns reminders that should fire within the next `windowMinutes` minutes
export function getDueReminders(patientId: string, windowMinutes = 5): PatientReminder[] {
  const now = new Date();
  const hh = now.getHours();
  const mm = now.getMinutes();
  const dow = now.getDay();
  return getReminders(patientId).filter(r => {
    if (!r.enabled) return false;
    const [rh, rm] = r.timeHHMM.split(':').map(Number);
    if (r.daysOfWeek.length > 0 && !r.daysOfWeek.includes(dow)) return false;
    const diffMin = (rh * 60 + rm) - (hh * 60 + mm);
    return diffMin >= 0 && diffMin < windowMinutes;
  });
}
