import { createStore } from './createStore';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ApiScope =
  | 'patients:read' | 'patients:write'
  | 'appointments:read' | 'appointments:write'
  | 'invoices:read';

export interface ApiKey {
  id: string;
  clinicId: string;
  name: string;
  apiKey: string;
  scopes: ApiScope[];
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

export type WebhookEventType =
  | 'appointment_created'
  | 'payment_done'
  | 'patient_created'
  | 'lab_result';

export interface Webhook {
  id: string;
  clinicId: string;
  name: string;
  eventType: WebhookEventType;
  url: string;
  secret?: string;
  isActive: boolean;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  payload: Record<string, unknown>;
  statusCode?: number;
  error?: string;
  deliveredAt: string;
}

// ─── Stores ──────────────────────────────────────────────────────────────────

const API_KEYS_KEY   = 'cf_api_keys';
const WEBHOOKS_KEY   = 'cf_webhooks';
const DELIVERIES_KEY = 'cf_webhook_deliveries';

export const apiKeyStore    = createStore<ApiKey>([], API_KEYS_KEY);
export const webhookStore   = createStore<Webhook>([], WEBHOOKS_KEY);
export const deliveryStore  = createStore<WebhookDelivery>([], DELIVERIES_KEY);

// ─── API Key helpers ─────────────────────────────────────────────────────────

function generateApiKey(): string {
  const prefix = 'cfk_';
  const bytes  = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function getApiKeysForClinic(clinicId: string): ApiKey[] {
  return apiKeyStore.filter(k => k.clinicId === clinicId);
}

export function createApiKey(clinicId: string, name: string, scopes: ApiScope[]): ApiKey {
  const key: ApiKey = {
    id: crypto.randomUUID(),
    clinicId,
    name,
    apiKey: generateApiKey(),
    scopes,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  apiKeyStore.add(key);
  return key;
}

export function revokeApiKey(id: string): void {
  apiKeyStore.update(k => k.id === id, { isActive: false });
}

export function deleteApiKey(id: string): void {
  apiKeyStore.remove(k => k.id === id);
}

// ─── Webhook helpers ──────────────────────────────────────────────────────────

export function getWebhooksForClinic(clinicId: string): Webhook[] {
  return webhookStore.filter(w => w.clinicId === clinicId);
}

export function addWebhook(
  clinicId: string,
  name: string,
  eventType: WebhookEventType,
  url: string,
  secret?: string,
): Webhook {
  const wh: Webhook = {
    id: crypto.randomUUID(),
    clinicId,
    name,
    eventType,
    url,
    secret,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  webhookStore.add(wh);
  return wh;
}

export function updateWebhook(id: string, updates: Partial<Webhook>): void {
  webhookStore.update(w => w.id === id, updates);
}

export function deleteWebhook(id: string): void {
  webhookStore.remove(w => w.id === id);
}

// ─── Webhook delivery (client-side fire-and-forget for demo mode) ─────────────

export function fireWebhooks(
  clinicId: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>,
): void {
  const hooks = webhookStore.filter(
    w => w.clinicId === clinicId && w.eventType === eventType && w.isActive,
  );
  for (const hook of hooks) {
    const id = crypto.randomUUID();
    const deliveredAt = new Date().toISOString();
    fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Clinic-Event': eventType,
        'X-Delivery-Id': id,
        ...(hook.secret ? { 'X-Webhook-Secret': hook.secret } : {}),
      },
      body: JSON.stringify({ event: eventType, clinicId, ...payload }),
    })
      .then(r => {
        deliveryStore.add({ id, webhookId: hook.id, eventType, payload, statusCode: r.status, deliveredAt });
      })
      .catch(err => {
        deliveryStore.add({ id, webhookId: hook.id, eventType, payload, error: String(err), deliveredAt });
      });
  }
}

// ─── Delivery log helpers ─────────────────────────────────────────────────────

export function getDeliveriesForClinic(clinicId: string, limit = 50): WebhookDelivery[] {
  const hookIds = new Set(webhookStore.filter(w => w.clinicId === clinicId).map(w => w.id));
  return deliveryStore
    .filter(d => hookIds.has(d.webhookId))
    .slice(-limit)
    .reverse();
}
