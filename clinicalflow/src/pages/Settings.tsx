import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { useAuth } from '@/hooks/useAuth';
import { getToken } from '@/utils/authToken';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Building2, Save, Upload, X, Percent, ImageIcon, Bell, Banknote,
  ClipboardList, Plus, Trash2, AlertTriangle, GripVertical, ChevronUp, ChevronDown, Clock, Check,
  Layers, RotateCcw, ArrowUpDown, Zap, ListOrdered, DoorOpen, Edit2, MessageSquare, Activity, Puzzle,
  CreditCard,
} from 'lucide-react';
import {
  getInstallmentSettings, saveInstallmentSettings,
  type InstallmentSettings,
} from '@/stores/installmentStore';
import { useModules, type ModuleName } from '@/hooks/useModules';
import { toast } from 'sonner';
import type { ClinicSettings } from '@/stores/clinicSettingsStore';
import {
  visitTypeStore, getClinicVisitTypes, addVisitType, updateVisitType,
  removeVisitType, moveVisitTypePriority, getEnabledClinicVisitTypes,
} from '@/stores/visitTypeStore';
import { VisitType } from '@/types';
import {
  queueStrategyStore, getClinicQueueStrategy, updateQueueStrategy,
  type QueueStrategy, type QueueStrategyConfig,
} from '@/stores/queueStrategyStore';
import { roomStore, ROOM_STATUS_COLORS, ROOM_TYPE_LABELS, SEED_ROOMS, type Room, type RoomType, type RoomStatus } from '@/stores/roomStore';
import { getQueueSettings, saveQueueSettings, STRATEGY_LABELS, type QueueEngineStrategy } from '@/stores/queueEngineStore';
import {
  schedulingStrategyStore, getSchedulingStrategy, updateSchedulingStrategy,
  type SchedulingStrategy, type SchedulingStrategyConfig,
} from '@/stores/schedulingStrategyStore';

// ─── Subscription Tab ─────────────────────────────────────────────────────────
const PLAN_LIMIT_MAP: Record<string, { ai: number; wa: number; label: string; labelAr: string }> = {
  basic:    { ai: 50,    wa: 200,   label: 'Basic',    labelAr: 'أساسي' },
  pro:      { ai: 500,   wa: 2000,  label: 'Pro',      labelAr: 'احترافي' },
  ai:       { ai: 5000,  wa: 10000, label: 'AI',       labelAr: 'ذكاء اصطناعي' },
  advanced: { ai: 2000,  wa: 5000,  label: 'Advanced', labelAr: 'متقدم' },
  elite:    { ai: 5000,  wa: 10000, label: 'Elite',    labelAr: 'النخبة' },
};

