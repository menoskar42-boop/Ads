import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Lock, Copy, Check, Plus, Trash2, Key, Webhook, Zap, BookOpen, Globe, ChevronDown, ChevronRight } from 'lucide-react';
import {
  getApiKeysForClinic, createApiKey, deleteApiKey, revokeApiKey,
  getWebhooksForClinic, addWebhook, deleteWebhook,
  ApiKey, Webhook as WebhookType, ApiScope, WebhookEventType,
} from '@/stores/apiKeyStore';
import { getToken } from '@/utils/authToken';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

// ─── Constants ───────────────────────────────────────────────────────────────

const ALL_SCOPES: ApiScope[] = [
  'patients:read', 'patients:write',
  'appointments:read', 'appointments:write',
  'invoices:read',
];

const WEBHOOK_EVENTS: WebhookEventType[] = [
  'appointment_created', 'payment_done', 'patient_created', 'lab_result',
];

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';

const ENDPOINTS = [
  {
    method: 'GET',  path: '/api/v1/patients',          scope: 'patients:read',
    desc: 'List patients (scoped to clinic). Supports ?search=&page=&limit=',
    example: `curl -H "X-API-Key: cfk_..." "${BASE_URL}/api/v1/patients?limit=20"`,
  },
  {
    method: 'POST', path: '/api/v1/patients',          scope: 'patients:write',
    desc: 'Create a new patient.',
    example: `curl -X POST -H "X-API-Key: cfk_..." -H "Content-Type: application/json" \\\n  -d '{"name":"Ahmed","phone":"01012345678"}' \\\n  "${BASE_URL}/api/v1/patients"`,
  },
  {
    method: 'GET',  path: '/api/v1/appointments',      scope: 'appointments:read',
    desc: 'List appointments. Supports ?date=YYYY-MM-DD&doctorId=&status=',
    example: `curl -H "X-API-Key: cfk_..." "${BASE_URL}/api/v1/appointments?date=2026-04-18"`,
  },
  {
    method: 'POST', path: '/api/v1/appointments',      scope: 'appointments:write',
    desc: 'Create a new appointment.',
    example: `curl -X POST -H "X-API-Key: cfk_..." -H "Content-Type: application/json" \\\n  -d '{"patientId":"...","doctorId":"...","date":"2026-04-20","time":"10:00"}' \\\n  "${BASE_URL}/api/v1/appointments"`,
  },
  {
    method: 'GET',  path: '/api/v1/invoices',          scope: 'invoices:read',
    desc: 'List invoices. Supports ?status=pending|paid&patientId=',
    example: `curl -H "X-API-Key: cfk_..." "${BASE_URL}/api/v1/invoices?status=pending"`,
  },
  {
    method: 'POST', path: '/api/integrations/lab-results', scope: 'patients:write',
    desc: 'Push lab results from an external LIS. Fires lab_result webhook.',
    example: `curl -X POST -H "X-API-Key: cfk_..." -H "Content-Type: application/json" \\\n  -d '{"patientId":"...","results":{"WBC":6.5},"testedAt":"2026-04-18T09:00:00Z"}' \\\n  "${BASE_URL}/api/integrations/lab-results"`,
  },
  {
    method: 'POST', path: '/api/integrations/payment-notify', scope: '(shared secret)',
    desc: 'Payment gateway callback. Use X-Payment-Secret header matching PAYMENT_WEBHOOK_SECRET env var.',
    example: `curl -X POST -H "X-Payment-Secret: ..." -H "Content-Type: application/json" \\\n  -d '{"clinicId":"...","invoiceId":"...","amount":150,"success":true}' \\\n  "${BASE_URL}/api/integrations/payment-notify"`,
  },
];

