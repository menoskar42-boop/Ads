import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, LogIn, Church, Shield, ShieldCheck, ChevronLeft, Plus, LogOut, Trophy, MessageCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link, useLocation } from 'wouter';
import { SEOHead } from '@/components/SEOHead';
import { getUserGroups, migrateOldStorage, type UserGroupEntry } from '@/lib/user-groups';
import { getMinistryUser, clearMinistryUser, isAdmin } from '@/lib/ministry-auth';

interface ChatSummary {
  unreadCount: number;
  lastMessage: string | null;
  lastSenderName: string | null;
  lastTime: string | null;
  lastMessageId: number;
}

function getLastReadId(groupCode: string): number {
  try { return parseInt(localStorage.getItem(`chat_lastread_${groupCode}`) || '0') || 0; } catch { return 0; }
}

function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} س`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'أمس';
  if (days < 7) return `${days} أيام`;
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

export default function Groups() {
  const [, navigate] = useLocation();
  const [chatSummaries, setChatSummaries] = useState<Record<string, ChatSummary>>({});

  useEffect(() => {
    if (!getMinistryUser()) {
      navigate('/ministry-auth');
      return;
    }
    migrateOldStorage();
  }, [navigate]);

  const user = getMinistryUser();
  const groups = getUserGroups();

  // Fetch chat summaries for all groups
  useEffect(() => {
    if (groups.length === 0) return;
    groups.forEach((g: UserGroupEntry) => {
      const afterId = getLastReadId(g.groupId);
      fetch(`/api/groups/${g.groupId}/messages/summary?afterId=${afterId}`)
        .then(r => r.json())
        .then(data => setChatSummaries(prev => ({ ...prev, [g.groupId]: data })))
        .catch(() => {});
    });
  }, [groups.length]);

  const handleLogout = () => {
    clearMinistryUser();
    navigate('/ministry-auth');
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <SEOHead />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-md">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">متابعة القراءة الروحية</h1>
              {user && <p className="text-sm text-muted-foreground">مرحباً، {user.name}</p>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground" data-testid="button-ministry-logout">
            <LogOut className="w-4 h-4 ml-1" />
            خروج
          </Button>
        </div>

        {groups.length > 0 && (
          <div className="mb-6">
            <h2 className="font-display text-lg font-bold text-foreground mb-3">مجموعاتي</h2>
            <div className="space-y-3">
              {groups.map((g: UserGroupEntry) => {
                const summary = chatSummaries[g.groupId];
                const hasUnread = (summary?.unreadCount || 0) > 0;
                return (
                  <Card
                    key={g.groupId}
                    className={`p-4 hover:shadow-lg transition-shadow cursor-pointer ${hasUnread ? 'border-green-300 dark:border-green-700' : 'border-primary/10'}`}
                    onClick={() => navigate(`/group/${g.groupId}`)}
                    data-testid={`card-my-group-${g.groupId}`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow">
                          <Users className="w-6 h-6 text-white" />
                        </div>
                        {hasUnread && (
                          <div className="absolute -top-1 -left-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                            <span className="text-[10px] text-white font-bold">{summary.unreadCount > 9 ? '9+' : summary.unreadCount}</span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h3 className={`font-display font-bold truncate ${hasUnread ? 'text-foreground' : 'text-foreground'}`}>
                            {g.groupName || g.groupId}
                          </h3>
                          {summary?.lastTime && (
                            <span className={`text-[11px] shrink-0 ${hasUnread ? 'text-green-600 font-semibold' : 'text-muted-foreground'}`}>
                              {formatRelativeTime(summary.lastTime)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          {summary?.lastMessage ? (
                            <p className={`text-xs truncate flex items-center gap-1 ${hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                              {summary.lastSenderName && <span className="text-primary font-semibold shrink-0">{summary.lastSenderName}:</span>}
                              {summary.lastMessage}
                            </p>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {g.role === 'admin' ? (
                                <Badge variant="secondary" className="text-xs gap-1 py-0">
                                  <Shield className="w-3 h-3" />أدمن
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs py-0">عضو</Badge>
                              )}
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <MessageCircle className="w-3 h-3" />شات
                              </span>
                            </div>
                          )}
                          {hasUnread && (
                            <div className="w-2.5 h-2.5 bg-green-500 rounded-full shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {isAdmin() && (
          <div className="mb-6">
            <Link href="/admin">
              <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer border-red-200 dark:border-red-800/30 bg-gradient-to-l from-red-50 to-white dark:from-red-950/20 dark:to-background" data-testid="card-admin-dashboard">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-foreground">لوحة تحكم الأدمن</h3>
                      <p className="text-xs text-muted-foreground">إدارة طلبات الكنائس</p>
                    </div>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-muted-foreground" />
                </div>
              </Card>
            </Link>
          </div>
        )}

        <Link href="/challenge">
          <Card className="p-5 mb-6 hover:shadow-lg transition-shadow cursor-pointer border-amber-200 dark:border-amber-800/30 bg-gradient-to-l from-amber-50 to-white dark:from-amber-950/20 dark:to-background" data-testid="card-church-challenge">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-foreground text-lg">تحدي القراءة بين الكنائس</h3>
                  <p className="text-xs text-muted-foreground">تنافس مع المجموعات الأخرى</p>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </div>
          </Card>
        </Link>

        <div className="grid grid-cols-1 gap-4">
          {/* الانضمام لمجموعة موجودة */}
          <Link href="/groups/join">
            <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer border-green-200 dark:border-green-800/30 bg-gradient-to-l from-green-50 to-white dark:from-green-950/20 dark:to-background" data-testid="card-join-group">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center flex-shrink-0 shadow-md">
                  <LogIn className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-foreground">الانضمام لمجموعة</h2>
                  <p className="text-sm text-muted-foreground">انضم لمجموعتك بكود المجموعة</p>
                </div>
                <ChevronLeft className="w-5 h-5 text-muted-foreground mr-auto" />
              </div>
            </Card>
          </Link>

          {/* تسجيل كنيسة جديدة */}
          <Link href="/church-request">
            <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer border-amber-200 dark:border-amber-800/30 bg-gradient-to-l from-amber-50 to-white dark:from-amber-950/20 dark:to-background" data-testid="card-request-church">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center flex-shrink-0 shadow-md">
                  <Plus className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-foreground">تسجيل صفحة كنيسة</h2>
                  <p className="text-sm text-muted-foreground">سجّل كنيستك وأنشئ مجموعاتها من صفحتها</p>
                </div>
                <ChevronLeft className="w-5 h-5 text-muted-foreground mr-auto" />
              </div>
            </Card>
          </Link>

          {/* تصفح الكنائس الموجودة */}
          <Link href="/church">
            <Card className="p-5 hover:shadow-lg transition-shadow cursor-pointer border-primary/20" data-testid="card-browse-churches">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                  <Church className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-foreground">تصفح الكنائس</h2>
                  <p className="text-xs text-muted-foreground">ابحث عن كنيستك وانضم لمجموعاتها</p>
                </div>
                <ChevronLeft className="w-5 h-5 text-muted-foreground mr-auto" />
              </div>
            </Card>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
