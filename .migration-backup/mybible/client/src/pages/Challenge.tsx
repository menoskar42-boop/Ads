import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Trophy, Users, BookOpen, Share2, ArrowRight, Plus, Medal, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getMinistryUser } from '@/lib/ministry-auth';

function getMedal(index: number): string {
  if (index === 0) return '🥇';
  if (index === 1) return '🥈';
  if (index === 2) return '🥉';
  return `${index + 1}`;
}

export default function Challenge() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [selectedChallenge, setSelectedChallenge] = useState<number | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinChallengeId, setJoinChallengeId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBook, setNewBook] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');

  const user = getMinistryUser();
  const isAdmin = user?.role === 'admin';

  const { data: allBooks } = useQuery({ queryKey: ['books'], queryFn: api.books.getAll });

  const { data: challengesData, refetch: refetchChallenges } = useQuery({
    queryKey: ['challenges'],
    queryFn: async () => {
      const res = await fetch('/api/challenges');
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const { data: challengeDetail, refetch: refetchDetail } = useQuery({
    queryKey: ['challenge-detail', selectedChallenge],
    queryFn: async () => {
      const res = await fetch(`/api/challenges/${selectedChallenge}`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!selectedChallenge,
  });

  const challenges = challengesData?.challenges || [];

  const createChallenge = async () => {
    if (!newTitle || !newBook || !newStart || !newEnd || !newStartDate || !newEndDate) {
      toast.error('جميع الحقول مطلوبة');
      return;
    }
    try {
      const res = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminPhone: user?.phone,
          title: newTitle,
          bookName: newBook,
          startChapter: parseInt(newStart),
          endChapter: parseInt(newEnd),
          startDate: newStartDate,
          endDate: newEndDate,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم إنشاء التحدي');
      setCreateOpen(false);
      setNewTitle('');
      setNewBook('');
      setNewStart('');
      setNewEnd('');
      setNewStartDate('');
      setNewEndDate('');
      refetchChallenges();
    } catch {
      toast.error('فشل إنشاء التحدي');
    }
  };

  const joinChallenge = async () => {
    if (!joinCode || !joinChallengeId) {
      toast.error('أدخل كود المجموعة');
      return;
    }
    try {
      const res = await fetch(`/api/challenges/${joinChallengeId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupCode: joinCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'فشل الانضمام');
        return;
      }
      toast.success(`تم اشتراك المجموعة "${data.groupName}" في التحدي`);
      setJoinOpen(false);
      setJoinCode('');
      setJoinChallengeId(null);
      refetchDetail();
      queryClient.invalidateQueries({ queryKey: ['challenges'] });
    } catch {
      toast.error('فشل الانضمام');
    }
  };

  const shareChallenge = async (challenge: any) => {
    const text = `🏆 انضم لتحدي قراءة الكتاب المقدس!\n\n${challenge.title}\n${challenge.bookName} - الإصحاح ${challenge.startChapter} إلى ${challenge.endChapter}\n\nانضم لمجموعتك وشارك في التحدي:\nhttps://mybible.oscardevs.com/challenge`;
    if (navigator.share) {
      try {
        await navigator.share({ title: challenge.title, text });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(text);
    toast.success('تم نسخ رابط التحدي');
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <SEOHead />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">تحدي القراءة بين الكنائس</h1>
              <p className="text-sm text-muted-foreground">تنافس مع المجموعات الأخرى في قراءة الكتاب المقدس</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/groups')} data-testid="button-back-groups">
            <ArrowRight className="w-4 h-4 ml-1" />
            رجوع
          </Button>
        </div>

        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)} className="w-full mb-6 gap-2" data-testid="button-create-challenge">
            <Plus className="w-4 h-4" />
            إنشاء تحدي جديد
          </Button>
        )}

        {challenges.length === 0 ? (
          <Card className="p-8 text-center">
            <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-display text-lg font-bold mb-2">لا توجد تحديات حالياً</h3>
            <p className="text-sm text-muted-foreground">ترقب التحديات القادمة!</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {challenges.map((challenge: any) => (
              <Card key={challenge.id} className="overflow-hidden" data-testid={`card-challenge-${challenge.id}`}>
                <div
                  className="p-5 cursor-pointer"
                  onClick={() => setSelectedChallenge(selectedChallenge === challenge.id ? null : challenge.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-amber-500" />
                      <h3 className="font-display text-lg font-bold text-foreground">{challenge.title}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); shareChallenge(challenge); }} data-testid={`button-share-challenge-${challenge.id}`}>
                        <Share2 className="w-4 h-4" />
                      </Button>
                      {selectedChallenge === challenge.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline" className="gap-1">
                      <BookOpen className="w-3 h-3" />
                      {challenge.bookName} ({challenge.startChapter}-{challenge.endChapter})
                    </Badge>
                    <Badge variant="outline">
                      من {challenge.startDate} إلى {challenge.endDate}
                    </Badge>
                  </div>
                </div>

                {selectedChallenge === challenge.id && challengeDetail && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="border-t px-5 py-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Medal className="w-5 h-5 text-amber-500" />
                        <h4 className="font-display font-bold">ترتيب الكنائس</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="gap-1">
                          <Users className="w-3 h-3" />
                          {challengeDetail.participantCount} مجموعة مشاركة
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setJoinChallengeId(challenge.id); setJoinOpen(true); }}
                          data-testid={`button-join-challenge-${challenge.id}`}
                        >
                          الانضمام للتحدي
                        </Button>
                      </div>
                    </div>

                    {challengeDetail.leaderboard.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">لم تنضم أي مجموعة بعد. كن أول المشاركين!</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {challengeDetail.leaderboard.map((entry: any, i: number) => (
                          <div key={entry.groupId} className={`rounded-xl p-4 ${i < 3 ? 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30' : 'bg-muted/30'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <span className="text-2xl font-bold">{getMedal(i)}</span>
                                <div>
                                  <p className="font-bold text-sm">{entry.groupName}</p>
                                  {entry.churchName && <p className="text-xs text-muted-foreground">{entry.churchName}</p>}
                                </div>
                              </div>
                              <div className="text-left">
                                <p className="font-bold text-primary text-lg">{entry.totalChaptersRead}</p>
                                <p className="text-xs text-muted-foreground">إصحاح</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Progress value={entry.progress} className="h-2.5 flex-1" />
                              <span className="text-xs font-semibold text-muted-foreground w-10 text-left">{entry.progress}%</span>
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className="text-xs text-muted-foreground">{entry.memberCount} عضو</span>
                              <span className="text-xs text-muted-foreground">{entry.totalChaptersRead} / {challengeDetail.totalChapters} إصحاح</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </Card>
            ))}
          </div>
        )}

        <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>اشتراك مجموعتك في التحدي</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>كود المجموعة</Label>
                <Input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="أدخل كود المجموعة"
                  className="text-center text-lg tracking-wider"
                  data-testid="input-join-code"
                />
              </div>
              <Button onClick={joinChallenge} className="w-full" data-testid="button-confirm-join">
                اشتراك في التحدي
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إنشاء تحدي قراءة جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>عنوان التحدي</Label>
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="مثال: تحدي قراءة إنجيل يوحنا" data-testid="input-challenge-title" />
              </div>
              <div>
                <Label>السفر</Label>
                <select value={newBook} onChange={e => setNewBook(e.target.value)} className="w-full border rounded-md p-2 bg-background text-foreground" data-testid="select-challenge-book">
                  <option value="">اختر السفر</option>
                  {allBooks?.map((b: any) => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>من إصحاح</Label>
                  <Input type="number" min="1" value={newStart} onChange={e => setNewStart(e.target.value)} data-testid="input-challenge-start" />
                </div>
                <div>
                  <Label>إلى إصحاح</Label>
                  <Input type="number" min="1" value={newEnd} onChange={e => setNewEnd(e.target.value)} data-testid="input-challenge-end" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>تاريخ البداية</Label>
                  <Input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} data-testid="input-challenge-start-date" />
                </div>
                <div>
                  <Label>تاريخ النهاية</Label>
                  <Input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} data-testid="input-challenge-end-date" />
                </div>
              </div>
              <Button onClick={createChallenge} className="w-full" data-testid="button-create-challenge-confirm">
                إنشاء التحدي
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    </div>
  );
}
