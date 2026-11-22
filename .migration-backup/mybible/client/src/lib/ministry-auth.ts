export interface MinistryUser {
  id: string;
  name: string;
  phone: string;
  role: 'admin' | 'user';
}

const STORAGE_KEY = 'currentMinistryUser';

export function getMinistryUser(): MinistryUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setMinistryUser(user: MinistryUser): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearMinistryUser(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function generateUserId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

export function generateUserIdFromPhone(phone: string): string {
  let hash = 0;
  const normalized = phone.replace(/\D/g, '');
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  return 'u' + Math.abs(hash).toString(36) + normalized.slice(-4);
}

export function isAdmin(): boolean {
  const user = getMinistryUser();
  return user?.role === 'admin';
}