// ─── Installment Settings Tab ──────────────────────────────────────────────────
const InstallmentSettingsTab: React.FC<{ clinicId: string; language: string }> = ({ clinicId, language }) => {
  const isAr = language === 'ar';
  const [form, setForm] = React.useState<InstallmentSettings>(() => getInstallmentSettings(clinicId));

  const set = <K extends keyof InstallmentSettings>(key: K, val: InstallmentSettings[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = () => {
    saveInstallmentSettings(form);
    toast.success(isAr ? 'تم حفظ إعدادات التقسيط' : 'Installment settings saved');
  };

  const options = [2, 3, 4, 6, 9, 12];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5 text-primary" />
          {isAr ? 'إعدادات نظام التقسيط' : 'Installment System Settings'}
        </CardTitle>
        <CardDescription>
          {isAr
            ? 'تخصيص شروط وأحكام التقسيط لمرضى العيادة'
            : 'Configure installment terms and conditions for clinic patients'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable toggle */}
        <div className="flex items-center justify-between gap-2">
          <Label className="flex flex-col gap-1">
            <span>{isAr ? 'تفعيل نظام التقسيط' : 'Enable Installment System'}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {isAr ? 'السماح لموظفي الاستقبال بإنشاء خطط تقسيط للمرضى' : 'Allow staff to create installment plans for patients'}
            </span>
          </Label>
          <Switch
            id="inst-enabled"
            data-testid="switch-installment-enabled"
            checked={form.enabled}
            onCheckedChange={v => set('enabled', v)}
          />
        </div>

        {form.enabled && (
          <>
            <Separator />
            <div className="grid gap-5 sm:grid-cols-2">
              {/* Max installments */}
              <div className="space-y-2">
                <Label htmlFor="inst-max">{isAr ? 'الحد الأقصى لعدد الأقساط' : 'Maximum Installments'}</Label>
                <Select value={String(form.maxInstallments)} onValueChange={v => set('maxInstallments', Number(v))}>
                  <SelectTrigger id="inst-max" data-testid="select-max-installments">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map(n => (
                      <SelectItem key={n} value={String(n)}>{n} {isAr ? 'أقساط' : 'installments'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {isAr ? 'أقصى عدد من الأقساط الشهرية المسموح بها' : 'Maximum monthly installments allowed'}
                </p>
              </div>

              {/* Min amount */}
              <div className="space-y-2">
                <Label htmlFor="inst-min">{isAr ? 'الحد الأدنى لمبلغ الفاتورة (ج.م)' : 'Minimum Invoice Amount (EGP)'}</Label>
                <Input
                  id="inst-min"
                  data-testid="input-min-amount"
                  type="number"
                  min={0}
                  value={form.minAmount}
                  onChange={e => set('minAmount', parseFloat(e.target.value) || 0)}
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground">
                  {isAr ? 'الفواتير الأقل من هذا المبلغ لا تقبل التقسيط' : 'Invoices below this amount are not eligible for installments'}
                </p>
              </div>

              {/* Down payment percentage */}
              <div className="space-y-2">
                <Label htmlFor="inst-down">{isAr ? 'نسبة الدفعة المقدمة (%)' : 'Down Payment Percentage (%)'}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="inst-down"
                    data-testid="input-down-payment-pct"
                    type="number"
                    min={0}
                    max={100}
                    value={form.downPaymentPct}
                    onChange={e => set('downPaymentPct', parseFloat(e.target.value) || 0)}
                    dir="ltr"
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAr ? 'النسبة المئوية المطلوبة كدفعة أولى' : 'Percentage required as initial down payment'}
                </p>
              </div>

              {/* Late fee rate */}
              <div className="space-y-2">
                <Label htmlFor="inst-late">{isAr ? 'رسوم التأخير (%)' : 'Late Fee Rate (%)'}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="inst-late"
                    data-testid="input-late-fee"
                    type="number"
                    min={0}
                    max={50}
                    value={form.lateFeeRate}
                    onChange={e => set('lateFeeRate', parseFloat(e.target.value) || 0)}
                    dir="ltr"
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAr ? '0 = لا توجد رسوم تأخير' : '0 = no late fees'}
                </p>
              </div>

              {/* Reminder days */}
              <div className="space-y-2">
                <Label htmlFor="inst-reminder">{isAr ? 'التذكير قبل الاستحقاق (أيام)' : 'Reminder Days Before Due'}</Label>
                <Input
                  id="inst-reminder"
                  data-testid="input-reminder-days"
                  type="number"
                  min={1}
                  max={30}
                  value={form.reminderDaysBefore}
                  onChange={e => set('reminderDaysBefore', parseInt(e.target.value) || 3)}
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground">
                  {isAr ? 'عدد الأيام قبل موعد القسط لإرسال تذكير' : 'Days before due date to send reminder notification'}
                </p>
              </div>
            </div>

            {/* Summary preview */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <p className="text-sm font-medium">{isAr ? 'مثال على خطة تقسيط' : 'Sample installment plan'}</p>
              {(() => {
                const sampleTotal = 1000;
                const down = Math.round(sampleTotal * form.downPaymentPct / 100);
                const remaining = sampleTotal - down;
                const perInst = form.maxInstallments > 0 ? Math.ceil(remaining / form.maxInstallments) : remaining;
                return (
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="text-center p-2 bg-background rounded-md">
                      <p className="text-2xl font-bold text-green-600">{down}</p>
                      <p className="text-xs text-muted-foreground">{isAr ? 'دفعة أولى' : 'Down Payment'}</p>
                    </div>
                    <div className="text-center p-2 bg-background rounded-md">
                      <p className="text-2xl font-bold text-primary">{perInst}</p>
                      <p className="text-xs text-muted-foreground">{isAr ? 'قسط شهري' : 'Monthly Inst.'}</p>
                    </div>
                    <div className="text-center p-2 bg-background rounded-md">
                      <p className="text-2xl font-bold">{form.maxInstallments}</p>
                      <p className="text-xs text-muted-foreground">{isAr ? 'عدد الأقساط' : 'Installments'}</p>
                    </div>
                  </div>
                );
              })()}
              <p className="text-xs text-muted-foreground text-center">
                {isAr ? '* مبني على فاتورة افتراضية بقيمة 1000 ج.م' : '* Based on a sample invoice of 1000 EGP'}
              </p>
            </div>
          </>
        )}

        <Button
          data-testid="button-save-installment-settings"
          onClick={handleSave}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {isAr ? 'حفظ الإعدادات' : 'Save Settings'}
        </Button>
      </CardContent>
    </Card>
  );
};

const SubscriptionTab: React.FC<{ clinicId: string; language: string }> = ({ clinicId, language }) => {
  const isAr = language === 'ar';
  const [data, setData] = React.useState<{
    plan: string; planExpiresAt: string | null; month: string;
    usage: { ai_requests: number; whatsapp_messages: number };
    limits: { ai_requests: number; whatsapp_messages: number };
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!clinicId) { setLoading(false); return; }
    const token = getToken();
    fetch('/api/subscription/usage', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clinicId]);

  const planInfo = data ? (PLAN_LIMIT_MAP[data.plan] || PLAN_LIMIT_MAP['basic']) : null;

  function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-orange-400' : 'bg-primary';
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span>{used.toLocaleString()} / {limit.toLocaleString()}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">{pct}% {isAr ? 'مستخدم' : 'used'}</p>
      </div>
    );
  }

  if (loading) return <Card><CardContent className="pt-6 text-center text-muted-foreground text-sm">{isAr ? 'جارٍ التحميل…' : 'Loading…'}</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="h-5 w-5 text-primary" />
          {isAr ? 'الاشتراك والاستخدام' : 'Subscription & Usage'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current plan */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/20">
          <div>
            <p className="text-xs text-muted-foreground">{isAr ? 'الخطة الحالية' : 'Current Plan'}</p>
            <p className="text-2xl font-bold text-primary mt-0.5">
              {planInfo ? (isAr ? planInfo.labelAr : planInfo.label) : (data?.plan || 'Basic')}
            </p>
            {data?.planExpiresAt && (
              <p className="text-xs text-muted-foreground mt-1">
                {isAr ? 'تنتهي: ' : 'Expires: '}
                {new Date(data.planExpiresAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB')}
              </p>
            )}
          </div>
          <a href="/subscription">
            <Button size="sm" className="gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              {isAr ? 'ترقية' : 'Upgrade'}
            </Button>
          </a>
        </div>

        {/* Usage bars */}
        {data && (
          <div className="space-y-4">
            <p className="text-sm font-medium">
              {isAr ? `استخدام شهر ${data.month}` : `Usage — ${data.month}`}
            </p>
            <UsageBar
              used={data.usage.ai_requests}
              limit={data.limits.ai_requests}
              label={isAr ? 'طلبات الذكاء الاصطناعي' : 'AI Requests'}
            />
            <UsageBar
              used={data.usage.whatsapp_messages}
              limit={data.limits.whatsapp_messages}
              label={isAr ? 'رسائل واتساب' : 'WhatsApp Messages'}
            />
          </div>
        )}

        {!data && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {isAr ? 'لا توجد بيانات اشتراك متاحة بعد' : 'No subscription data available yet'}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

// ─── WhatsApp Tab ─────────────────────────────────────────────────────────────
const WhatsAppTab: React.FC<{ clinicId: string; language: string }> = ({ clinicId, language }) => {
  const isAr = language === 'ar';
  const [verifyToken,    setVerifyToken]    = useState('');
  const [apiToken,       setApiToken]       = useState('');
  const [phoneNumberId,  setPhoneNumberId]  = useState('');
  const [isActive,       setIsActive]       = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);

  useEffect(() => {
    fetch('/api/settings/whatsapp', {
      headers: { Authorization: `Bearer ${localStorage.getItem('cf_token') || ''}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setVerifyToken(data.verify_token   || '');
          setApiToken(data.api_token         || '');
          setPhoneNumberId(data.phone_number_id || '');
          setIsActive(data.is_active         || false);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clinicId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/whatsapp', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization: `Bearer ${localStorage.getItem('cf_token') || ''}`,
        },
        body: JSON.stringify({
          verifyToken, apiToken, phoneNumberId, isActive,
        }),
      });
      if (res.ok) {
        toast.success(isAr ? 'تم حفظ الإعدادات بنجاح' : 'Settings saved successfully');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || (isAr ? 'حدث خطأ' : 'Save failed'));
      }
    } catch {
      toast.error(isAr ? 'تعذر الاتصال بالخادم' : 'Connection error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-muted-foreground text-sm">{isAr ? 'جاري التحميل…' : 'Loading…'}</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-5 w-5 text-green-500" />
            {isAr ? 'إعدادات واتساب' : 'WhatsApp Integration'}
          </CardTitle>
          <CardDescription>
            {isAr
              ? 'اربط واتساب بالعيادة لتلقي الحجوزات تلقائياً عبر الرسائل.'
              : 'Connect WhatsApp Cloud API to accept bookings via chat messages.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium text-sm">{isAr ? 'تفعيل البوت' : 'Enable Bot'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? 'إيقاف التشغيل لن يحذف الإعدادات' : 'Disabling keeps credentials saved'}
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* Verify Token */}
          <div className="space-y-1.5">
            <Label>{isAr ? 'Verify Token' : 'Verify Token'}</Label>
            <Input
              dir="ltr"
              placeholder="clinicflow_verify_xxxx"
              value={verifyToken}
              onChange={e => setVerifyToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {isAr ? 'يُستخدم عند ربط Webhook في Meta Dashboard' : 'Used when registering your Webhook in Meta Dashboard'}
            </p>
          </div>

          {/* API Token */}
          <div className="space-y-1.5">
            <Label>{isAr ? 'API Token (Bearer)' : 'API Token (Bearer)'}</Label>
            <Input
              dir="ltr"
              type="password"
              placeholder="EAAxxxxxxxxxx…"
              value={apiToken}
              onChange={e => setApiToken(e.target.value)}
            />
          </div>

          {/* Phone Number ID */}
          <div className="space-y-1.5">
            <Label>{isAr ? 'Phone Number ID' : 'Phone Number ID'}</Label>
            <Input
              dir="ltr"
              placeholder="1234567890"
              value={phoneNumberId}
              onChange={e => setPhoneNumberId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {isAr ? 'من إعدادات WhatsApp Business في Meta' : 'From your WhatsApp Business account in Meta'}
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving
              ? (isAr ? 'جاري الحفظ…' : 'Saving…')
              : (<><Save className="h-4 w-4 mr-2" />{isAr ? 'حفظ الإعدادات' : 'Save Settings'}</>)}
          </Button>
        </CardContent>
      </Card>

      {/* Webhook URL helper */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{isAr ? 'رابط Webhook' : 'Webhook URL'}</CardTitle>
        </CardHeader>
        <CardContent>
          <code className="text-xs bg-muted rounded px-2 py-1 block break-all select-all">
            {`${window.location.origin}/api/whatsapp/webhook`}
          </code>
          <p className="text-xs text-muted-foreground mt-2">
            {isAr
              ? 'انسخ هذا الرابط وأضفه في Meta Developers → WhatsApp → Webhooks'
              : 'Copy this URL into Meta Developers → WhatsApp → Webhooks'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Visit Types Tab ───────────────────────────────────────────────────────────
const VisitTypesTab: React.FC<{ clinicId: string; language: string }> = ({ clinicId, language }) => {
  const isAr = language === 'ar';
  const [types, setTypes] = useState<VisitType[]>(() => getClinicVisitTypes(clinicId));
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', nameAr: '', price: 150, durationMinutes: 20, isUrgent: false });

  const refresh = useCallback(() => setTypes(getClinicVisitTypes(clinicId)), [clinicId]);

  useEffect(() => {
    refresh();
    return visitTypeStore.subscribe(refresh);
  }, [refresh]);

  const handleAdd = () => {
    if (!form.name.trim() || !form.nameAr.trim()) {
      toast.error(isAr ? 'أدخل الاسم بالعربي والإنجليزي' : 'Enter name in both languages');
      return;
    }
    addVisitType(clinicId, {
      name: form.name.trim(),
      nameAr: form.nameAr.trim(),
      price: form.price,
      durationMinutes: form.durationMinutes,
      isUrgent: form.isUrgent,
      isEnabled: true,
      sortOrder: 99,
    });
    setForm({ name: '', nameAr: '', price: 150, durationMinutes: 20, isUrgent: false });
    setAdding(false);
    toast.success(isAr ? 'تم إضافة نوع الزيارة' : 'Visit type added');
  };

  const handleToggle = (id: string, isEnabled: boolean) => {
    updateVisitType(id, { isEnabled });
    toast.success(isAr ? 'تم التحديث' : 'Updated');
  };

  const handleDelete = (id: string) => {
    removeVisitType(id);
    toast.success(isAr ? 'تم الحذف' : 'Deleted');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5" />
              {isAr ? 'أنواع الزيارات' : 'Visit Types'}
            </CardTitle>
            <CardDescription>
              {isAr
                ? 'تخصيص أنواع الزيارات والأسعار للطابور وفواتير الحجز'
                : 'Customize visit types and prices used in booking and queue'}
            </CardDescription>
          </div>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setAdding(v => !v)} data-testid="button-add-visit-type">
            <Plus className="h-4 w-4" />
            {isAr ? 'إضافة نوع' : 'Add Type'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add form */}
        {adding && (
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
            <p className="text-sm font-semibold">{isAr ? 'نوع زيارة جديد' : 'New Visit Type'}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{isAr ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
                <Input
                  data-testid="input-vt-name"
                  placeholder="e.g. Follow-up"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{isAr ? 'الاسم (عربي)' : 'Name (Arabic)'}</Label>
                <Input
                  data-testid="input-vt-name-ar"
                  placeholder="مثال: متابعة"
                  dir="rtl"
                  value={form.nameAr}
                  onChange={e => setForm(p => ({ ...p, nameAr: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{isAr ? 'السعر (ج.م)' : 'Price (EGP)'}</Label>
                <div className="relative">
                  <Input
                    data-testid="input-vt-price"
                    type="number"
                    min={0}
                    step={10}
                    value={form.price}
                    onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))}
                    className="pe-12"
                    dir="ltr"
                  />
                  <span className="absolute inset-y-0 end-0 flex items-center px-3 text-sm text-muted-foreground pointer-events-none select-none">
                    ج.م
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{isAr ? 'المدة (دقيقة)' : 'Duration (minutes)'}</Label>
                <div className="relative">
                  <Input
                    data-testid="input-vt-duration"
                    type="number"
                    min={5}
                    step={5}
                    value={form.durationMinutes}
                    onChange={e => setForm(p => ({ ...p, durationMinutes: Number(e.target.value) }))}
                    className="pe-14"
                    dir="ltr"
                  />
                  <span className="absolute inset-y-0 end-0 flex items-center px-3 text-sm text-muted-foreground pointer-events-none select-none">
                    {isAr ? 'دقيقة' : 'min'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="vt-urgent"
                checked={form.isUrgent}
                onCheckedChange={v => setForm(p => ({ ...p, isUrgent: v }))}
                data-testid="switch-vt-urgent"
              />
              <Label htmlFor="vt-urgent" className="flex items-center gap-1.5 cursor-pointer text-sm">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                {isAr ? 'مستعجل (أولوية عالية)' : 'Urgent (high priority)'}
              </Label>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" className="gap-1.5" onClick={handleAdd} data-testid="button-save-vt">
                <Check className="h-4 w-4" />
                {isAr ? 'حفظ' : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)} data-testid="button-cancel-vt">
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
          </div>
        )}

        {/* Existing types */}
        <div className="space-y-2">
          {types.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{isAr ? 'لا توجد أنواع زيارات بعد' : 'No visit types yet'}</p>
            </div>
          )}
          {types.map((vt, idx) => (
            <div
              key={vt.id}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${vt.isEnabled ? 'bg-card' : 'bg-muted/40 opacity-60'}`}
              data-testid={`row-visit-type-${vt.id}`}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{isAr ? vt.nameAr : vt.name}</span>
                  {vt.isUrgent && (
                    <Badge variant="destructive" className="text-xs px-1.5 py-0">
                      <AlertTriangle className="h-3 w-3 me-1" />
                      {isAr ? 'مستعجل' : 'Urgent'}
                    </Badge>
                  )}
                  {!vt.isEnabled && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
                      {isAr ? 'معطّل' : 'Disabled'}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {vt.durationMinutes} {isAr ? 'دقيقة' : 'min'}
                  </span>
                  <span className="font-semibold text-foreground">{vt.price} ج.م</span>
                </div>
              </div>
              {/* Reorder */}
              {!vt.isUrgent && (
                <div className="flex flex-col gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => moveVisitTypePriority(vt.id, 'up', clinicId)}
                    disabled={idx === 0 || (idx === 1 && types[0].isUrgent)}
                    data-testid={`button-move-up-${vt.id}`}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => moveVisitTypePriority(vt.id, 'down', clinicId)}
                    disabled={idx === types.length - 1}
                    data-testid={`button-move-down-${vt.id}`}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {/* Enable/disable */}
              <Switch
                checked={vt.isEnabled}
                onCheckedChange={v => handleToggle(vt.id, v)}
                data-testid={`switch-vt-enabled-${vt.id}`}
              />
              {/* Delete */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive/70 hover:text-destructive shrink-0"
                onClick={() => handleDelete(vt.id)}
                data-testid={`button-delete-vt-${vt.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Scheduling Strategy Card ─────────────────────────────────────────────────
const SCHEDULING_STRATEGY_INFO: Record<SchedulingStrategy, { labelAr: string; labelEn: string; descAr: string; descEn: string }> = {
  hybrid:   { labelEn: 'Hybrid (default)',    labelAr: 'هجين (افتراضي)',          descEn: 'Multiple bookings per interval with queue position and estimated start time.', descAr: 'حجوزات متعددة في كل فترة مع رقم الطابور والوقت المتوقع للبدء.' },
  queue:    { labelEn: 'Queue',               labelAr: 'طابور',                   descEn: 'Ignore exact time — patients join a numbered queue in booking order.',          descAr: 'تجاهل الوقت المحدد — المرضى ينضمون لطابور مرقّم بترتيب الحجز.' },
  interval: { labelEn: 'Interval',            labelAr: 'فترات زمنية',             descEn: 'Cap the number of bookings per time block. Rejects when the block is full.',   descAr: 'تحديد عدد حجوزات لكل فترة زمنية. يرفض الحجز إذا امتلأت الفترة.' },
  strict:   { labelEn: 'Strict (one per slot)', labelAr: 'صارم (حجز واحد)',       descEn: 'Only one booking allowed per exact time slot.',                                descAr: 'حجز واحد فقط لكل وقت محدد.' },
};

const SchedulingStrategyCard: React.FC<{ clinicId: string; isAr: boolean }> = ({ clinicId, isAr }) => {
  const [cfg, setCfg] = useState<SchedulingStrategyConfig>(() => getSchedulingStrategy(clinicId));

  useEffect(() => {
    setCfg(getSchedulingStrategy(clinicId));
    return schedulingStrategyStore.subscribe(() => setCfg(getSchedulingStrategy(clinicId)));
  }, [clinicId]);

  const handleSave = () => {
    updateSchedulingStrategy(clinicId, {
      strategy: cfg.strategy,
      intervalMinutes: cfg.intervalMinutes,
      maxPerInterval: cfg.maxPerInterval,
    });
    toast.success(isAr ? 'تم حفظ استراتيجية الجدولة' : 'Scheduling strategy saved');
  };

  const showIntervalSettings = cfg.strategy === 'interval' || cfg.strategy === 'hybrid';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListOrdered className="h-4 w-4 text-primary" />
          {isAr ? 'استراتيجية الجدولة' : 'Scheduling Strategy'}
        </CardTitle>
        <CardDescription>
          {isAr ? 'حدد كيف يتم قبول الحجوزات الجديدة لكل عيادة' : 'Control how new appointment bookings are accepted for this clinic'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2">
          {(Object.keys(SCHEDULING_STRATEGY_INFO) as SchedulingStrategy[]).map(key => {
            const info = SCHEDULING_STRATEGY_INFO[key];
            const active = cfg.strategy === key;
            return (
              <div
                key={key}
                onClick={() => setCfg(c => ({ ...c, strategy: key }))}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}
                data-testid={`scheduling-strategy-${key}`}
              >
                <div className={`mt-0.5 h-3 w-3 rounded-full border-2 shrink-0 ${active ? 'bg-primary border-primary' : 'border-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{isAr ? info.labelAr : info.labelEn}</span>
                    {active && <Badge className="text-xs">{isAr ? 'نشط' : 'Active'}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{isAr ? info.descAr : info.descEn}</p>
                </div>
              </div>
            );
          })}
        </div>

        {showIntervalSettings && (
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-sm">{isAr ? 'مدة الفترة (دقيقة)' : 'Interval (minutes)'}</Label>
              <Select
                value={String(cfg.intervalMinutes)}
                onValueChange={v => setCfg(c => ({ ...c, intervalMinutes: Number(v) }))}
              >
                <SelectTrigger data-testid="select-interval-minutes">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[15, 20, 30, 45, 60].map(m => (
                    <SelectItem key={m} value={String(m)}>{m} {isAr ? 'د' : 'min'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{isAr ? 'أقصى حجوزات / فترة' : 'Max per interval'}</Label>
              <Select
                value={String(cfg.maxPerInterval)}
                onValueChange={v => setCfg(c => ({ ...c, maxPerInterval: Number(v) }))}
              >
                <SelectTrigger data-testid="select-max-per-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 8, 10].map(n => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <Button onClick={handleSave} className="gap-2 w-full sm:w-auto" data-testid="button-save-scheduling-strategy">
          <Save className="h-4 w-4" />
          {isAr ? 'حفظ' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
};

// ─── Queue Strategy Tab ────────────────────────────────────────────────────────
const STRATEGY_INFO = {
  A: {
    icon: <Clock className="h-4 w-4 text-blue-500" />,
    label: 'Strategy A — Payment Order',
    labelAr: 'الاستراتيجية أ — ترتيب الدفع',
    desc: 'Patients are called strictly by payment time. First to pay = first to be called.',
    descAr: 'يُستدعى المرضى حسب وقت الدفع فقط. الأول في الدفع = الأول في الاستدعاء.',
  },
  B: {
    icon: <ListOrdered className="h-4 w-4 text-primary" />,
    label: 'Strategy B — Visit Type Priority',
    labelAr: 'الاستراتيجية ب — أولوية نوع الزيارة',
    desc: 'Visit types are served in their configured priority order (set in Visit Types tab), then by payment time.',
    descAr: 'تُخدم أنواع الزيارات بحسب ترتيب الأولوية المضبوط في تبويب "أنواع الزيارات"، ثم حسب وقت الدفع.',
  },
  C: {
    icon: <ArrowUpDown className="h-4 w-4 text-green-500" />,
    label: 'Strategy C — Alternating',
    labelAr: 'الاستراتيجية ج — تناوب',
    desc: 'System alternates between consultation and follow-up. If one type is unavailable, the other is served.',
    descAr: 'يتناوب النظام بين الكشف والمتابعة. إذا لم يكن أحد الأنواع متاحاً، يُخدم النوع الآخر.',
  },
  D: {
    icon: <RotateCcw className="h-4 w-4 text-orange-500" />,
    label: 'Strategy D — Custom Rotation',
    labelAr: 'الاستراتيجية د — تدوير مخصص',
    desc: 'Admin defines a rotation pattern (e.g. Consultation → Consultation → Follow-up, repeat). System follows this pattern.',
    descAr: 'يحدد المدير نمط التدوير (مثلاً كشف → كشف → متابعة، تكرار). يتبع النظام هذا النمط.',
  },
  E: {
    icon: <Zap className="h-4 w-4 text-destructive" />,
    label: 'Strategy E — Urgent First + Payment Order',
    labelAr: 'الاستراتيجية هـ — المستعجل أولاً + ترتيب الدفع',
    desc: 'Urgent visits always come first. All remaining patients are called in payment order.',
    descAr: 'الزيارات المستعجلة دائماً أولاً. يُستدعى باقي المرضى بترتيب الدفع.',
  },
};

const QueueStrategyTab: React.FC<{ clinicId: string; language: string }> = ({ clinicId, language }) => {
  const isAr = language === 'ar';
  const [config, setConfig] = useState<QueueStrategyConfig>(() => getClinicQueueStrategy(clinicId));
  const [saved, setSaved] = useState(false);

  const visitTypes = getEnabledClinicVisitTypes(clinicId).filter(vt => !vt.isUrgent);

  useEffect(() => {
    setConfig(getClinicQueueStrategy(clinicId));
  }, [clinicId]);

  const refresh = useCallback(() => setConfig(getClinicQueueStrategy(clinicId)), [clinicId]);

  useEffect(() => {
    return queueStrategyStore.subscribe(refresh);
  }, [refresh]);

  const handleSave = () => {
    updateQueueStrategy(clinicId, {
      strategy: config.strategy,
      urgentAlwaysFirst: config.urgentAlwaysFirst,
      rotationPattern: config.rotationPattern,
      rotationIndex: 0,
      lastServedCategory: null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success(isAr ? 'تم حفظ استراتيجية الطابور' : 'Queue strategy saved');
  };

  const addToRotation = (vtId: string) => {
    setConfig(c => ({ ...c, rotationPattern: [...c.rotationPattern, vtId] }));
  };

  const removeFromRotation = (idx: number) => {
    setConfig(c => ({
      ...c,
      rotationPattern: c.rotationPattern.filter((_, i) => i !== idx),
    }));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Layers className="h-5 w-5" />
            {isAr ? 'استراتيجية الطابور' : 'Queue Strategy'}
          </CardTitle>
          <CardDescription>
            {isAr
              ? 'اختر كيفية ترتيب المرضى في طابور الانتظار لهذه العيادة'
              : 'Choose how patients are ordered in the waiting queue for this clinic'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <RadioGroup
            value={config.strategy}
            onValueChange={v => setConfig(c => ({ ...c, strategy: v as QueueStrategy }))}
            className="space-y-3"
            data-testid="radio-queue-strategy"
          >
            {(Object.keys(STRATEGY_INFO) as QueueStrategy[]).map(key => {
              const info = STRATEGY_INFO[key];
              const isSelected = config.strategy === key;
              return (
                <div
                  key={key}
                  className={`flex items-start gap-3 rounded-lg border p-4 transition-colors cursor-pointer ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                  onClick={() => setConfig(c => ({ ...c, strategy: key }))}
                  data-testid={`option-strategy-${key}`}
                >
                  <RadioGroupItem value={key} id={`strategy-${key}`} className="mt-0.5 shrink-0" />
                  <label htmlFor={`strategy-${key}`} className="cursor-pointer flex-1">
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      {info.icon}
                      {isAr ? info.labelAr : info.label}
                      {isSelected && <Badge className="text-xs ml-auto">{isAr ? 'نشط' : 'Active'}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isAr ? info.descAr : info.desc}
                    </p>
                  </label>
                </div>
              );
            })}
          </RadioGroup>

          <Separator />

          {/* Urgent toggle — not shown for E since it's inherently urgent-first */}
          {config.strategy !== 'E' && (
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  {isAr ? 'المستعجل دائماً أولاً' : 'Urgent Always First'}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? 'الزيارات المستعجلة تُستدعى قبل أي نوع آخر'
                    : 'Urgent visits are always called before any other type'}
                </p>
              </div>
              <Switch
                checked={config.urgentAlwaysFirst}
                onCheckedChange={v => setConfig(c => ({ ...c, urgentAlwaysFirst: v }))}
                data-testid="switch-urgent-always-first"
              />
            </div>
          )}

          {/* Strategy D: Rotation pattern builder */}
          {config.strategy === 'D' && (
            <>
              <Separator />
              <div className="space-y-3">
                <div>
                  <Label className="flex items-center gap-1.5 font-medium">
                    <RotateCcw className="h-4 w-4 text-orange-500" />
                    {isAr ? 'نمط التدوير' : 'Rotation Pattern'}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAr
                      ? 'أضف أنواع الزيارات بالترتيب المطلوب. الأنواع المكررة تعني خدمة أكثر من زيارة بنفس النوع قبل الانتقال للتالي.'
                      : 'Add visit types in the desired order. Repeating a type means serving multiple of that type before moving on.'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Select onValueChange={addToRotation}>
                    <SelectTrigger className="flex-1" data-testid="select-rotation-type">
                      <SelectValue placeholder={isAr ? 'أضف نوع للتدوير' : 'Add type to rotation'} />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {visitTypes.map(vt => (
                        <SelectItem key={vt.id} value={vt.id}>
                          {isAr ? vt.nameAr : vt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {config.rotationPattern.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                    {isAr ? 'لم يُضف أي نوع بعد — سيتم استخدام ترتيب الدفع كبديل' : 'No types added yet — payment order will be used as fallback'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {config.rotationPattern.map((vtId, idx) => {
                      const vt = visitTypes.find(v => v.id === vtId);
                      return (
                        <div
                          key={`${vtId}-${idx}`}
                          className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2"
                          data-testid={`rotation-item-${idx}`}
                        >
                          <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">{idx + 1}.</span>
                          <span className="text-sm font-medium flex-1">
                            {vt ? (isAr ? vt.nameAr : vt.name) : vtId}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive/70 hover:text-destructive shrink-0"
                            onClick={() => removeFromRotation(idx)}
                            data-testid={`button-remove-rotation-${idx}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? `النمط: ${config.rotationPattern.map(id => visitTypes.find(v => v.id === id)?.nameAr || id).join(' → ')} (تكرار)`
                        : `Pattern: ${config.rotationPattern.map(id => visitTypes.find(v => v.id === id)?.name || id).join(' → ')} (repeat)`}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="pt-1">
            <Button onClick={handleSave} className="gap-2" data-testid="button-save-queue-strategy">
              {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {isAr ? 'حفظ الاستراتيجية' : 'Save Strategy'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Scheduling Strategy (booking rules) ─── */}
      <SchedulingStrategyCard clinicId={clinicId} isAr={isAr} />

      {/* ─── Smart Queue Engine Settings ─── */}
      <SmartQueueEngineCard clinicId={clinicId} isAr={isAr} />
    </div>
  );
};

// ─── Smart Queue Engine Settings Card ─────────────────────────────────────────
const SmartQueueEngineCard: React.FC<{ clinicId: string; isAr: boolean }> = ({ clinicId, isAr }) => {
  const [cfg, setCfg] = useState(() => getQueueSettings(clinicId));
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveQueueSettings(clinicId, {
      strategyType: cfg.strategyType,
      allowEmergency: cfg.allowEmergency,
      smartOptimizationEnabled: cfg.smartOptimizationEnabled,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success(isAr ? 'تم حفظ إعدادات الطابور الذكي' : 'Smart queue settings saved');
  };

  const strategies: QueueEngineStrategy[] = ['fifo', 'urgent_first', 'consult_mix', 'consult_first', 'custom'];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          {isAr ? 'إعدادات الطابور الذكي' : 'Smart Queue Engine'}
        </CardTitle>
        <CardDescription>
          {isAr
            ? 'يُستخدم في صفحة الطابور الذكي لترتيب الزيارات تلقائياً'
            : 'Used by the Smart Queue page to auto-sort in_queue appointments'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Strategy selector */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">
            {isAr ? 'استراتيجية الترتيب' : 'Sorting Strategy'}
          </Label>
          <div className="grid grid-cols-1 gap-2">
            {strategies.map(s => {
              const lbl = STRATEGY_LABELS[s];
              return (
                <div
                  key={s}
                  onClick={() => setCfg(c => ({ ...c, strategyType: s }))}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${cfg.strategyType === s ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}
                >
                  <div className={`h-3 w-3 rounded-full border-2 flex-shrink-0 ${cfg.strategyType === s ? 'bg-primary border-primary' : 'border-muted-foreground'}`} />
                  <span className="text-sm">{isAr ? lbl.ar : lbl.en}</span>
                  {cfg.strategyType === s && <Badge className="text-xs ms-auto">{isAr ? 'نشط' : 'Active'}</Badge>}
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Allow emergency */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="font-medium text-sm">
              {isAr ? 'السماح بحالات الطوارئ' : 'Allow Emergency Escalation'}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? 'مرضى الطوارئ يُقدَّمون على باقي الطابور'
                : 'Emergency patients jump to the front of the queue'}
            </p>
          </div>
          <Switch
            checked={cfg.allowEmergency}
            onCheckedChange={v => setCfg(c => ({ ...c, allowEmergency: v }))}
          />
        </div>

        <Separator />

        {/* Smart Optimization toggle (STEP 8) */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="font-medium text-sm flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-primary" />
              {isAr ? 'تفعيل التحسين الذكي' : 'Enable Smart Optimization'}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? 'يُعيد ترتيب الطابور تلقائياً لتقليل وقت الانتظار ويتوقع مدة كل زيارة'
                : 'Auto-reorders the queue to reduce waiting time and predicts visit duration'}
            </p>
          </div>
          <Switch
            checked={cfg.smartOptimizationEnabled}
            onCheckedChange={v => setCfg(c => ({ ...c, smartOptimizationEnabled: v }))}
          />
        </div>

        <div className="pt-1">
          <Button onClick={handleSave} className="gap-2" size="sm">
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {isAr ? 'حفظ' : 'Save Engine Settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Rooms Tab ─────────────────────────────────────────────────────────────────
const RoomsTab: React.FC<{ clinicId: string; language: string }> = ({ clinicId, language }) => {
  const isAr = language === 'ar';
  const [rooms, setRooms] = React.useState<Room[]>([]);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ name: '', nameAr: '', number: '', type: 'examination' as RoomType, floor: '' });

  React.useEffect(() => {
    const load = () => {
      let all = roomStore.getAll().filter(r => r.clinicId === clinicId);
      if (all.length === 0) { SEED_ROOMS(clinicId).forEach(r => roomStore.add(r)); all = roomStore.getAll().filter(r => r.clinicId === clinicId); }
      setRooms(all);
    };
    load();
    return roomStore.subscribe(load);
  }, [clinicId]);

  const startEdit = (room: Room) => {
    setEditId(room.id);
    setForm({ name: room.name, nameAr: room.nameAr, number: room.number, type: room.type, floor: room.floor?.toString() || '' });
  };

  const saveEdit = () => {
    if (!editId) return;
    roomStore.update(r => r.id === editId, { name: form.name, nameAr: form.nameAr, number: form.number, type: form.type as RoomType, floor: form.floor ? parseInt(form.floor) : undefined });
    setEditId(null);
    setForm({ name: '', nameAr: '', number: '', type: 'examination', floor: '' });
  };

  const addRoom = () => {
    if (!form.name || !form.nameAr) return;
    const colors: Record<RoomType, string> = { examination: '#3b82f6', procedure: '#8b5cf6', xray: '#f59e0b', lab: '#10b981', waiting: '#6b7280', office: '#ec4899' };
    roomStore.add({ clinicId, name: form.name, nameAr: form.nameAr, number: form.number, type: form.type, typeAr: ROOM_TYPE_LABELS[form.type]?.ar || '', status: 'available', color: colors[form.type] || '#3b82f6', isActive: true });
    setForm({ name: '', nameAr: '', number: '', type: 'examination', floor: '' });
  };

  const typeOptions: { value: RoomType; en: string; ar: string }[] = [
    { value: 'examination', en: 'Examination', ar: 'كشف' },
    { value: 'procedure', en: 'Procedure', ar: 'إجراء' },
    { value: 'xray', en: 'X-Ray', ar: 'أشعة' },
    { value: 'lab', en: 'Laboratory', ar: 'مختبر' },
    { value: 'waiting', en: 'Waiting', ar: 'انتظار' },
    { value: 'office', en: 'Office', ar: 'مكتب' },
  ];

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><DoorOpen className="h-5 w-5 text-primary" />{isAr ? 'إدارة الغرف' : 'Room Management'}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {/* Add form */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-muted/30 rounded-lg">
          <input className="h-8 text-sm rounded-md border px-2 bg-background" placeholder={isAr ? 'الاسم بالإنجليزية' : 'Name (EN)'} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <input className="h-8 text-sm rounded-md border px-2 bg-background" placeholder={isAr ? 'الاسم بالعربية' : 'Name (AR)'} value={form.nameAr} onChange={e => setForm(p => ({ ...p, nameAr: e.target.value }))} />
          <input className="h-8 text-sm rounded-md border px-2 bg-background" placeholder={isAr ? 'الرقم' : 'Number'} value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value }))} />
          <select className="h-8 text-sm rounded-md border px-2 bg-background" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as RoomType }))}>
            {typeOptions.map(t => <option key={t.value} value={t.value}>{isAr ? t.ar : t.en}</option>)}
          </select>
          <input className="h-8 text-sm rounded-md border px-2 bg-background" placeholder={isAr ? 'الطابق' : 'Floor'} type="number" value={form.floor} onChange={e => setForm(p => ({ ...p, floor: e.target.value }))} />
          <div className="flex gap-1">
            <Button size="sm" className="h-8 gap-1 flex-1" onClick={editId ? saveEdit : addRoom}>
              {editId ? (isAr ? 'حفظ' : 'Save') : <><Plus className="h-3.5 w-3.5" />{isAr ? 'إضافة' : 'Add'}</>}
            </Button>
            {editId && (
              <Button size="sm" variant="outline" className="h-8" onClick={() => { setEditId(null); setForm({ name: '', nameAr: '', number: '', type: 'examination', floor: '' }); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        {/* Room list */}
        <div className="space-y-2">
          {rooms.map(room => {
            const colors = ROOM_STATUS_COLORS[room.status];
            const typeLabel = ROOM_TYPE_LABELS[room.type];
            return (
              <div key={room.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colors.dot }} />
                  <div>
                    <p className="font-medium text-sm">{isAr ? room.nameAr : room.name} {room.number && <span className="text-muted-foreground">#{room.number}</span>}</p>
                    <p className="text-xs text-muted-foreground">{isAr ? typeLabel.ar : typeLabel.en}{room.floor ? ` · ${isAr ? 'الطابق' : 'Floor'} ${room.floor}` : ''}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(room)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => roomStore.update(r => r.id === room.id, { isActive: !room.isActive })}>
                    {room.isActive ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Main Settings Page ────────────────────────────────────────────────────────
const Settings: React.FC = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { settings, updateSettings } = useClinicSettings();
  const [form, setForm] = useState<ClinicSettings>({ ...settings });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clinicId = user?.clinicId || 'clinic-1';
  const { modules, toggleModule } = useModules(clinicId);

  const handleSave = () => {
    updateSettings(form);
    toast.success(language === 'ar' ? 'تم حفظ الإعدادات' : 'Settings saved');
  };

  const set = (key: keyof ClinicSettings, value: string | boolean | number) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(language === 'ar' ? 'يرجى اختيار صورة' : 'Please select an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(language === 'ar' ? 'الحد الأقصى 2 ميجابايت' : 'Max file size is 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { set('logo', reader.result as string); };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-settings-title">
          {language === 'ar' ? 'الإعدادات' : 'Settings'}
        </h1>
        <p className="text-muted-foreground">
          {language === 'ar' ? 'إعدادات العيادة والعلامة التجارية' : 'Clinic branding & configuration'}
        </p>
      </div>

      <Tabs defaultValue="clinic-info" className="w-full">
        <TabsList className="w-full" data-testid="tabs-settings">
          <TabsTrigger value="clinic-info" data-testid="tab-clinic-info">
            <Building2 className="h-4 w-4 mr-1.5" />
            {language === 'ar' ? 'معلومات العيادة' : 'Clinic Info'}
          </TabsTrigger>
          <TabsTrigger value="branding" data-testid="tab-branding">
            <ImageIcon className="h-4 w-4 mr-1.5" />
            {language === 'ar' ? 'العلامة التجارية' : 'Branding'}
          </TabsTrigger>
          <TabsTrigger value="tax" data-testid="tab-tax">
            <Percent className="h-4 w-4 mr-1.5" />
            {language === 'ar' ? 'الضريبة' : 'Tax/VAT'}
          </TabsTrigger>
          <TabsTrigger value="visit-types" data-testid="tab-visit-types">
            <ClipboardList className="h-4 w-4 mr-1.5" />
            {language === 'ar' ? 'أنواع الزيارات' : 'Visit Types'}
          </TabsTrigger>
          <TabsTrigger value="queue-strategy" data-testid="tab-queue-strategy">
            <Layers className="h-4 w-4 mr-1.5" />
            {language === 'ar' ? 'الطابور' : 'Queue'}
          </TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">
            <Bell className="h-4 w-4 mr-1.5" />
            {language === 'ar' ? 'الإشعارات' : 'Notifications'}
          </TabsTrigger>
          <TabsTrigger value="rooms" data-testid="tab-rooms">
            <DoorOpen className="h-4 w-4 mr-1.5" />
            {language === 'ar' ? 'الغرف' : 'Rooms'}
          </TabsTrigger>
          <TabsTrigger value="whatsapp" data-testid="tab-whatsapp">
            <MessageSquare className="h-4 w-4 mr-1.5 text-green-500" />
            {language === 'ar' ? 'واتساب' : 'WhatsApp'}
          </TabsTrigger>
          <TabsTrigger value="modules" data-testid="tab-modules">
            <Puzzle className="h-4 w-4 mr-1.5" />
            {language === 'ar' ? 'الوحدات' : 'Modules'}
          </TabsTrigger>
          <TabsTrigger value="installments" data-testid="tab-installments">
            <CreditCard className="h-4 w-4 mr-1.5 text-primary" />
            {language === 'ar' ? 'التقسيط' : 'Installments'}
          </TabsTrigger>
          <TabsTrigger value="subscription" data-testid="tab-subscription">
            <Zap className="h-4 w-4 mr-1.5 text-primary" />
            {language === 'ar' ? 'الاشتراك' : 'Subscription'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clinic-info">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5" />
                {language === 'ar' ? 'معلومات العيادة' : 'Clinic Information'}
              </CardTitle>
              <CardDescription>
                {language === 'ar'
                  ? 'تظهر هذه المعلومات على الفواتير المطبوعة'
                  : 'This information appears on printed invoices'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'اسم العيادة (إنجليزي)' : 'Clinic Name (English)'}</Label>
                  <Input data-testid="input-clinic-name" value={form.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'اسم العيادة (عربي)' : 'Clinic Name (Arabic)'}</Label>
                  <Input data-testid="input-clinic-name-ar" value={form.nameAr} onChange={e => set('nameAr', e.target.value)} dir="rtl" />
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'العنوان (إنجليزي)' : 'Address (English)'}</Label>
                  <Input data-testid="input-address" value={form.address} onChange={e => set('address', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'العنوان (عربي)' : 'Address (Arabic)'}</Label>
                  <Input data-testid="input-address-ar" value={form.addressAr} onChange={e => set('addressAr', e.target.value)} dir="rtl" />
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'الهاتف' : 'Phone'}</Label>
                  <Input data-testid="input-phone" value={form.phone} onChange={e => set('phone', e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'البريد الإلكتروني' : 'Email'}</Label>
                  <Input data-testid="input-email" value={form.email} onChange={e => set('email', e.target.value)} dir="ltr" />
                </div>
              </div>

              <Separator />

              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-3">
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {language === 'ar' ? 'أسعار الخدمات الأساسية' : 'Base Service Fees'}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'مبلغ الكشف' : 'Examination Fee'}</Label>
                    <div className="relative">
                      <Input
                        data-testid="input-examination-fee"
                        type="number"
                        min={0}
                        step={5}
                        value={form.examinationFee}
                        onChange={e => set('examinationFee', Number(e.target.value))}
                        className="pe-12"
                        dir="ltr"
                      />
                      <span className="absolute inset-y-0 end-0 flex items-center px-3 text-sm text-muted-foreground select-none pointer-events-none">
                        ج.م
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {language === 'ar' ? 'رسوم الكشف الأولي على المريض' : 'Initial patient examination charge'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'مبلغ الاستشارة' : 'Consultation Fee'}</Label>
                    <div className="relative">
                      <Input
                        data-testid="input-consultation-fee"
                        type="number"
                        min={0}
                        step={5}
                        value={form.consultationFee}
                        onChange={e => set('consultationFee', Number(e.target.value))}
                        className="pe-12"
                        dir="ltr"
                      />
                      <span className="absolute inset-y-0 end-0 flex items-center px-3 text-sm text-muted-foreground select-none pointer-events-none">
                        ج.م
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {language === 'ar' ? 'رسوم الاستشارة الطبية المتخصصة' : 'Specialist medical consultation charge'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ImageIcon className="h-5 w-5" />
                {language === 'ar' ? 'شعار العيادة' : 'Clinic Logo'}
              </CardTitle>
              <CardDescription>
                {language === 'ar'
                  ? 'يظهر الشعار على الفواتير المطبوعة (الحد الأقصى 2 ميجابايت)'
                  : 'Logo appears on printed invoices (max 2MB)'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 rounded-lg">
                  {form.logo ? (
                    <AvatarImage src={form.logo} alt="Clinic logo" className="object-cover" />
                  ) : (
                    <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-lg font-bold">
                      {form.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  <Button data-testid="button-upload-logo" variant="outline" size="sm" className="gap-1" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4" />
                    {language === 'ar' ? 'رفع شعار' : 'Upload'}
                  </Button>
                  {form.logo && (
                    <Button data-testid="button-remove-logo" variant="ghost" size="sm" className="gap-1 text-destructive" onClick={() => set('logo', '')}>
                      <X className="h-4 w-4" />
                      {language === 'ar' ? 'إزالة' : 'Remove'}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tax">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Percent className="h-5 w-5" />
                {language === 'ar' ? 'إعدادات الضريبة' : 'Tax / VAT Settings'}
              </CardTitle>
              <CardDescription>
                {language === 'ar'
                  ? 'تطبق الضريبة تلقائياً على إجماليات الفواتير'
                  : 'Tax is automatically applied to invoice totals'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="tax-toggle" className="flex flex-col gap-1">
                  <span>{language === 'ar' ? 'تفعيل الضريبة' : 'Enable Tax'}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {language === 'ar' ? 'إضافة ضريبة على الفواتير' : 'Add tax line to invoices'}
                  </span>
                </Label>
                <Switch
                  id="tax-toggle"
                  data-testid="switch-tax-toggle"
                  checked={form.taxEnabled}
                  onCheckedChange={v => set('taxEnabled', v)}
                />
              </div>

              {form.taxEnabled && (
                <>
                  <Separator />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'النسبة (%)' : 'Rate (%)'}</Label>
                      <Input
                        data-testid="input-tax-rate"
                        type="number"
                        min={0}
                        max={100}
                        value={form.taxRate}
                        onChange={e => set('taxRate', parseFloat(e.target.value) || 0)}
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'التسمية (إنجليزي)' : 'Label (English)'}</Label>
                      <Input data-testid="input-tax-label" value={form.taxLabel} onChange={e => set('taxLabel', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'التسمية (عربي)' : 'Label (Arabic)'}</Label>
                      <Input data-testid="input-tax-label-ar" value={form.taxLabelAr} onChange={e => set('taxLabelAr', e.target.value)} dir="rtl" />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visit-types">
          <VisitTypesTab clinicId={clinicId} language={language} />
        </TabsContent>

        <TabsContent value="queue-strategy">
          <QueueStrategyTab clinicId={clinicId} language={language} />
        </TabsContent>

        <TabsContent value="rooms">
          <RoomsTab clinicId={clinicId} language={language} />
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bell className="h-5 w-5" />
                {language === 'ar' ? 'إعدادات الإشعارات' : 'Notification Settings'}
              </CardTitle>
              <CardDescription>
                {language === 'ar'
                  ? 'إدارة تفضيلات الإشعارات والتنبيهات'
                  : 'Manage notification preferences and alerts'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="text-notifications-placeholder">
                <Bell className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground text-sm">
                  {language === 'ar'
                    ? 'إعدادات الإشعارات ستكون متاحة قريباً'
                    : 'Notification settings coming soon'}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp">
          {user?.clinicId && <WhatsAppTab clinicId={user.clinicId} language={language} />}
        </TabsContent>

        <TabsContent value="modules">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Puzzle className="h-5 w-5" />
                {language === 'ar' ? 'إدارة الوحدات' : 'Module Management'}
              </CardTitle>
              <CardDescription>
                {language === 'ar'
                  ? 'تفعيل أو تعطيل الوحدات لهذه العيادة'
                  : 'Enable or disable feature modules for this clinic'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {([
                { name: 'finance'   as ModuleName, labelEn: 'Finance',   labelAr: 'المالية',           descEn: 'Dashboard, transactions & doctor earnings', descAr: 'التقارير المالية وأرباح الأطباء' },
                { name: 'inventory' as ModuleName, labelEn: 'Inventory', labelAr: 'المخزن',             descEn: 'Stock, suppliers & dispensing',              descAr: 'إدارة المخزون والموردين' },
                { name: 'ai'        as ModuleName, labelEn: 'AI',        labelAr: 'الذكاء الاصطناعي', descEn: 'AI scribe, SOAP notes & smart booking',      descAr: 'الكتابة الذكية والحجز الذكي' },
                { name: 'insurance' as ModuleName, labelEn: 'Insurance', labelAr: 'التأمين',           descEn: 'Companies, billing split & claims',          descAr: 'شركات التأمين والمطالبات' },
                { name: 'reports'   as ModuleName, labelEn: 'Reports',   labelAr: 'التقارير',          descEn: 'Analytics, BI dashboard & exports',          descAr: 'التحليلات ولوحة البيانات' },
              ] as const).map(mod => (
                <div key={mod.name} className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
                  <div className="space-y-0.5">
                    <p className="font-medium text-sm">{language === 'ar' ? mod.labelAr : mod.labelEn}</p>
                    <p className="text-xs text-muted-foreground">{language === 'ar' ? mod.descAr : mod.descEn}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${modules[mod.name] ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {modules[mod.name]
                        ? (language === 'ar' ? 'مفعّل' : 'ON')
                        : (language === 'ar' ? 'معطّل' : 'OFF')}
                    </span>
                    <Switch
                      checked={modules[mod.name]}
                      onCheckedChange={val => toggleModule(mod.name, val)}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Installments tab */}
        <TabsContent value="installments">
          <InstallmentSettingsTab clinicId={user?.clinicId || ''} language={language} />
        </TabsContent>

        {/* STEP 7 — Subscription tab */}
        <TabsContent value="subscription">
          <SubscriptionTab clinicId={user?.clinicId || ''} language={language} />
        </TabsContent>

      </Tabs>

      <div>
        <Button data-testid="button-save-settings" onClick={handleSave} className="gap-2">
          <Save className="h-4 w-4" />
          {language === 'ar' ? 'حفظ الإعدادات' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
};

export default Settings;
