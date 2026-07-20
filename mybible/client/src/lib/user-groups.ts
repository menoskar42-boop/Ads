export interface UserGroupEntry {
  groupId: string;
  groupName: string;
  churchName: string;
  role: 'admin' | 'member';
  userName: string;
  memberKey: string;
}

const STORAGE_KEY = 'userGroups';

export function getUserGroups(): UserGroupEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addUserGroup(entry: UserGroupEntry): void {
  const groups = getUserGroups();
  const idx = groups.findIndex(g => g.groupId === entry.groupId);
  if (idx >= 0) {
    groups[idx] = entry;
  } else {
    groups.push(entry);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

export function removeUserGroup(groupId: string): void {
  const groups = getUserGroups().filter(g => g.groupId !== groupId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  localStorage.removeItem(`group_${groupId}`);
}

export function clearUserGroups(): void {
  const groups = getUserGroups();
  for (const g of groups) {
    localStorage.removeItem(`group_${g.groupId}`);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
}

export function getUserGroupEntry(groupId: string): UserGroupEntry | null {
  return getUserGroups().find(g => g.groupId === groupId) || null;
}

export function updateUserGroupRole(groupId: string, role: 'admin' | 'member'): void {
  const groups = getUserGroups();
  const idx = groups.findIndex(g => g.groupId === groupId);
  if (idx >= 0) {
    groups[idx].role = role;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  }
}

export function migrateOldStorage(): void {
  try {
    const old = localStorage.getItem('readingGroup');
    if (old) {
      const data = JSON.parse(old);
      if (data.groupId) {
        const existing = getUserGroups();
        if (!existing.find(g => g.groupId === data.groupId)) {
          const oldGroupData = localStorage.getItem(`group_${data.groupId}`);
          let role: 'admin' | 'member' = 'member';
          let memberKey = '';
          if (oldGroupData) {
            const parsed = JSON.parse(oldGroupData);
            role = parsed.isLeader ? 'admin' : 'member';
            memberKey = parsed.memberKey || '';
          }
          addUserGroup({
            groupId: data.groupId,
            groupName: data.groupName || '',
            churchName: data.churchName || '',
            role,
            userName: data.userName || '',
            memberKey,
          });
        }
      }
      localStorage.removeItem('readingGroup');
    }
  } catch {}
}
