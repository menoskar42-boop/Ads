// auditStore.ts — client-side audit log (STEP 2)
// Persisted to localStorage: cf_audit_logs_v1
// Auto-inserted by store wrappers and explicit calls.

export type AuditAction   = 'create' | 'update' | 'delete' | 'view' | 'login' | 'logout' | 'export' | 'denied';
export type AuditEntity   = 'patient' | 'appointment' | 'invoice' | 'user' | 'prescription' | 'document' | 'inventory' | 'claim' | 'report' | 'settings';
export type AuditSeverity = 'info' | 'warn' | 'critical';

export interface AuditLog {
  id: string;
  userId?: string;
  userName?: string;
  clinicId: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  description: string;
  severity: AuditSeverity;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const KEY     = 'cf_audit_logs_v1';
const MAX_LOGS = 2000; // cap to avoid localStorage bloat

function load(): AuditLog[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function save(data: AuditLog[]) {
  localStorage.setItem(KEY, JSON.stringify(data));
}
function genId() { return `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

// ─── Core write ───────────────────────────────────────────────────────────────
export function logAudit(entry: Omit<AuditLog, 'id' | 'createdAt'>): AuditLog {
  const log: AuditLog = { ...entry, id: genId(), createdAt: new Date().toISOString() };
  const all = load();
  all.push(log);
  // Trim oldest first if over cap
  const trimmed = all.length > MAX_LOGS ? all.slice(all.length - MAX_LOGS) : all;
  save(trimmed);
  return log;
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────
export function auditCreate(params: { userId?: string; userName?: string; clinicId: string; entity: AuditEntity; entityId?: string; description?: string; metadata?: Record<string, unknown> }) {
  return logAudit({ ...params, action: 'create', severity: 'info', description: params.description ?? `Created ${params.entity} ${params.entityId ?? ''}` });
}
export function auditUpdate(params: { userId?: string; userName?: string; clinicId: string; entity: AuditEntity; entityId?: string; description?: string; metadata?: Record<string, unknown> }) {
  return logAudit({ ...params, action: 'update', severity: 'info', description: params.description ?? `Updated ${params.entity} ${params.entityId ?? ''}` });
}
export function auditDelete(params: { userId?: string; userName?: string; clinicId: string; entity: AuditEntity; entityId?: string; description?: string }) {
  return logAudit({ ...params, action: 'delete', severity: 'warn', description: params.description ?? `Deleted ${params.entity} ${params.entityId ?? ''}` });
}
export function auditView(params: { userId?: string; userName?: string; clinicId: string; entity: AuditEntity; entityId?: string; description?: string }) {
  return logAudit({ ...params, action: 'view', severity: 'info', description: params.description ?? `Viewed ${params.entity} ${params.entityId ?? ''}` });
}
export function auditLogin(params: { userId: string; userName?: string; clinicId: string }) {
  return logAudit({ ...params, action: 'login', entity: 'user', entityId: params.userId, severity: 'info', description: `User logged in` });
}
export function auditLogout(params: { userId: string; userName?: string; clinicId: string; reason?: string }) {
  return logAudit({ ...params, action: 'logout', entity: 'user', entityId: params.userId, severity: 'info', description: `User logged out${params.reason ? ` (${params.reason})` : ''}` });
}
export function auditDenied(params: { userId?: string; userName?: string; clinicId: string; entity: AuditEntity; entityId?: string; description?: string }) {
  return logAudit({ ...params, action: 'denied', severity: 'warn', description: params.description ?? `Access denied to ${params.entity}` });
}

// ─── Queries ──────────────────────────────────────────────────────────────────
export function getClinicAuditLogs(clinicId: string, limit = 200): AuditLog[] {
  return load()
    .filter(l => l.clinicId === clinicId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function getAuditLogsForUser(clinicId: string, userId: string): AuditLog[] {
  return load()
    .filter(l => l.clinicId === clinicId && l.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getAuditLogsForEntity(clinicId: string, entity: AuditEntity, entityId: string): AuditLog[] {
  return load()
    .filter(l => l.clinicId === clinicId && l.entity === entity && l.entityId === entityId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getWarningLogs(clinicId: string): AuditLog[] {
  return load()
    .filter(l => l.clinicId === clinicId && (l.severity === 'warn' || l.severity === 'critical'))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function clearOldLogs(clinicId: string, olderThanDays = 90): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  const cutoffStr = cutoff.toISOString();
  const all = load();
  const kept = all.filter(l => l.clinicId !== clinicId || l.createdAt >= cutoffStr);
  save(kept);
  return all.length - kept.length;
}

// ─── Suspicious activity detection (STEP 5) ──────────────────────────────────
export interface SecurityEvent {
  id: string;
  clinicId: string;
  userId?: string;
  eventType: 'failed_login' | 'brute_force' | 'mass_export' | 'unauthorized_access' | 'session_expired' | 'concurrent_session';
  description: string;
  resolved: boolean;
  createdAt: string;
}

const SEC_KEY = 'cf_security_events_v1';
function loadSec(): SecurityEvent[] { try { return JSON.parse(localStorage.getItem(SEC_KEY) || '[]'); } catch { return []; } }
function saveSec(d: SecurityEvent[]) { localStorage.setItem(SEC_KEY, JSON.stringify(d)); }

export function recordSecurityEvent(ev: Omit<SecurityEvent, 'id' | 'createdAt'>): SecurityEvent {
  const event: SecurityEvent = { ...ev, id: `sec-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, createdAt: new Date().toISOString() };
  const all = loadSec();
  all.push(event);
  saveSec(all.slice(-500));
  // Also log as critical audit entry
  logAudit({ clinicId: ev.clinicId, userId: ev.userId, action: 'denied', entity: 'user', severity: 'critical', description: `[SECURITY] ${ev.description}` });
  return event;
}

export function getSecurityEvents(clinicId: string, includeResolved = false): SecurityEvent[] {
  return loadSec()
    .filter(e => e.clinicId === clinicId && (includeResolved || !e.resolved))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function resolveSecurityEvent(id: string): void {
  saveSec(loadSec().map(e => e.id === id ? { ...e, resolved: true } : e));
}

// ─── Brute-force detection — call after each failed login ─────────────────────
const _loginAttempts: Record<string, number[]> = {}; // key = "userId|ip"

export function trackLoginAttempt(key: string, clinicId: string, userId?: string): void {
  const now = Date.now();
  if (!_loginAttempts[key]) _loginAttempts[key] = [];
  _loginAttempts[key] = _loginAttempts[key].filter(t => now - t < 10 * 60 * 1000); // 10-min window
  _loginAttempts[key].push(now);
  if (_loginAttempts[key].length >= 5) {
    recordSecurityEvent({ clinicId, userId, eventType: 'brute_force', resolved: false, description: `5+ failed login attempts in 10 minutes for key: ${key}` });
    _loginAttempts[key] = [];
  }
}

// ─── Mass-export detection ────────────────────────────────────────────────────
const _exportCounts: Record<string, number[]> = {};

export function trackExport(userId: string, clinicId: string, entity: string): void {
  const key = `${userId}:${clinicId}`;
  const now = Date.now();
  if (!_exportCounts[key]) _exportCounts[key] = [];
  _exportCounts[key] = _exportCounts[key].filter(t => now - t < 60 * 1000); // 1-min window
  _exportCounts[key].push(now);
  logAudit({ userId, clinicId, action: 'export', entity: entity as AuditEntity, severity: 'info', description: `Exported ${entity}` });
  if (_exportCounts[key].length >= 10) {
    recordSecurityEvent({ clinicId, userId, eventType: 'mass_export', resolved: false, description: `${_exportCounts[key].length} exports in 1 minute by user ${userId}` });
    _exportCounts[key] = [];
  }
}
