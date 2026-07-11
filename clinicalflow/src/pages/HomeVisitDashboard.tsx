import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import {
  homeVisitRequestStore, HomeVisitRequest, HVRequestStatus,
  approveRequest, rejectRequest, completeRequest,
  getRequestsForDoctor,
} from '@/stores/homeVisitRequestStore';
import { useUsers } from '@/hooks/useUsers';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Home, MapPin, Calendar, Clock, Phone, User, CheckCircle2,
  XCircle, AlertCircle, ChevronDown, ChevronUp, History,
  Stethoscope, Inbox, CircleCheck
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(iso: string, isAr: boolean): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return isAr ? 'الآن' : 'just now';
  if (mins < 60) return isAr ? `منذ ${mins} دقيقة` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return isAr ? `منذ ${hrs} ساعة` : `${hrs}h ago`;
  return isAr ? `منذ ${Math.floor(hrs / 24)} يوم` : `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_CONFIG: Record<HVRequestStatus, { label: string; labelAr: string; color: string }> = {
  pending:        { label: 'Pending',       labelAr: 'قيد الانتظار',     color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  sent_to_doctor: { label: 'Dispatched',    labelAr: 'تم الإرسال',        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  approved:       { label: 'Approved',      labelAr: 'تم القبول',         color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  rejected:       { label: 'No Match',      labelAr: 'لم يُقبل',          color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  completed:      { label: 'Completed',     labelAr: 'مكتملة',            color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' },
};

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  req,
  doctorId,
  isAr,
  showActions,
  allUsers,
}: {
  req: HomeVisitRequest;
  doctorId?: string;
  isAr: boolean;
  showActions: boolean;
  allUsers: { id: string; name: string; nameAr?: string }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const statusCfg = STATUS_CONFIG[req.status];
  const isPending = req.status === 'sent_to_doctor' && req.currentDoctorId === doctorId;
  const isApproved = req.status === 'approved' && req.assignedDoctorId === doctorId;

  const handleApprove = () => {
    if (!doctorId) return;
    approveRequest(req.id, doctorId);
    toast.success(isAr ? 'تم قبول الزيارة المنزلية' : 'Home visit approved');
  };

  const handleReject = () => {
    if (!doctorId) return;
    rejectRequest(req.id, doctorId);
    toast.info(isAr ? 'تم رفض الطلب، سيتم إرساله للطبيب التالي' : 'Request forwarded to next doctor');
  };

  const handleComplete = () => {
    completeRequest(req.id);
    toast.success(isAr ? 'تم تحديد الزيارة كمكتملة' : 'Visit marked as completed');
  };

  return (
    <Card className={`border transition-all ${isPending ? 'border-blue-300 dark:border-blue-700 shadow-sm' : 'border-border'}`}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">{req.patientName}</p>
              {req.patientPhone && (
                <a href={`tel:${req.patientPhone}`} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary transition-colors">
                  <Phone className="h-3 w-3" />
                  {req.patientPhone}
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={`text-xs border-0 ${statusCfg.color}`}>
              {isAr ? statusCfg.labelAr : statusCfg.label}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatRelative(req.createdAt, isAr)}</span>
          </div>
        </div>

        {/* Location & time */}
        <div className="space-y-1.5 mb-3">
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">{isAr ? req.governorateAr : req.governorate}</span>
              <span className="text-muted-foreground"> — {req.address}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {req.preferredDay}
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {req.preferredTime}
            </span>
          </div>
          {req.notes && (
            <div className="flex items-start gap-2 text-sm">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <span className="text-muted-foreground italic">{req.notes}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        {showActions && isPending && (
          <div className="flex gap-2 mb-3">
            <Button
              className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm"
              onClick={handleApprove}
              data-testid={`btn-approve-${req.id}`}
            >
              <CheckCircle2 className="h-4 w-4" />
              {isAr ? 'قبول' : 'Approve'}
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 h-9 text-sm"
              onClick={handleReject}
              data-testid={`btn-reject-${req.id}`}
            >
              <XCircle className="h-4 w-4" />
              {isAr ? 'رفض' : 'Reject'}
            </Button>
          </div>
        )}

        {showActions && isApproved && (
          <Button
            className="w-full gap-2 h-9 text-sm bg-teal-600 hover:bg-teal-700 text-white mb-3"
            onClick={handleComplete}
            data-testid={`btn-complete-${req.id}`}
          >
            <CircleCheck className="h-4 w-4" />
            {isAr ? 'تحديد كمكتملة' : 'Mark as Completed'}
          </Button>
        )}

        {/* Dispatch history toggle */}
        {req.dispatchHistory.length > 0 && (
          <>
            <Separator className="mb-2" />
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              onClick={() => setExpanded(v => !v)}
            >
              <History className="h-3.5 w-3.5" />
              {isAr ? 'سجل الإرسال' : 'Dispatch History'}
              {expanded ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
            </button>
            {expanded && (
              <div className="mt-2 space-y-1.5">
                {req.dispatchHistory.map((entry, i) => {
                  const doc = allUsers.find(u => u.id === entry.doctorId);
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${
                        entry.response === 'approved' ? 'bg-emerald-500' :
                        entry.response === 'rejected' ? 'bg-red-400' :
                        'bg-blue-400 animate-pulse'
                      }`} />
                      <span className="font-medium">{isAr ? doc?.nameAr : doc?.name}</span>
                      <span className="text-muted-foreground ml-auto">
                        {entry.response
                          ? (entry.response === 'approved'
                              ? (isAr ? 'قَبِل' : 'Accepted')
                              : (isAr ? 'رَفَض' : 'Rejected'))
                          : (isAr ? 'في الانتظار' : 'Waiting...')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Home Visit Dashboard ─────────────────────────────────────────────────────

const HomeVisitDashboard = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isAr = language === 'ar';

  const { users: allUsers } = useUsers();
  const [, setTick] = useState(0);
  useEffect(() => {
    const u1 = homeVisitRequestStore.subscribe(() => setTick(t => t + 1));
    return () => { u1(); };
  }, []);

  const isDoctor = user?.role === 'doctor';
  const isAdmin = user?.role === 'admin';

  const allRequests = homeVisitRequestStore.getAll();

  // Doctor: only see their own queue requests
  // Admin: see everything
  const myRequests = isDoctor && user
    ? getRequestsForDoctor(user.id)
    : allRequests;

  const pending   = myRequests.filter(r =>
    r.status === 'sent_to_doctor' && (isAdmin || r.currentDoctorId === user?.id)
  );
  const active    = myRequests.filter(r =>
    r.status === 'approved' && (isAdmin || r.assignedDoctorId === user?.id)
  );
  const history   = myRequests.filter(r =>
    r.status === 'rejected' || r.status === 'completed' || r.status === 'pending'
  );

  // Doctor who currently has home visit enabled
  const doctorDoc = user?.role === 'doctor'
    ? allUsers.find(u => u.id === user.id)
    : null;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Home className="h-6 w-6 text-emerald-600" />
          {isAr ? 'طلبات الزيارة المنزلية' : 'Home Visit Requests'}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isAr
            ? 'إدارة ومتابعة طلبات الزيارة المنزلية'
            : 'Manage and track home visit dispatch requests'}
        </p>
      </div>

      {/* Doctor home visit disabled warning */}
      {isDoctor && doctorDoc && !doctorDoc.homeVisitEnabled && (
        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {isAr
                ? 'الزيارة المنزلية غير مفعّلة في ملفك الشخصي. لن تتلقى طلبات زيارة منزلية جديدة.'
                : 'Home visit is not enabled on your profile. You will not receive new home visit requests.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <Inbox className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{pending.length}</p>
              <p className="text-xs text-muted-foreground">{isAr ? 'معلّقة' : 'Pending'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{active.length}</p>
              <p className="text-xs text-muted-foreground">{isAr ? 'مقبولة' : 'Approved'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <History className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{history.length}</p>
              <p className="text-xs text-muted-foreground">{isAr ? 'السجل' : 'History'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending">
        <TabsList className="w-full">
          <TabsTrigger value="pending" className="flex-1 gap-1.5">
            <Inbox className="h-3.5 w-3.5" />
            {isAr ? 'معلّقة' : 'Pending'}
            {pending.length > 0 && (
              <Badge className="ml-1 h-5 min-w-5 px-1.5 text-xs bg-blue-600 text-white border-0">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="active" className="flex-1 gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {isAr ? 'مقبولة' : 'Approved'}
            {active.length > 0 && (
              <Badge className="ml-1 h-5 min-w-5 px-1.5 text-xs bg-emerald-600 text-white border-0">
                {active.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 gap-1.5">
            <History className="h-3.5 w-3.5" />
            {isAr ? 'السجل' : 'History'}
          </TabsTrigger>
        </TabsList>

        {/* Pending Tab */}
        <TabsContent value="pending" className="mt-4 space-y-3">
          {pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Inbox className="h-12 w-12 opacity-30" />
              <p className="text-sm font-medium">
                {isAr ? 'لا توجد طلبات معلّقة' : 'No pending requests'}
              </p>
            </div>
          ) : (
            pending.map(req => (
              <RequestCard
                key={req.id}
                req={req}
                doctorId={user?.id}
                isAr={isAr}
                showActions={isDoctor}
                allUsers={allUsers}
              />
            ))
          )}
        </TabsContent>

        {/* Active / Approved Tab */}
        <TabsContent value="active" className="mt-4 space-y-3">
          {active.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <CheckCircle2 className="h-12 w-12 opacity-30" />
              <p className="text-sm font-medium">
                {isAr ? 'لا توجد زيارات مقبولة حالياً' : 'No active visits'}
              </p>
            </div>
          ) : (
            active.map(req => (
              <RequestCard
                key={req.id}
                req={req}
                doctorId={user?.id}
                isAr={isAr}
                showActions={isDoctor}
                allUsers={allUsers}
              />
            ))
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4 space-y-3">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <History className="h-12 w-12 opacity-30" />
              <p className="text-sm font-medium">
                {isAr ? 'لا يوجد سجل' : 'No history yet'}
              </p>
            </div>
          ) : (
            history.map(req => (
              <RequestCard
                key={req.id}
                req={req}
                doctorId={user?.id}
                isAr={isAr}
                showActions={false}
                allUsers={allUsers}
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Admin: All requests view */}
      {isAdmin && (
        <div className="space-y-3">
          <Separator />
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" />
            {isAr ? 'جميع الطلبات (مدير)' : 'All Requests (Admin)'}
          </h2>
          {allRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {isAr ? 'لا توجد طلبات' : 'No requests yet'}
            </p>
          ) : (
            allRequests.map(req => (
              <RequestCard
                key={req.id}
                req={req}
                doctorId={undefined}
                isAr={isAr}
                showActions={false}
                allUsers={allUsers}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default HomeVisitDashboard;
