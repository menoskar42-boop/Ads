import { useState, useMemo } from 'react';
import { useParams, useLocation, Link } from 'wouter';
import { Users, Search, Shield, ShieldOff, X, ArrowRight, UserPlus, Loader2, Check, BookOpen, ChevronRight } from 'lucide-react';
import { InlineChapterReader } from '@/components/InlineChapterReader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getUserGroupEntry } from '@/lib/user-groups';

function RankStars({ count }: { count: number }) {
  const levels = [
    { min: 200, stars: 5, color: 'text-amber-500', label: 'قارئ متميّز' },
    { min: 100, stars: 4, color: 'text-amber-400', label: 'قارئ أمين' },
    { min: 50,  stars: 3, color: 'text-yellow-400', label: 'قارئ نشيط' },
    { min: 15,  stars: 2, color: 'text-sky-400',    label: 'قارئ منتظم' },
    { min: 4,   stars: 1, color: 'text-blue-400',   label: 'قارئ مبتدئ' },
  ];
  const level = levels.find(l => count >= l.min);
  if (!level) return null;
  return (
    <span className="inline-flex gap-px" title={level.label}>
      {Array.from({ length: level.stars }).map((_, i) => (
        <span key={i} className={`${level.color} text-base leading-none`}>★</span>
      ))}
    </span>
  );
}

