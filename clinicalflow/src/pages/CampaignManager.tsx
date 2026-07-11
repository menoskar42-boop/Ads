import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { getToken } from '@/utils/authToken';
import {
  campaignStore, campaignLogStore,
  Campaign, CampaignType, CampaignSegment,
  RECALL_TEMPLATE_AR, BROADCAST_TEMPLATE_AR,
  RECALL_TEMPLATE_EN, BROADCAST_TEMPLATE_EN,
  renderTemplate, isInCooldown, logCampaignSend,
} from '@/stores/campaignStore';
import { patientStore } from '@/stores/patientStore';
import { visitStore } from '@/stores/visitStore';
import { getClinicById } from '@/stores/clinicStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Megaphone, Plus, Play, Trash2, Clock, Users, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface RunResult { sent: number; skipped: number; nophone: number; }

const EMPTY_FORM = {
  name: '', nameAr: '',
  type: 'recall' as CampaignType,
  messageAr: RECALL_TEMPLATE_AR,
  messageEn: RECALL_TEMPLATE_EN,
  daysSinceLastVisit: 30,
  segment: 'all' as CampaignSegment,
  cooldownDays: 14,
  isActive: true,
};

const CampaignManager: React.FC = () => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const isAr = language === 'ar';
  const clinicId = user?.clinicId || '';
  const clinic = getClinicById(clinicId);

  const [campaigns, setCampaigns] = useState(() =>
    campaignStore.filter(c => c.clinicId === clinicId)
  );
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [running, setRunning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);

  const refresh = () => setCampaigns(campaignStore.filter(c => c.clinicId === clinicId));

  // ── Create campaign ────────────────────────────────────────────────────────
  const handleCreate = () => {
    if (!form.name || !form.messageAr) {
      toast.error(isAr ? 'الاسم والرسالة مطلوبان' : 'Name and message are required');
      return;
    }
    campaignStore.add({
      ...form,
      id: `camp-${Date.now()}`,
      clinicId,
      createdAt: new Date().toISOString(),
    });
    setForm(EMPTY_FORM);
    setShowForm(false);
    refresh();
    toast.success(isAr ? 'تم إنشاء الحملة' : 'Campaign created');
  };

  const handleDelete = (id: string) => {
    campaignStore.remove(c => c.id === id);
    refresh();
    toast.info(isAr ? 'تم حذف الحملة' : 'Campaign deleted');
  };

  const handleToggle = (id: string, isActive: boolean) => {
    campaignStore.update(c => c.id === id, { isActive: !isActive });
    refresh();
  };

  // ── Run campaign ───────────────────────────────────────────────────────────
  const handleRun = async (campaign: Campaign) => {
    setRunning(campaign.id);
    setLastResult(null);
    const result: RunResult = { sent: 0, skipped: 0, nophone: 0 };
    const batch: { phone: string; message: string }[] = [];
    const clinicName = isAr ? (clinic?.nameAr || 'العيادة') : (clinic?.name || 'Clinic');

    try {
      const patients = patientStore.filter(
        p => !p.clinicId || p.clinicId === clinicId,
      );

      for (const patient of patients) {
        if (!patient.phone) { result.nophone++; continue; }

        // STEP 6: Cooldown guard
        if (isInCooldown(campaign.id, patient.id, campaign.cooldownDays)) {
          result.skipped++;
          continue;
        }

        // STEP 2: Recall — check days since last visit
        if (campaign.type === 'recall') {
          const visits = visitStore.filter(v => v.patientId === patient.id && v.status === 'completed');
          const lastVisit = visits.sort((a, b) => b.date.localeCompare(a.date))[0];
          const daysSince = lastVisit
            ? Math.floor((Date.now() - new Date(lastVisit.date).getTime()) / 86_400_000)
            : Infinity;
          if (daysSince < (campaign.daysSinceLastVisit ?? 30)) { result.skipped++; continue; }
        }

        // STEP 4: Broadcast segment filter
        if (campaign.type === 'broadcast' && campaign.segment === 'no_show') {
          const hasNoShow = visitStore.filter(v => v.patientId === patient.id && v.status === 'no_show').length > 0;
          if (!hasNoShow) { result.skipped++; continue; }
        }

        // STEP 3: Render template
        const name = isAr ? (patient.nameAr || patient.name) : patient.name;
        const message = renderTemplate(campaign.messageAr, {
          name,
          days: String(campaign.daysSinceLastVisit ?? 30),
          clinic: clinicName,
        });

        batch.push({ phone: patient.phone, message });

        // Log optimistically
        logCampaignSend({
          campaignId: campaign.id,
          patientId: patient.id,
          phone: patient.phone,
          sentAt: new Date().toISOString(),
          status: 'sent',
        });
        result.sent++;
      }

      // STEP 5: Send batch to server
      if (batch.length > 0) {
        const token = getToken();
        await fetch('/api/campaigns/send-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ messages: batch, clinicId }),
        });
      }

      campaignStore.update(c => c.id === campaign.id, { lastRunAt: new Date().toISOString() });
      refresh();
      setLastResult(result);
      toast.success(
        isAr
          ? `أُرسلت ${result.sent} رسالة، تجاوزنا ${result.skipped}`
          : `Sent ${result.sent}, skipped ${result.skipped}`,
      );
    } catch {
      toast.error(isAr ? 'فشل تشغيل الحملة' : 'Campaign run failed');
    } finally {
      setRunning(null);
    }
  };

  // ── Form type change → update default templates ────────────────────────────
  const handleTypeChange = (type: CampaignType) => {
    setForm(f => ({
      ...f,
      type,
      messageAr: type === 'recall' ? RECALL_TEMPLATE_AR : BROADCAST_TEMPLATE_AR,
      messageEn: type === 'recall' ? RECALL_TEMPLATE_EN : BROADCAST_TEMPLATE_EN,
    }));
  };

  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(isAr ? 'ar-EG' : 'en-US') : '—';

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            {isAr ? 'حملات التواصل مع المرضى' : 'Patient Campaigns'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isAr ? 'استدعاء المرضى والبث الجماعي عبر واتساب' : 'Recall & broadcast via WhatsApp'}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-4 w-4" />
          {isAr ? 'حملة جديدة' : 'New Campaign'}
        </Button>
      </div>

      {/* Last result banner */}
      {lastResult && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-3 flex items-center gap-4 flex-wrap text-sm">
            <span className="font-semibold text-green-800">
              {isAr ? 'نتيجة آخر تشغيل:' : 'Last run result:'}
            </span>
            <Badge className="bg-green-600">{lastResult.sent} {isAr ? 'أُرسلت' : 'sent'}</Badge>
            <Badge variant="outline">{lastResult.skipped} {isAr ? 'تجاوزنا' : 'skipped'}</Badge>
            {lastResult.nophone > 0 && (
              <Badge variant="secondary">{lastResult.nophone} {isAr ? 'بدون رقم' : 'no phone'}</Badge>
            )}
            <button className="text-xs text-muted-foreground" onClick={() => setLastResult(null)}>✕</button>
          </CardContent>
        </Card>
      )}

      {/* Create form */}
      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">{isAr ? 'إنشاء حملة جديدة' : 'Create Campaign'}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{isAr ? 'الاسم (عربي)' : 'Name (Arabic)'}</Label>
                <Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} placeholder={isAr ? 'حملة الاستدعاء الشهري' : 'Monthly recall'} />
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Monthly Recall" />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>{isAr ? 'نوع الحملة' : 'Campaign Type'}</Label>
                <Select value={form.type} onValueChange={v => handleTypeChange(v as CampaignType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recall">{isAr ? 'استدعاء' : 'Recall'}</SelectItem>
                    <SelectItem value="broadcast">{isAr ? 'بث جماعي' : 'Broadcast'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.type === 'recall' && (
                <div className="space-y-1.5">
                  <Label>{isAr ? 'أيام منذ آخر زيارة' : 'Days since last visit'}</Label>
                  <Input type="number" min={1} max={365} value={form.daysSinceLastVisit}
                    onChange={e => setForm(f => ({ ...f, daysSinceLastVisit: Number(e.target.value) }))} />
                </div>
              )}
              {form.type === 'broadcast' && (
                <div className="space-y-1.5">
                  <Label>{isAr ? 'الشريحة المستهدفة' : 'Target Segment'}</Label>
                  <Select value={form.segment} onValueChange={v => setForm(f => ({ ...f, segment: v as CampaignSegment }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{isAr ? 'جميع المرضى' : 'All Patients'}</SelectItem>
                      <SelectItem value="no_show">{isAr ? 'لم يحضروا' : 'No-shows'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{isAr ? 'أيام الكول-داون' : 'Cooldown Days'}</Label>
                <Input type="number" min={1} max={90} value={form.cooldownDays}
                  onChange={e => setForm(f => ({ ...f, cooldownDays: Number(e.target.value) }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{isAr ? 'نص الرسالة (عربي) — متغيرات: {{name}} {{days}} {{clinic}}' : 'Message (Arabic) — vars: {{name}} {{days}} {{clinic}}'}</Label>
              <Textarea rows={3} value={form.messageAr} onChange={e => setForm(f => ({ ...f, messageAr: e.target.value }))} />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreate}>{isAr ? 'حفظ الحملة' : 'Save Campaign'}</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Campaign list */}
      {campaigns.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {isAr ? 'لا توجد حملات بعد. أنشئ حملتك الأولى.' : 'No campaigns yet. Create your first one.'}
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => {
            const logs = campaignLogStore.filter(l => l.campaignId === c.id && l.status === 'sent');
            return (
              <Card key={c.id} className={c.isActive ? '' : 'opacity-60'}>
                <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{isAr ? c.nameAr : c.name}</p>
                      <Badge variant={c.type === 'recall' ? 'default' : 'secondary'} className="text-xs">
                        {c.type === 'recall' ? (isAr ? 'استدعاء' : 'Recall') : (isAr ? 'بث' : 'Broadcast')}
                      </Badge>
                      <Badge variant={c.isActive ? 'default' : 'outline'} className={`text-xs ${c.isActive ? 'bg-green-600 hover:bg-green-600' : ''}`}>
                        {c.isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'متوقف' : 'Paused')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{c.messageAr}</p>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                      {c.type === 'recall' && (
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{c.daysSinceLastVisit}d</span>
                      )}
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{logs.length} {isAr ? 'مُرسل' : 'sent'}</span>
                      <span><RefreshCw className="h-3 w-3 inline" /> {fmtDate(c.lastRunAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={c.isActive} onCheckedChange={() => handleToggle(c.id, c.isActive)} />
                    <Button
                      size="sm"
                      className="gap-1.5 h-8"
                      disabled={running === c.id || !c.isActive}
                      onClick={() => handleRun(c)}
                    >
                      {running === c.id
                        ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        : <Play className="h-3.5 w-3.5" />}
                      {isAr ? 'تشغيل' : 'Run'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CampaignManager;
