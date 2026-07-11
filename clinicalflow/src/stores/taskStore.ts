// ─── taskStore.ts ─────────────────────────────────────────────────────────────
// Staff task management
// localStorage key: cf_staff_tasks_v1

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface StaffTask {
  id: string;
  clinicId: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  assignedToId: string;   // userId
  assignedById: string;   // userId
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;        // ISO date YYYY-MM-DD
  completedAt?: string;
  createdAt: string;
}

// ─── Persistence helpers ──────────────────────────────────────────────────────
const TASKS_KEY = 'cf_staff_tasks_v1';

function loadTasks(): StaffTask[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTasks(data: StaffTask[]): void {
  localStorage.setItem(TASKS_KEY, JSON.stringify(data));
}

function genId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Task API ─────────────────────────────────────────────────────────────────
export function getClinicTasks(clinicId: string): StaffTask[] {
  return loadTasks().filter(t => t.clinicId === clinicId);
}

export function getTasksForUser(userId: string, clinicId: string): StaffTask[] {
  return loadTasks().filter(t => t.assignedToId === userId && t.clinicId === clinicId);
}

export function addTask(data: Omit<StaffTask, 'id' | 'createdAt'>): StaffTask {
  const task: StaffTask = {
    ...data,
    id: genId(),
    createdAt: new Date().toISOString(),
  };
  const all = loadTasks();
  all.push(task);
  saveTasks(all);
  return task;
}

export function updateTask(id: string, data: Partial<StaffTask>): void {
  const all = loadTasks();
  const idx = all.findIndex(t => t.id === id);
  if (idx !== -1) {
    all[idx] = { ...all[idx], ...data };
    saveTasks(all);
  }
}

export function deleteTask(id: string): void {
  saveTasks(loadTasks().filter(t => t.id !== id));
}

export function completeTask(id: string): void {
  updateTask(id, { status: 'completed', completedAt: new Date().toISOString() });
}

// ─── Seed demo tasks (runs once) ──────────────────────────────────────────────
const SEED_KEY = 'cf_tasks_seeded_v1';

function seedDemoTasks() {
  if (localStorage.getItem(SEED_KEY)) return;

  const today = new Date();
  const fmtDate = (offset: number): string => {
    const d = new Date(today.getTime() + offset * 86400000);
    return d.toISOString().split('T')[0];
  };

  const seeds: StaffTask[] = [
    {
      id: 'task-seed-1',
      clinicId: 'clinic-1',
      title: 'Prepare examination room',
      titleAr: 'تجهيز غرفة الفحص',
      description: 'Clean and prepare room 2 for afternoon patients',
      descriptionAr: 'تنظيف وتجهيز غرفة رقم 2 لمرضى فترة العصر',
      assignedToId: 'u-5',
      assignedById: 'u-1',
      priority: 'high',
      status: 'pending',
      dueDate: fmtDate(0),
      createdAt: new Date().toISOString(),
    },
    {
      id: 'task-seed-2',
      clinicId: 'clinic-1',
      title: 'Follow up on patient lab results',
      titleAr: 'متابعة نتائج تحاليل المريض أحمد',
      description: 'Contact patient Ahmed Mohamed regarding lab results',
      descriptionAr: 'التواصل مع المريض أحمد محمد بخصوص نتائج التحاليل',
      assignedToId: 'u-2',
      assignedById: 'u-1',
      priority: 'urgent',
      status: 'in_progress',
      dueDate: fmtDate(1),
      createdAt: new Date().toISOString(),
    },
    {
      id: 'task-seed-3',
      clinicId: 'clinic-1',
      title: 'Update patient files',
      titleAr: 'تحديث ملفات المرضى',
      description: 'Update medical records for last week appointments',
      descriptionAr: 'تحديث السجلات الطبية لمواعيد الأسبوع الماضي',
      assignedToId: 'u-5',
      assignedById: 'u-1',
      priority: 'medium',
      status: 'pending',
      dueDate: fmtDate(3),
      createdAt: new Date().toISOString(),
    },
  ];

  const existing = loadTasks();
  const merged = [
    ...existing,
    ...seeds.filter(s => !existing.some(e => e.id === s.id)),
  ];
  saveTasks(merged);
  localStorage.setItem(SEED_KEY, '1');
}

seedDemoTasks();
