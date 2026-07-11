import React, { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppointments } from '@/hooks/useVisits';
import { useAuth } from '@/hooks/useAuth';
import { useDoctorFollowUp } from '@/hooks/useDoctorFollowUp';
import { formatDate } from '@/lib/dateFormat';
import { Bell, Calendar, X, Clock, AlertTriangle, Lightbulb, ArrowRight, CreditCard } from 'lucide-react';
import { getInstallmentSettings, getOverdueInstallments, getUpcomingInstallments } from '@/stores/installmentStore';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

type NotifUrgency = 'high' | 'medium' | 'low';

interface Notification {
  id:            string;
  type:          'reminder_today' | 'reminder_tomorrow' | 'appointment';
  urgency:       NotifUrgency;
  titleEn:       string;
  titleAr:       string;
  descriptionEn: string;
  descriptionAr: string;
}

const NotificationBell: React.FC = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { appointments } = useAppointments();
  const { pendingRules, dismiss: dismissFollowUp } = useDoctorFollowUp();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // ── Installment notifications (admin/reception only) ──────────────────────
  const installmentNotifs = useMemo((): Notification[] => {
    if (!user?.clinicId || user.role === 'doctor' || user.role === 'patient') return [];
    const settings = getInstallmentSettings(user.clinicId);
    if (!settings.enabled) return [];

    const items: Notification[] = [];
    const overdue   = getOverdueInstallments(user.clinicId);
    const upcoming  = getUpcomingInstallments(user.clinicId, settings.reminderDaysBefore);

    overdue.slice(0, 5).forEach(inst => {
      items.push({
        id:            `inst-overdue-${inst.id}`,
        type:          'reminder_today',
        urgency:       'high',
        titleEn:       `Overdue Installment — ${inst.dueDate}`,
        titleAr:       `قسط متأخر — ${inst.dueDate}`,
        descriptionEn: `${inst.amount} EGP overdue for invoice ${inst.invoiceId.slice(0, 8)}`,
        descriptionAr: `${inst.amount} ج.م متأخر لفاتورة ${inst.invoiceId.slice(0, 8)}`,
      });
    });

    upcoming.slice(0, 3).forEach(inst => {
      items.push({
        id:            `inst-due-${inst.id}`,
        type:          'reminder_tomorrow',
        urgency:       'medium',
        titleEn:       `Installment Due — ${inst.dueDate}`,
        titleAr:       `قسط مستحق — ${inst.dueDate}`,
        descriptionEn: `${inst.amount} EGP due for invoice ${inst.invoiceId.slice(0, 8)}`,
        descriptionAr: `${inst.amount} ج.م مستحق لفاتورة ${inst.invoiceId.slice(0, 8)}`,
      });
    });

    return items;
  }, [user?.clinicId, user?.role]);

  const notifications = useMemo(() => {
    const items: Notification[] = [];
    const today    = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];

    const active = appointments.filter(
      a => a.status === 'scheduled' || a.status === 'confirmed'
    );

    // Doctors only see their own appointments
    const relevant = user?.role === 'doctor'
      ? active.filter(a => a.doctorId === user.id)
      : active;

    // Today → high urgency
    relevant
      .filter(a => a.date === today)
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach(a => {
        items.push({
          id:            `rem-today-${a.id}`,
          type:          'reminder_today',
          urgency:       'high',
          titleEn:       `Today at ${a.time}`,
          titleAr:       `اليوم الساعة ${a.time}`,
          descriptionEn: `Patient ID: ${a.patientId.slice(0, 8)}`,
          descriptionAr: `رقم المريض: ${a.patientId.slice(0, 8)}`,
        });
      });

    // Tomorrow → medium urgency
    relevant
      .filter(a => a.date === tomorrow)
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach(a => {
        items.push({
          id:            `rem-tmrw-${a.id}`,
          type:          'reminder_tomorrow',
          urgency:       'medium',
          titleEn:       `Tomorrow at ${a.time}`,
          titleAr:       `غداً الساعة ${a.time}`,
          descriptionEn: `Patient ID: ${a.patientId.slice(0, 8)}`,
          descriptionAr: `رقم المريض: ${a.patientId.slice(0, 8)}`,
        });
      });

    // Future → low urgency (max 5)
    relevant
      .filter(a => a.date > tomorrow)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .slice(0, 5)
      .forEach(a => {
        items.push({
          id:            `apt-${a.id}`,
          type:          'appointment',
          urgency:       'low',
          titleEn:       `${formatDate(a.date, 'en')} at ${a.time}`,
          titleAr:       `${formatDate(a.date, 'ar')} الساعة ${a.time}`,
          descriptionEn: `Scheduled appointment`,
          descriptionAr: `موعد مجدول`,
        });
      });

    return items.filter(n => !dismissedIds.has(n.id));
  }, [appointments, dismissedIds, user]);

  const dismiss    = (id: string) => setDismissedIds(prev => new Set(prev).add(id));
  const dismissAll = () => setDismissedIds(prev => {
    const next = new Set(prev);
    notifications.forEach(n => next.add(n.id));
    installmentNotifs.forEach(n => next.add(n.id));
    return next;
  });

  const visibleInstallmentNotifs = installmentNotifs.filter(n => !dismissedIds.has(n.id));
  const count          = notifications.length + pendingRules.length + visibleInstallmentNotifs.length;
  const hasHighUrgency = notifications.some(n => n.urgency === 'high') ||
                         pendingRules.some(r => r.urgency === 'high') ||
                         visibleInstallmentNotifs.some(n => n.urgency === 'high');

  const getIcon = (type: Notification['type']) => {
    if (type === 'reminder_today')    return <AlertTriangle className="h-4 w-4 text-destructive" />;
    if (type === 'reminder_tomorrow') return <Clock className="h-4 w-4 text-chart-4" />;
    return <Calendar className="h-4 w-4 text-primary" />;
  };

  const getUrgencyStyle = (urgency: NotifUrgency) => {
    if (urgency === 'high')   return 'border-s-2 border-s-destructive bg-destructive/5';
    if (urgency === 'medium') return 'border-s-2 border-s-chart-4';
    return '';
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className={`h-5 w-5 ${hasHighUrgency ? 'text-destructive' : ''}`} />
          {count > 0 && (
            <Badge
              className={`absolute -top-1 -end-1 h-5 min-w-5 px-1 text-xs flex items-center justify-center
                ${hasHighUrgency ? 'bg-destructive' : 'bg-primary'} text-destructive-foreground`}
            >
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h4 className="font-semibold text-sm text-foreground">
            {language === 'ar' ? 'الإشعارات' : 'Notifications'}
          </h4>
          <div className="flex items-center gap-2">
            {count > 0 && (
              <Button
                variant="ghost" size="sm"
                className="h-6 text-xs text-muted-foreground"
                onClick={dismissAll}
              >
                {language === 'ar' ? 'مسح الكل' : 'Clear all'}
              </Button>
            )}
            <Badge variant="secondary" className="text-xs">{count}</Badge>
          </div>
        </div>

        <ScrollArea className="max-h-96">
          {count === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {language === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {/* ── Doctor follow-up activation tips ── */}
              {pendingRules.map(rule => {
                const followUpUrgencyStyle =
                  rule.urgency === 'high'   ? 'border-s-2 border-s-destructive bg-destructive/5' :
                  rule.urgency === 'medium' ? 'border-s-2 border-s-amber-500 bg-amber-500/5' :
                                              'border-s-2 border-s-primary/40 bg-primary/5';
                return (
                  <div
                    key={rule.id}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors ${followUpUrgencyStyle}`}
                    data-testid={`followup-notif-${rule.id}`}
                  >
                    <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {language === 'ar' ? rule.titleAr : rule.titleEn}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {language === 'ar' ? rule.messageAr : rule.messageEn}
                      </p>
                      {rule.actionRoute && (
                        <button
                          onClick={() => { navigate(rule.actionRoute!); dismissFollowUp(rule.id); }}
                          className="text-xs text-primary font-medium mt-1 flex items-center gap-1 hover:underline"
                        >
                          {language === 'ar' ? rule.actionLabelAr : rule.actionLabelEn}
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => dismissFollowUp(rule.id)}
                      data-testid={`button-dismiss-followup-${rule.id}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}

              {/* ── Installment reminders ── */}
              {visibleInstallmentNotifs.map(n => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors ${getUrgencyStyle(n.urgency)}`}
                  data-testid={`notif-installment-${n.id}`}
                >
                  <CreditCard className={`h-4 w-4 mt-0.5 shrink-0 ${n.urgency === 'high' ? 'text-destructive' : 'text-chart-4'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {language === 'ar' ? n.titleAr : n.titleEn}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {language === 'ar' ? n.descriptionAr : n.descriptionEn}
                    </p>
                    <button
                      onClick={() => navigate('/installments')}
                      className="text-xs text-primary font-medium mt-1 flex items-center gap-1 hover:underline"
                    >
                      {language === 'ar' ? 'عرض الأقساط' : 'View Installments'}
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => dismiss(n.id)}
                    data-testid={`button-dismiss-inst-${n.id}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              {/* ── Appointment reminders ── */}
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors ${getUrgencyStyle(n.urgency)}`}
                >
                  <div className="mt-0.5 shrink-0">{getIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {language === 'ar' ? n.titleAr : n.titleEn}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {language === 'ar' ? n.descriptionAr : n.descriptionEn}
                    </p>
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => dismiss(n.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
