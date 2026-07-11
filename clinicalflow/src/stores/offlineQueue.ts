// Offline queue — MVP scope: create_patient | create_appointment | queue_update
// Uses localStorage; no IndexedDB complexity needed for this scale.

import { getToken } from '@/utils/authToken';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OfflineActionType = 'create_patient' | 'create_appointment' | 'queue_update';

export interface PendingAction {
  id: string;
  action: OfflineActionType;
  endpoint: string;       // e.g. "/patients", "/appointments"
  method: 'POST' | 'PATCH';
  body: Record<string, unknown>;
  timestamp: string;      // ISO — used for conflict resolution (latest wins)
  clinicId?: string;
  localId?: string;       // temp client-generated id assigned while offline
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const QUEUE_KEY = 'cf_pending_actions';

function load(): PendingAction[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch { return []; }
}

function save(actions: PendingAction[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(actions));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getPendingActions(): PendingAction[] {
  return load();
}

export function getPendingCount(): number {
  return load().length;
}

/** Enqueue an action to be synced later. Deduplicates by localId. */
export function enqueueAction(action: Omit<PendingAction, 'id'>): void {
  const queue = load();
  // STEP 7: conflict — if same localId already queued, keep the one with latest timestamp
  if (action.localId) {
    const existingIdx = queue.findIndex(a => a.localId === action.localId);
    if (existingIdx !== -1) {
      if (action.timestamp > queue[existingIdx].timestamp) {
        queue[existingIdx] = { ...queue[existingIdx], ...action };
        save(queue);
      }
      return;
    }
  }
  queue.push({ ...action, id: crypto.randomUUID() });
  save(queue);
}

/** Remove a successfully synced action by id. */
function dequeue(id: string): void {
  save(load().filter(a => a.id !== id));
}

// ─── STEP 4: Sync logic ───────────────────────────────────────────────────────
// Returns { synced, failed } counts.

export async function syncPendingActions(): Promise<{ synced: number; failed: number }> {
  const queue = load();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  const token = getToken();
  if (!token) return { synced: 0, failed: 0 }; // demo mode — no server to sync to

  // Sort by timestamp ascending so we replay in creation order
  const ordered = [...queue].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  let synced = 0;
  let failed = 0;

  for (const action of ordered) {
    try {
      const res = await fetch(`/api${action.endpoint}`, {
        method: action.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(action.body),
      });

      if (res.ok) {
        dequeue(action.id);
        synced++;
      } else if (res.status === 409 || res.status === 422) {
        // Duplicate / validation error — drop from queue (server already has it)
        dequeue(action.id);
        synced++;
      } else if (res.status === 400) {
        // Bad request — drop to avoid infinite retry
        dequeue(action.id);
      } else {
        // Server error — keep for next attempt
        failed++;
      }
    } catch {
      // Network still down or transient error — keep in queue
      failed++;
    }
  }

  return { synced, failed };
}