export default function GroupMembers() {
  const params = useParams<{ groupId: string }>();
  const groupCode = (params.groupId || '').toUpperCase();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const stored = JSON.parse(localStorage.getItem(`group_${groupCode}`) || '{}');
  const userEntry = getUserGroupEntry(groupCode);
  const isAdmin = userEntry?.role === 'admin' || stored.isLeader || false;
  const memberKey = userEntry?.memberKey || stored.memberKey || '';
  const userName = userEntry?.userName || stored.userName || '';

  const [search, setSearch] = useState('');
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [addAdminName, setAddAdminName] = useState('');
  const [addAdminPhone, setAddAdminPhone] = useState('');
  const [addAdminLoading, setAddAdminLoading] = useState(false);
  const [addAdminResult, setAddAdminResult] = useState<string | null>(null);

  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);

  const [readingsTarget, setReadingsTarget] = useState<string | null>(null);
  const [readingsData, setReadingsData] = useState<{ book: string; chapter: number; assignmentId: number }[] | null>(null);
  const [readingsAssignmentId, setReadingsAssignmentId] = useState<number | null>(null);
  const [readingsLoading, setReadingsLoading] = useState(false);
  const [activeReading, setActiveReading] = useState<{ book: string; chapter: number } | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['group', groupCode],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupCode}`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!groupCode,
  });

  const { data: memberStatsData } = useQuery({
    queryKey: ['member-stats', groupCode],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupCode}/member-stats`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!groupCode,
  });

  const members: any[] = data?.members || [];
  const memberStats: Record<string, number> = memberStatsData?.stats || {};

  const filtered = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.trim().toLowerCase();
    return members.filter((m: any) => m.userName?.toLowerCase().includes(q));
  }, [members, search]);

  const removeMember = async (memberName: string) => {
    try {
      const res = await fetch(`/api/groups/${groupCode}/members/${encodeURIComponent(memberName)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم حذف العضو');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['group', groupCode] });
    } catch {
      toast.error('فشل الحذف');
    }
  };

  const toggleMute = async (memberName: string, muted: boolean) => {
    try {
      await fetch(`/api/groups/${groupCode}/members/${encodeURIComponent(memberName)}/mute`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey, muted }),
      });
      toast.success(muted ? 'تم كتم العضو' : 'تم إلغاء الكتم');
      refetch();
    } catch {
      toast.error('فشل');
    }
  };

  const toggleAdmin = async (memberName: string, setAsAdmin: boolean) => {
    try {
      const res = await fetch(`/api/groups/${groupCode}/members/${encodeURIComponent(memberName)}/admin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey, isAdmin: setAsAdmin }),
      });
      if (!res.ok) throw new Error();
      toast.success(setAsAdmin ? 'تم تعيينه كأدمن' : 'تم إزالة صلاحية الأدمن');
      refetch();
    } catch {
      toast.error('فشل تغيير الدور');
    }
  };

  const handleAddAdmin = async () => {
    if (!addAdminName.trim() || !addAdminPhone.trim()) {
      toast.error('اكتب الاسم ورقم الموبايل');
      return;
    }
    if (addAdminPhone.trim().length < 10) {
      toast.error('رقم الموبايل غير صحيح');
      return;
    }
    setAddAdminLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupCode}/add-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey, name: addAdminName.trim(), phone: addAdminPhone.trim() }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setAddAdminResult(result.memberKey);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'فشل إضافة الأدمن');
    } finally {
      setAddAdminLoading(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setRenameLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupCode}/members/${encodeURIComponent(renameTarget)}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey, newName: renameValue.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success(d.merged ? 'تم دمج العضو ونقل قراءاته' : 'تم تعديل الاسم');
      setRenameTarget(null);
      setRenameValue('');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['member-stats', groupCode] });
    } catch (err: any) {
      toast.error(err.message || 'فشل تعديل الاسم');
    } finally {
      setRenameLoading(false);
    }
  };

  const openReadings = async (targetUserName: string) => {
    setReadingsTarget(targetUserName);
    setReadingsData(null);
    setActiveReading(null);
    setReadingsLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupCode}/members/${encodeURIComponent(targetUserName)}/readings?memberKey=${encodeURIComponent(memberKey)}`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      setReadingsData(d.chapters || []);
      setReadingsAssignmentId(d.assignmentId ?? null);
    } catch {
      setReadingsData([]);
    } finally {
      setReadingsLoading(false);
    }
  };

  const creditReadings = async (chapters: { book: string; chapter: number; assignmentId?: number | null }[]) => {
    if (!readingsTarget || chapters.length === 0) return;
    setCreditLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupCode}/members/${encodeURIComponent(readingsTarget)}/credit-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey, chapters }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success(`تم احتساب ${d.credited} إصحاح كمقروء`);
      // أزل المُحتسَبة من قائمة المتبقي
      const done = new Set(chapters.map(c => `${c.book}|${c.chapter}`));
      setReadingsData(prev => prev ? prev.filter(r => !done.has(`${r.book}|${r.chapter}`)) : prev);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['member-stats', groupCode] });
    } catch (err: any) {
      toast.error(err.message || 'فشل الاحتساب');
    } finally {
      setCreditLoading(false);
    }
  };

  const activeToday = members.filter((m: any) => m.readToday).length;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data?.group) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <Card className="p-8 text-center">
          <p className="text-destructive font-bold mb-4">المجموعة غير موجودة</p>
          <Button variant="outline" onClick={() => navigate('/groups')}>العودة</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link href={`/group/${groupCode}`}>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowRight className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-xl font-bold text-foreground">أعضاء المجموعة</h1>
          <p className="text-xs text-muted-foreground">{data.group.name}</p>
        </div>
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={() => { setAddAdminResult(null); setAddAdminName(''); setAddAdminPhone(''); setAddAdminOpen(true); }} data-testid="button-add-admin">
            <UserPlus className="w-4 h-4 ml-1" />
            إضافة أدمن
          </Button>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex gap-3 mb-4">
        <Card className="flex-1 p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{members.length}</p>
          <p className="text-xs text-muted-foreground">إجمالي الأعضاء</p>
        </Card>
        <Card className="flex-1 p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{activeToday}</p>
          <p className="text-xs text-muted-foreground">قرأوا اليوم</p>
        </Card>
        <Card className="flex-1 p-3 text-center">
          <p className="text-2xl font-bold text-red-400">{members.length - activeToday}</p>
          <p className="text-xs text-muted-foreground">لم يقرأوا</p>
        </Card>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث باسم العضو..."
          className="pr-9"
          data-testid="input-search-members"
        />
      </div>

      {/* Members list */}
      <Card className="divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {search ? 'لا يوجد عضو بهذا الاسم' : 'لا يوجد أعضاء بعد'}
          </div>
        ) : (
          filtered.map((m: any) => {
            const memberChapters = memberStats[m.userName] || 0;
            return (
              <div key={m.id || m.userName} className="flex items-center justify-between px-4 py-3" data-testid={`member-row-${m.userName}`}>
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className={`text-base flex-shrink-0 ${m.readToday ? 'text-green-500' : 'text-red-400'}`}>
                    {m.readToday ? '✔' : '❌'}
                  </span>
                  <span className="text-sm font-medium truncate">{m.userName}</span>
                  {m.isAdmin && (
                    <Badge variant="secondary" className="text-xs gap-0.5 flex-shrink-0">
                      <Shield className="w-2.5 h-2.5" /> أدمن
                    </Badge>
                  )}
                  {m.isMuted && <Badge variant="destructive" className="text-xs flex-shrink-0">مكتوم</Badge>}
                  <RankStars count={memberChapters} />
                  <span className={`text-xs flex-shrink-0 ${memberChapters > 0 ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
                    {memberChapters} إصحاح
                  </span>
                </div>
                <div className="flex gap-1 flex-shrink-0 mr-1">
                  {(isAdmin || m.userName === userName) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="الإصحاحات المقروءة"
                      onClick={() => openReadings(m.userName)}
                      data-testid={`button-readings-${m.userName}`}
                    >
                      <BookOpen className="w-3.5 h-3.5 text-primary" />
                    </Button>
                  )}
                </div>
                {isAdmin && m.userName !== userName && (
                  <div className="flex gap-1 flex-shrink-0 mr-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="تعديل / تصحيح الاسم"
                      onClick={() => { setRenameTarget(m.userName); setRenameValue(m.userName); }}
                      data-testid={`button-rename-${m.userName}`}
                    >
                      <span className="text-sm">✏️</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={m.isAdmin ? 'إزالة أدمن' : 'تعيين كأدمن'}
                      onClick={() => toggleAdmin(m.userName, !m.isAdmin)}
                      data-testid={`button-toggle-admin-${m.userName}`}
                    >
                      {m.isAdmin
                        ? <ShieldOff className="w-3.5 h-3.5 text-amber-500" />
                        : <Shield className="w-3.5 h-3.5 text-indigo-500" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={m.isMuted ? 'إلغاء الكتم' : 'كتم'}
                      onClick={() => toggleMute(m.userName, !m.isMuted)}
                      data-testid={`button-mute-${m.userName}`}
                    >
                      <span className="text-sm">{m.isMuted ? '🔊' : '🔇'}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      title="إزالة العضو"
                      onClick={() => removeMember(m.userName)}
                      data-testid={`button-remove-${m.userName}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </Card>

      {search && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center mt-3">
          {filtered.length} من {members.length} عضو
        </p>
      )}

      {/* Readings Dialog */}
      <Dialog open={!!readingsTarget} onOpenChange={(o) => { if (!o) { setReadingsTarget(null); setReadingsData(null); setActiveReading(null); } }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto w-full max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activeReading ? (
                <>
                  <button onClick={() => setActiveReading(null)} className="text-muted-foreground hover:text-foreground">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {activeReading.book} — إصحاح {activeReading.chapter}
                </>
              ) : (
                <>
                  <BookOpen className="w-4 h-4 text-primary" />
                  الإصحاحات غير المقروءة — {readingsTarget}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {activeReading && readingsData ? (
            <InlineChapterReader
              bookName={activeReading.book}
              chapter={activeReading.chapter}
              groupCode={groupCode}
              assignmentId={readingsAssignmentId}
              userName={readingsTarget!}
              schedule={readingsData.map(r => ({ book: r.book, chapter: r.chapter }))}
              onComplete={() => { setActiveReading(null); openReadings(readingsTarget!); }}
              onChapterDone={(book, ch) => {
                setReadingsData(prev => prev ? prev.filter(r => !(r.book === book && r.chapter === ch)) : prev);
              }}
            />
          ) : readingsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : readingsData && readingsData.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-2xl mb-2">🎉</p>
              <p className="font-semibold text-foreground">أنهى كل الإصحاحات المطلوبة</p>
              <p className="text-xs text-muted-foreground mt-1">لا توجد إصحاحات متبقية في الخطة</p>
            </div>
          ) : readingsData ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-3 gap-2">
                <p className="text-xs text-muted-foreground">{readingsData.length} إصحاح متبقٍ</p>
                {isAdmin && readingsTarget !== userName && readingsData.length > 0 && (
                  <Button
                    size="sm" variant="outline"
                    className="h-7 text-xs gap-1 border-green-300 text-green-700"
                    disabled={creditLoading}
                    onClick={() => creditReadings(readingsData.map(r => ({ book: r.book, chapter: r.chapter, assignmentId: r.assignmentId })))}
                    title="احتساب كل المتبقي كمقروء (لحالات العذر مثل تعطل الجهاز)"
                  >
                    {creditLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    احتسِب الكل كمقروء
                  </Button>
                )}
              </div>
              {readingsData.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground/40 text-sm">○</span>
                    <span className="text-sm font-medium">{r.book} — إصحاح {r.chapter}</span>
                  </div>
                  {readingsTarget === userName ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setActiveReading({ book: r.book, chapter: r.chapter })}>
                      <BookOpen className="w-3 h-3" />
                      اقرأ
                    </Button>
                  ) : isAdmin && (
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 text-xs gap-1 text-green-700"
                      disabled={creditLoading}
                      onClick={() => creditReadings([{ book: r.book, chapter: r.chapter, assignmentId: r.assignmentId }])}
                      title="احتساب كمقروء"
                    >
                      <Check className="w-3 h-3" />
                      احتسِب
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Rename / Merge Member Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => { if (!o) { setRenameTarget(null); setRenameValue(''); } }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل اسم العضو</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rename-input">الاسم الصحيح</Label>
              <Input id="rename-input" value={renameValue} onChange={e => setRenameValue(e.target.value)} placeholder="اكتب الاسم الصحيح" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              لو الاسم الجديد موجود بالفعل لعضو آخر، سيتم <span className="font-semibold text-foreground">دمج الحسابين</span> ونقل كل القراءات للاسم الصحيح بدون تكرار.
            </p>
            <Button onClick={handleRename} disabled={renameLoading || !renameValue.trim()} className="w-full">
              {renameLoading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Check className="w-4 h-4 ml-2" />}
              حفظ
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Admin Dialog */}
      <Dialog open={addAdminOpen} onOpenChange={(o) => { setAddAdminOpen(o); if (!o) setAddAdminResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة أدمن للمجموعة</DialogTitle>
          </DialogHeader>
          {addAdminResult ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <p className="font-bold text-foreground">تم إضافة {addAdminName} كأدمن</p>
              <p className="text-sm text-muted-foreground">مفتاح الدخول:</p>
              <code className="font-mono text-sm font-bold text-primary bg-muted px-3 py-1.5 rounded-lg border block">{addAdminResult}</code>
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(addAdminResult); toast.success('تم النسخ'); }}>
                نسخ المفتاح
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="admin-name">الاسم</Label>
                <Input id="admin-name" value={addAdminName} onChange={e => setAddAdminName(e.target.value)} placeholder="اكتب اسم الأدمن الجديد" />
              </div>
              <div>
                <Label htmlFor="admin-phone">رقم الموبايل</Label>
                <Input id="admin-phone" value={addAdminPhone} onChange={e => setAddAdminPhone(e.target.value)} placeholder="01000000000" type="tel" dir="ltr" className="text-left" />
              </div>
              <Button onClick={handleAddAdmin} disabled={addAdminLoading} className="w-full">
                {addAdminLoading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <UserPlus className="w-4 h-4 ml-2" />}
                إضافة كأدمن
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