const METHOD_COLOR: Record<string, string> = {
  GET:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  POST:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  PATCH:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <button onClick={copy} className="ml-2 text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function EndpointCard({ ep }: { ep: typeof ENDPOINTS[0] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <Badge className={`text-xs font-mono ${METHOD_COLOR[ep.method] || ''}`}>{ep.method}</Badge>
        <code className="text-xs font-mono text-foreground flex-1">{ep.path}</code>
        <Badge variant="outline" className="text-[10px] hidden sm:flex">{ep.scope}</Badge>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <CardContent className="border-t pt-3 pb-4 space-y-3">
          <p className="text-sm text-muted-foreground">{ep.desc}</p>
          <div className="relative bg-muted rounded-md p-3">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground">{ep.example}</pre>
            <div className="absolute top-2 right-2"><CopyButton text={ep.example} /></div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApiDocs() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const permissions = usePermissions();
  const { toast } = useToast();
  const isAr = language === 'ar';
  const clinicId = user?.clinicId ?? '';
  const token = getToken();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hooks, setHooks] = useState<WebhookType[]>([]);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [hookDialogOpen, setHookDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [keyScopes, setKeyScopes] = useState<ApiScope[]>(['patients:read', 'appointments:read', 'invoices:read']);
  const [hookForm, setHookForm] = useState({ name: '', eventType: 'appointment_created' as WebhookEventType, url: '', secret: '' });
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);

  const refreshKeys  = () => setKeys(getApiKeysForClinic(clinicId));
  const refreshHooks = () => setHooks(getWebhooksForClinic(clinicId));

  useEffect(() => { refreshKeys(); refreshHooks(); }, [clinicId]);

  if (!permissions.canViewSettings) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Lock className="h-8 w-8" />
        <p>{isAr ? 'غير مصرح' : 'Access denied'}</p>
      </div>
    );
  }

  // API calls (Supabase mode) vs localStorage (demo mode)
  const handleCreateKey = async () => {
    if (!keyName.trim()) return;
    if (token) {
      const r = await fetch('/api/api-keys', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: keyName, scopes: keyScopes }) });
      if (r.ok) { const d = await r.json(); setNewKeyValue(d.api_key); refreshKeys(); }
      else toast({ title: 'Error creating key', variant: 'destructive' });
    } else {
      const k = createApiKey(clinicId, keyName, keyScopes);
      setNewKeyValue(k.apiKey);
      refreshKeys();
    }
    setKeyName('');
    setKeyDialogOpen(false);
    toast({ title: isAr ? 'تم إنشاء المفتاح' : 'API key created' });
  };

  const handleDeleteKey = async (id: string) => {
    if (token) {
      await fetch(`/api/api-keys/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    } else {
      deleteApiKey(id);
    }
    refreshKeys();
    toast({ title: isAr ? 'تم حذف المفتاح' : 'Key revoked' });
  };

  const handleCreateHook = async () => {
    if (!hookForm.url.trim() || !hookForm.eventType) return;
    if (token) {
      const r = await fetch('/api/webhooks', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: hookForm.name, eventType: hookForm.eventType, url: hookForm.url, secret: hookForm.secret || undefined }) });
      if (!r.ok) { toast({ title: 'Error creating webhook', variant: 'destructive' }); return; }
    } else {
      addWebhook(clinicId, hookForm.name, hookForm.eventType, hookForm.url, hookForm.secret || undefined);
    }
    refreshHooks();
    setHookDialogOpen(false);
    setHookForm({ name: '', eventType: 'appointment_created', url: '', secret: '' });
    toast({ title: isAr ? 'تم إضافة الـ Webhook' : 'Webhook added' });
  };

  const handleDeleteHook = async (id: string) => {
    if (token) { await fetch(`/api/webhooks/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); }
    else deleteWebhook(id);
    refreshHooks();
  };

  const toggleScope = (s: ApiScope) => setKeyScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">{isAr ? 'API والتكاملات' : 'API & Integrations'}</h1>
        <Badge variant="outline">v1</Badge>
      </div>

      <Tabs defaultValue="docs">
        <TabsList>
          <TabsTrigger value="docs" className="gap-2"><Globe className="h-4 w-4" />{isAr ? 'التوثيق' : 'Docs'}</TabsTrigger>
          <TabsTrigger value="keys" className="gap-2"><Key className="h-4 w-4" />{isAr ? 'مفاتيح API' : 'API Keys'}<Badge variant="secondary" className="ml-1">{keys.filter(k => k.isActive).length}</Badge></TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2"><Webhook className="h-4 w-4" />{isAr ? 'Webhooks' : 'Webhooks'}<Badge variant="secondary" className="ml-1">{hooks.filter(h => h.isActive).length}</Badge></TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2"><Zap className="h-4 w-4" />{isAr ? 'تكاملات' : 'Integrations'}</TabsTrigger>
        </TabsList>

        {/* ── DOCS TAB ── */}
        <TabsContent value="docs" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-4 pb-4 text-sm space-y-2">
              <p className="font-medium">{isAr ? 'المصادقة' : 'Authentication'}</p>
              <p className="text-muted-foreground">{isAr ? 'أضف المفتاح في الـ header:' : 'Add your key to the request header:'}</p>
              <div className="flex items-center bg-muted rounded px-3 py-2 font-mono text-xs">
                <span>X-API-Key: cfk_your_key_here</span>
                <CopyButton text="X-API-Key: cfk_your_key_here" />
              </div>
              <p className="text-muted-foreground text-xs">{isAr ? 'الـ Base URL: ' : 'Base URL: '}<code className="bg-muted px-1 rounded">{BASE_URL}</code></p>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {ENDPOINTS.map((ep, i) => <EndpointCard key={i} ep={ep} />)}
          </div>
        </TabsContent>

        {/* ── API KEYS TAB ── */}
        <TabsContent value="keys" className="space-y-4 mt-4">
          {newKeyValue && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4 pb-4">
                <p className="text-sm font-medium text-green-800 mb-2">{isAr ? '⚠️ احفظ المفتاح الآن — لن يُعرض مرة أخرى' : '⚠️ Save this key now — it will not be shown again'}</p>
                <div className="flex items-center gap-2 bg-white rounded border border-green-200 px-3 py-2">
                  <code className="text-xs font-mono flex-1 break-all">{newKeyValue}</code>
                  <CopyButton text={newKeyValue} />
                </div>
                <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setNewKeyValue(null)}>{isAr ? 'موافق، تم الحفظ' : 'Got it, dismiss'}</Button>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{isAr ? 'المفاتيح النشطة' : 'Active keys'}</p>
            <Button size="sm" className="gap-2" onClick={() => setKeyDialogOpen(true)}>
              <Plus className="h-4 w-4" />{isAr ? 'مفتاح جديد' : 'New Key'}
            </Button>
          </div>

          {keys.length === 0 && (
            <div className="text-center text-muted-foreground py-10 text-sm">{isAr ? 'لا توجد مفاتيح بعد' : 'No keys yet'}</div>
          )}

          {keys.map(k => (
            <Card key={k.id}>
              <CardContent className="pt-3 pb-3 flex items-center gap-3">
                <Key className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{k.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {k.scopes.map(s => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{isAr ? 'أُنشئ:' : 'Created:'} {new Date(k.createdAt).toLocaleDateString()}</p>
                </div>
                <Badge variant={k.isActive ? 'default' : 'secondary'}>{k.isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'مُلغى' : 'Revoked')}</Badge>
                {k.isActive && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteKey(k.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── WEBHOOKS TAB ── */}
        <TabsContent value="webhooks" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{isAr ? 'روابط الـ Webhook المسجلة' : 'Registered webhook endpoints'}</p>
            <Button size="sm" className="gap-2" onClick={() => setHookDialogOpen(true)}>
              <Plus className="h-4 w-4" />{isAr ? 'إضافة Webhook' : 'Add Webhook'}
            </Button>
          </div>

          <Card>
            <CardContent className="pt-3 pb-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">{isAr ? 'الأحداث المتاحة' : 'Available events'}</p>
              {WEBHOOK_EVENTS.map(e => <p key={e} className="font-mono">• {e}</p>)}
            </CardContent>
          </Card>

          {hooks.length === 0 && (
            <div className="text-center text-muted-foreground py-8 text-sm">{isAr ? 'لا توجد Webhooks بعد' : 'No webhooks yet'}</div>
          )}

          {hooks.map(h => (
            <Card key={h.id}>
              <CardContent className="pt-3 pb-3 flex items-center gap-3">
                <Webhook className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{h.name || h.eventType}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{h.url}</p>
                  <Badge variant="outline" className="text-[10px] mt-1">{h.eventType}</Badge>
                </div>
                <Badge variant={h.isActive ? 'default' : 'secondary'}>{h.isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'موقوف' : 'Inactive')}</Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteHook(h.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── INTEGRATIONS TAB ── */}
        <TabsContent value="integrations" className="space-y-4 mt-4">
          {[
            { title: isAr ? 'واتساب' : 'WhatsApp', icon: '💬', desc: isAr ? 'نظام الحجز عبر واتساب مدمج. اذهب إلى الإعدادات لتكوين بيانات اعتماد Meta.' : 'Built-in WhatsApp booking bot. Go to Settings to configure Meta credentials.', path: '/settings', label: isAr ? 'إعدادات واتساب' : 'WhatsApp Settings', color: 'border-green-200 bg-green-50' },
            { title: isAr ? 'نتائج المعمل (LIS)' : 'Lab Results (LIS)', icon: '🧪', desc: isAr ? 'أرسل نتائج المعمل عبر POST /api/integrations/lab-results باستخدام مفتاح API.' : 'Push lab results via POST /api/integrations/lab-results using an API key.', path: null, label: null, color: 'border-blue-200 bg-blue-50' },
            { title: isAr ? 'بوابة الدفع' : 'Payment Gateway', icon: '💳', desc: isAr ? 'استقبال إشعارات الدفع (Paymob / Stripe) عبر POST /api/integrations/payment-notify. قم بتعيين PAYMENT_WEBHOOK_SECRET في البيئة.' : 'Receive payment notifications (Paymob / Stripe) via POST /api/integrations/payment-notify. Set PAYMENT_WEBHOOK_SECRET env var.', path: null, label: null, color: 'border-purple-200 bg-purple-50' },
            { title: isAr ? 'المختبرات والمخازن' : 'Inventory & Lab Orders', icon: '📦', desc: isAr ? 'إدارة المخزون ومتابعة أوامر المعمل من داخل النظام.' : 'Manage inventory and track lab orders from within the system.', path: '/inventory', label: isAr ? 'المخزن' : 'Inventory', color: 'border-yellow-200 bg-yellow-50' },
          ].map((card, i) => (
            <Card key={i} className={`border ${card.color}`}>
              <CardContent className="pt-4 pb-4 flex items-start gap-3">
                <span className="text-2xl">{card.icon}</span>
                <div className="flex-1">
                  <p className="font-medium text-sm">{card.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* ── Create API Key Dialog ── */}
      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{isAr ? 'إنشاء مفتاح API' : 'Create API Key'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">{isAr ? 'اسم المفتاح' : 'Key Name'} *</Label>
              <Input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder={isAr ? 'مثال: نظام LIS' : 'e.g. LIS System'} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{isAr ? 'الصلاحيات (Scopes)' : 'Scopes'}</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_SCOPES.map(s => (
                  <button key={s} onClick={() => toggleScope(s)}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${keyScopes.includes(s) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKeyDialogOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleCreateKey} disabled={!keyName.trim() || keyScopes.length === 0}>{isAr ? 'إنشاء' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Webhook Dialog ── */}
      <Dialog open={hookDialogOpen} onOpenChange={setHookDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{isAr ? 'إضافة Webhook' : 'Add Webhook'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">{isAr ? 'الاسم (اختياري)' : 'Name (optional)'}</Label>
              <Input value={hookForm.name} onChange={e => setHookForm(p => ({ ...p, name: e.target.value }))} placeholder="My Webhook" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{isAr ? 'الحدث' : 'Event'} *</Label>
              <select
                value={hookForm.eventType}
                onChange={e => setHookForm(p => ({ ...p, eventType: e.target.value as WebhookEventType }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {WEBHOOK_EVENTS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{isAr ? 'الـ URL' : 'URL'} *</Label>
              <Input value={hookForm.url} onChange={e => setHookForm(p => ({ ...p, url: e.target.value }))} placeholder="https://your-system.com/webhook" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{isAr ? 'السر (اختياري)' : 'Secret (optional)'}</Label>
              <Input type="password" value={hookForm.secret} onChange={e => setHookForm(p => ({ ...p, secret: e.target.value }))} placeholder="HMAC signing secret" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHookDialogOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleCreateHook} disabled={!hookForm.url.trim()}>{isAr ? 'إضافة' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
