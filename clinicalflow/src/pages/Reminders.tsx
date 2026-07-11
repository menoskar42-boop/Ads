import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useAppointments } from '@/hooks/useVisits';
import { usePatients } from '@/hooks/usePatients';
import { useUsers } from '@/hooks/useUsers';
import { reminderRuleStore, ReminderRule, ReminderTrigger } from '@/stores/reminderRuleStore';
import { reminderStore, simulateSendReminder } from '@/stores/reminderStore';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, Send, CheckCircle2, Clock, MessageSquare, Settings2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const TRIGGER_LABELS: Record<ReminderTrigger, { en: string; ar: string }> = {
  '24h_before': { en: '24h Before',  ar: 'قبل 24 ساعة' },
  '2h_before':  { en: '2h Before',   ar: 'قبل ساعتين' },
  'post_visit': { en: 'After Visit', ar: 'بعد الزيارة' },
  'no_show':    { en: 'No-Show',     ar: 'لم يحضر' },
};

const Reminders: React.FC = () => {
  const { isAr, language } = useLanguage();
  const { user } = useAuth();
  const { appointments } = useAppointments();
  const { patients } = usePatients();
  const { doctors } = useUsers();

  const [rules, setRules] = useState<ReminderRule[]>(() => reminderRuleStore.getAll());
  const [logs, setLogs] = useState(() => reminderStore.getAll());
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    const unsub = reminderRuleStore.subscribe(() => setRules(reminderRuleStore.getAll()));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = reminderStore.subscribe(() => setLogs(reminderStore.getAll()));
    return unsub;
  }, []);

  const { settings: clinicSettings } = useClinicSettings();
  const clinicName = clinicSettings?.clinicName || '';

  const toggleRule = (id: string, isActive: boolean) => {
    reminderRuleStore.update(r => r.id === id, { isActive });
  };

  const updateTemplate = (id: string, field: 'templateAr' | 'templateEn', value: string) => {
    reminderRuleStore.update(r => r.id === id, { [field]: value });
    setRules(reminderRuleStore.getAll());
  };

  // Send reminder to upcoming appointments (simulate)
  const handleSendBatch = async (trigger: ReminderTrigger) => {
    const rule = rules.find(r => r.trigger === trigger && r.isActive);
    if (!rule) return;
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const targetDate = trigger === '24h_before' ? tomorrow : today;
    const toRemind = appointments.filter(a => a.date === targetDate && a.status === 'scheduled');
    if (toRemind.length === 0) {
      toast.info(isAr ? 'لا مواعيد تستحق التذكير' : 'No appointments to remind');
      return;
    }
    setSending(trigger);
    let sent = 0;
    for (const appt of toRemind) {
      const patient = patients.find(p => p.id === appt.patientId);
      const doctor = doctors.find(d => d.id === appt.doctorId);
      if (!patient) continue;
      simulateSendReminder({
        appointmentId: appt.id,
        patientName: isAr ? patient.nameAr : patient.name,
        doctorName: doctor ? (isAr ? doctor.nameAr : doctor.name) : '',
        date: appt.date,
        time: appt.time,
        type: trigger === '24h_before' ? '24h' : trigger === '2h_before' ? '2h' : 'confirmation',
        channel: rule.channel,
        clinicName: clinicName,
        clinicAddress: clinicSettings?.address || '',
        language: language as 'en' | 'ar',
      });
      sent++;
      await new Promise(r => setTimeout(r, 150));
    }
    setSending(null);
    toast.success(isAr ? `تم إرسال ${sent} تذكير` : `${sent} reminder(s) sent`);
  };

  const sentCount = logs.filter(l => l.status === 'sent').length;
  const todayLogs = logs.filter(l => l.sentAt?.startsWith(new Date().toISOString().split('T')[0]));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{isAr ? 'التذكيرات الذكية' : 'Smart Reminders'}</h1>
          <p className="text-sm text-muted-foreground">{isAr ? 'إرسال تذكيرات تلقائية للمرضى عبر واتساب' : 'Automated WhatsApp reminders for patients'}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: isAr ? 'تم الإرسال الكلي' : 'Total Sent',   value: sentCount,          icon: CheckCircle2, color: 'text-green-500' },
          { label: isAr ? 'إرسال اليوم' : 'Sent Today',        value: todayLogs.length,   icon: Clock,        color: 'text-blue-500' },
          { label: isAr ? 'قواعد نشطة' : 'Active Rules',       value: rules.filter(r => r.isActive).length, icon: Bell, color: 'text-primary' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`h-8 w-8 ${s.color}`} />
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules" className="gap-1.5"><Settings2 className="h-4 w-4" />{isAr ? 'القواعد' : 'Rules'}</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5"><MessageSquare className="h-4 w-4" />{isAr ? 'السجل' : 'Log'}</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4 mt-4">
          {rules.map(rule => (
            <Card key={rule.id} className={rule.isActive ? 'border-primary/30' : 'opacity-70'}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bell className={`h-5 w-5 ${rule.isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div>
                      <p className="font-medium text-sm">{isAr ? TRIGGER_LABELS[rule.trigger].ar : TRIGGER_LABELS[rule.trigger].en}</p>
                      <Badge variant="outline" className="text-xs mt-0.5">{rule.channel}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={rule.isActive} onCheckedChange={v => toggleRule(rule.id, v)} />
                    {rule.isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs"
                        disabled={sending === rule.trigger}
                        onClick={() => handleSendBatch(rule.trigger)}
                      >
                        {sending === rule.trigger
                          ? <RefreshCw className="h-3 w-3 animate-spin" />
                          : <Send className="h-3 w-3" />}
                        {isAr ? 'إرسال الآن' : 'Send Now'}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{isAr ? 'القالب العربي' : 'Arabic Template'}</label>
                    <Textarea
                      rows={2}
                      value={rule.templateAr}
                      onChange={e => updateTemplate(rule.id, 'templateAr', e.target.value)}
                      className="resize-none text-xs"
                      dir="rtl"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{isAr ? 'القالب الإنجليزي' : 'English Template'}</label>
                    <Textarea
                      rows={2}
                      value={rule.templateEn}
                      onChange={e => updateTemplate(rule.id, 'templateEn', e.target.value)}
                      className="resize-none text-xs"
                      dir="ltr"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAr ? 'المتغيرات: {{name}} {{date}} {{time}} {{doctor}} {{clinic}}' : 'Variables: {{name}} {{date}} {{time}} {{doctor}} {{clinic}}'}
                </p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {logs.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{isAr ? 'لم يتم إرسال أي تذكيرات بعد' : 'No reminders sent yet'}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {logs.slice().reverse().slice(0, 50).map(log => (
                    <div key={log.id} className="flex items-start gap-3 p-4">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{log.patientName}</span>
                          <Badge variant="outline" className="text-xs">{log.type}</Badge>
                          <Badge variant="outline" className="text-xs">{log.channel}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{log.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{new Date(log.sentAt).toLocaleString(isAr ? 'ar-EG' : 'en-GB')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reminders;
