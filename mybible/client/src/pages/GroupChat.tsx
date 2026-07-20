import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Send, Pin, Trash2, BookOpen, Loader2, ArrowRight, Image, Smile, Reply, X, Users, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface MessageReaction { emoji: string; users: string[]; }

interface Message {
  id: number;
  userName: string;
  message: string;
  imageUrl?: string | null;
  replyToId?: number | null;
  replyToText?: string | null;
  replyToUserName?: string | null;
  reactions?: MessageReaction[];
  isPinned: boolean;
  createdAt: string;
}

const EMOJIS = [
  '😀','😂','😍','🥰','😊','🙏','❤️','💙','💚','💛','🤍','✝️',
  '📖','⛪','🕊️','🌟','✨','🎉','🎊','👏','💪','🙌','👍','🫶',
  '😢','😭','🥺','😔','🤔','😮','😲','🤩','😇','🫂','🤗','😌',
  '🌹','🌸','🌺','🌻','🍀','🌿','🌱','🌳','🌊','⛅','🌙','⭐',
  '🏠','🏛️','🔔','📢','📣','💬','📝','✏️','🗓️','⏰','🔑','💡',
];

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new window.Image();
      img.onload = () => {
        const MAX = 600;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.5));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'اليوم';
  if (d.toDateString() === yesterday.toDateString()) return 'أمس';
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
}

function getLastReadId(groupCode: string): number {
  try { return parseInt(localStorage.getItem(`chat_lastread_${groupCode}`) || '0') || 0; } catch { return 0; }
}
function setLastReadId(groupCode: string, id: number) {
  try { localStorage.setItem(`chat_lastread_${groupCode}`, String(id)); } catch {}
}

export default function GroupChat() {
  const params = useParams<{ groupId: string }>();
  const groupCode = params.groupId || '';
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [versePickerOpen, setVersePickerOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState('');
  const [selectedChapter, setSelectedChapter] = useState('');
  const [selectedVerse, setSelectedVerse] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMention, setShowMention] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [lastReadId, setLastReadIdState] = useState(() => getLastReadId(groupCode));
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const [swipedId, setSwipedId] = useState<number | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [messagingMode, setMessagingMode] = useState<'all' | 'admin_only'>('all');
  const [swipeOffsets, setSwipeOffsets] = useState<Record<number, number>>({});
  const swipeStartX = useRef<Record<number, number>>({});
  const swipeTriggered = useRef<Record<number, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const firstUnreadRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 128) + 'px';
  };
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stored = JSON.parse(localStorage.getItem(`group_${groupCode}`) || '{}');
  const userEntry = (() => {
    try { const g = JSON.parse(localStorage.getItem('userGroups') || '[]'); return g.find((x: any) => x.groupId === groupCode) || null; }
    catch { return null; }
  })();
  const userName = userEntry?.userName || stored.userName || '';
  const isLeader = userEntry?.role === 'admin' || stored.isLeader || false;
  const leaderKey = userEntry?.memberKey || stored.memberKey || '';

  const { data: allBooks } = useQuery({ queryKey: ['books'], queryFn: api.books.getAll });
  const selectedBookData = allBooks?.find((b: any) => b.name === selectedBook);
  const { data: verses } = useQuery({
    queryKey: ['verses', selectedBookData?.id, parseInt(selectedChapter)],
    queryFn: () => api.verses.getByBook(selectedBookData!.id, parseInt(selectedChapter)),
    enabled: !!selectedBookData && !!selectedChapter,
  });

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupCode}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages);
    } catch {} finally {
      setLoading(false);
    }
  }, [groupCode]);

  // Fetch group info (members for @mention + messaging mode)
  useEffect(() => {
    fetch(`/api/groups/${groupCode}`)
      .then(r => r.json())
      .then(d => {
        setMembers((d.members || []).map((m: any) => m.userName).filter((n: string) => n !== userName));
        setMessagingMode((d.group?.messagingMode as 'all' | 'admin_only') || 'all');
      })
      .catch(() => {});
  }, [groupCode, userName]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 8000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Initial scroll: go to first unread message, otherwise to the very bottom
  useEffect(() => {
    if (loading || initialScrollDone || messages.length === 0) return;
    const unreadIdx = messages.findIndex(m => m.id > lastReadId);
    const jumpToBottom = () => {
      const el = scrollAreaRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    if (unreadIdx > 0 && firstUnreadRef.current) {
      // العنصر مُركَّب الآن (initialScrollDone لسه false) — مرّر إليه متزامناً
      // قبل أن تُزيل إعادة الرسم فاصل "الرسائل الجديدة"
      firstUnreadRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
      setInitialScrollDone(true);
    } else {
      // حالة الأسفل: أجّل حتى يكتمل رسم الرسائل/الصور ثم كرّر للأمان
      setInitialScrollDone(true);
      requestAnimationFrame(() => {
        jumpToBottom();
        setTimeout(jumpToBottom, 150);
        setTimeout(jumpToBottom, 400);
      });
    }
    // Mark all as read
    const maxId = Math.max(...messages.map(m => m.id));
    if (maxId > lastReadId) { setLastReadId(groupCode, maxId); setLastReadIdState(maxId); }
  }, [loading, messages, initialScrollDone]);

  // Auto-scroll to bottom on new messages only (not initial load)
  useEffect(() => {
    if (!initialScrollDone) return;
    const maxId = messages.length > 0 ? Math.max(...messages.map(m => m.id)) : 0;
    if (maxId > lastReadId) {
      if (isAtBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        setLastReadId(groupCode, maxId);
        setLastReadIdState(maxId);
        setNewMsgCount(0);
      } else {
        setNewMsgCount(prev => prev + 1);
      }
    }
  }, [messages.length, initialScrollDone]);

  // Track scroll position to show/hide scroll-to-bottom button
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setIsAtBottom(distFromBottom < 80);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    const maxId = messages.length > 0 ? Math.max(...messages.map(m => m.id)) : 0;
    if (maxId > lastReadId) { setLastReadId(groupCode, maxId); setLastReadIdState(maxId); }
    setNewMsgCount(0);
  };

  const insertEmoji = (emoji: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? newMessage.length;
    const end = input?.selectionEnd ?? newMessage.length;
    const next = newMessage.slice(0, start) + emoji + newMessage.slice(end);
    setNewMessage(next);
    // أعد المؤشر بعد الإيموجي المُدرج
    requestAnimationFrame(() => {
      if (input) {
        const pos = start + emoji.length;
        input.focus();
        input.setSelectionRange(pos, pos);
      }
    });
  };

  const unreadCount = messages.filter(m => m.id > lastReadId).length;
  const firstUnreadId = messages.find(m => m.id > lastReadId)?.id;

  const handleInput = (val: string) => {
    setNewMessage(val);
    const atIdx = val.lastIndexOf('@');
    if (atIdx >= 0 && atIdx === val.length - 1) { setShowMention(true); setMentionQuery(''); }
    else if (atIdx >= 0 && !val.slice(atIdx + 1).includes(' ')) {
      setMentionQuery(val.slice(atIdx + 1));
      setShowMention(true);
    } else { setShowMention(false); }
  };

  const insertMention = (name: string) => {
    const atIdx = newMessage.lastIndexOf('@');
    setNewMessage(newMessage.slice(0, atIdx) + '@' + name + ' ');
    setShowMention(false);
    inputRef.current?.focus();
  };

  const filteredMembers = members.filter(m => m.toLowerCase().includes(mentionQuery.toLowerCase()));

  const sendMessage = async (text?: string) => {
    const msg = text || newMessage.trim();
    if (!msg && !imagePreview) return;
    setSending(true);
    try {
      const body: any = { userName, message: msg || '' };
      if (leaderKey) body.memberKey = leaderKey;
      if (imagePreview) body.imageUrl = imagePreview;
      if (replyTo) { body.replyToId = replyTo.id; body.replyToText = replyTo.message || '📷 صورة'; body.replyToUserName = replyTo.userName; }
      const res = await fetch(`/api/groups/${groupCode}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setNewMessage('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
      setImagePreview(null);
      setReplyTo(null);
      setShowEmoji(false);
      fetchMessages();
    } catch (err: any) {
      toast.error(err.message || 'فشل الإرسال');
    } finally { setSending(false); }
  };

  const sendReaction = async (messageId: number, emoji: string) => {
    setReactionPickerMsgId(null);
    try {
      const res = await fetch(`/api/groups/${groupCode}/messages/${messageId}/react`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji, userName }),
      });
      if (res.ok) fetchMessages();
    } catch {}
  };

  const pinMessage = async (messageId: number) => {
    try {
      await fetch(`/api/groups/${groupCode}/messages/${messageId}/pin`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leaderKey }),
      });
      fetchMessages();
    } catch { toast.error('فشل التثبيت'); }
  };

  const deleteMessage = async (messageId: number) => {
    try {
      await fetch(`/api/groups/${groupCode}/messages/${messageId}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leaderKey }),
      });
      fetchMessages();
    } catch { toast.error('فشل الحذف'); }
  };

  const sendVerse = () => {
    const verse = verses?.find((v: any) => v.verse === parseInt(selectedVerse));
    if (verse) {
      const text = `📖 ${selectedBook} ${selectedChapter}:${selectedVerse}\n${verse.text}`;
      sendMessage(text);
      setVersePickerOpen(false);
      setSelectedBook(''); setSelectedChapter(''); setSelectedVerse('');
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageLoading(true);
    try { const compressed = await compressImage(file); setImagePreview(compressed); }
    catch { toast.error('فشل تحميل الصورة'); }
    finally { setImageLoading(false); e.target.value = ''; }
  };

  const pinnedMessages = messages.filter(m => m.isPinned);

  // Group messages by date
  const grouped: { date: string; messages: Message[] }[] = [];
  let lastDate = '';
  for (const m of messages) {
    const d = formatDate(m.createdAt);
    if (d !== lastDate) { grouped.push({ date: d, messages: [] }); lastDate = d; }
    grouped[grouped.length - 1].messages.push(m);
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-2xl flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col text-[17px] bg-background" style={{ height: '100dvh' }}>
      <SEOHead />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background z-10 shrink-0" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-md">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-display font-bold text-foreground">شات المجموعة</h1>
            <Badge variant="secondary" className="text-xs">{groupCode}</Badge>
          </div>
          {members.length > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" />{members.length + 1} عضو
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <Badge className="bg-green-500 text-white text-xs min-w-[20px] text-center">
            {unreadCount}
          </Badge>
        )}
        <Button variant="ghost" size="sm" onClick={() => navigate(`/group/${groupCode}`)} data-testid="button-back-group">
          <ArrowRight className="w-4 h-4 ml-1" />
          رجوع
        </Button>
      </div>

      {/* Pinned messages */}
      {pinnedMessages.length > 0 && (
        <div className="px-4 py-1 border-b bg-amber-50 dark:bg-amber-900/10 shrink-0 space-y-1">
          {pinnedMessages.map(m => (
            <div key={m.id} className="flex items-center gap-2 text-xs">
              <Pin className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="font-semibold text-amber-700 dark:text-amber-400">{m.userName}:</span>
              <span className="truncate text-foreground">{m.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Messages area */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
      {/* Scroll-to-bottom floating button */}
      <AnimatePresence>
        {!isAtBottom && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-primary text-primary-foreground rounded-full px-3 py-1.5 shadow-lg text-xs font-semibold"
          >
            {newMsgCount > 0 && (
              <span className="bg-green-400 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                {newMsgCount > 9 ? '9+' : newMsgCount}
              </span>
            )}
            <ChevronDown className="w-4 h-4" />
            {newMsgCount > 0 ? `${newMsgCount} رسالة جديدة` : 'أسفل'}
          </motion.button>
        )}
      </AnimatePresence>
      <div ref={scrollAreaRef} className="absolute inset-0 overflow-y-auto px-3 py-2 space-y-1" style={{ overscrollBehavior: 'contain' }} onClick={() => setReactionPickerMsgId(null)}>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">لا توجد رسائل. ابدأ المحادثة!</p>
          </div>
        ) : (
          <>
            {grouped.map(group => (
              <div key={group.date}>
                {/* Date divider */}
                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">{group.date}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {group.messages.map((m, idx) => {
                  const isMe = m.userName === userName;
                  const isFirstUnread = m.id === firstUnreadId && m.id > lastReadId && !initialScrollDone;
                  const showUnreadDivider = !initialScrollDone && isFirstUnread;
                  return (
                    <div key={m.id}>
                      {showUnreadDivider && (
                        <div ref={firstUnreadRef} className="flex items-center gap-2 my-3">
                          <div className="flex-1 h-px bg-green-300" />
                          <span className="text-xs text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                            {unreadCount} رسائل جديدة
                          </span>
                          <div className="flex-1 h-px bg-green-300" />
                        </div>
                      )}
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0, x: swipeOffsets[m.id] || 0 }}
                        transition={{ duration: swipeOffsets[m.id] ? 0 : 0.15 }}
                        className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1 group`}
                        onTouchStart={e => {
                          swipeStartX.current[m.id] = e.touches[0].clientX;
                          swipeTriggered.current[m.id] = false;
                        }}
                        onTouchMove={e => {
                          const dx = e.touches[0].clientX - (swipeStartX.current[m.id] || 0);
                          if (Math.abs(dx) > 5 && longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                          if (dx > 0 && dx < 80) {
                            setSwipeOffsets(prev => ({ ...prev, [m.id]: dx }));
                          }
                          if (dx > 60 && !swipeTriggered.current[m.id]) {
                            swipeTriggered.current[m.id] = true;
                            setReplyTo(m);
                            inputRef.current?.focus();
                          }
                        }}
                        onTouchEnd={() => {
                          setSwipeOffsets(prev => ({ ...prev, [m.id]: 0 }));
                        }}
                      >
                        {/* Reply button */}
                        {!isMe && (
                          <button
                            className="opacity-60 group-hover:opacity-100 active:opacity-100 transition-opacity self-end mb-1 mr-1 p-1.5 rounded-full hover:bg-muted active:bg-muted text-primary"
                            onClick={() => { setReplyTo(m); inputRef.current?.focus(); }}
                            title="رد"
                          >
                            <Reply className="w-4 h-4" />
                          </button>
                        )}

                        <div className={`max-w-[78%] min-w-0 flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          {/* Sender name (for others) */}
                          {!isMe && (
                            <span className="text-xs font-semibold text-primary px-1 mb-0.5">{m.userName}</span>
                          )}

                          <div
                            className={`rounded-2xl px-3 py-2 shadow-sm max-w-full min-w-0 ${
                              isMe
                                ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                : 'bg-muted dark:bg-muted/80 text-foreground rounded-tl-sm'
                            } ${m.isPinned ? 'ring-2 ring-amber-400' : ''}`}
                            onContextMenu={e => { e.preventDefault(); setReactionPickerMsgId(m.id); }}
                            onTouchStart={() => { longPressTimerRef.current = setTimeout(() => setReactionPickerMsgId(m.id), 600); }}
                            onTouchEnd={() => { if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current); }}
                            onTouchMove={() => { if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current); }}
                          >

                            {/* Reply quote */}
                            {m.replyToId && (
                              <div className={`mb-2 px-2 py-1 rounded-lg text-xs border-r-2 ${
                                isMe ? 'bg-primary-foreground/10 border-primary-foreground/50 text-primary-foreground/80' : 'bg-background/60 border-primary text-muted-foreground'
                              }`}>
                                <p className="font-semibold">{m.replyToUserName}</p>
                                <p className="truncate">{m.replyToText}</p>
                              </div>
                            )}

                            {/* Image */}
                            {m.imageUrl && (
                              <img
                                src={m.imageUrl}
                                alt="صورة"
                                className="rounded-lg max-w-full w-auto h-auto mb-1 cursor-pointer"
                                style={{ maxHeight: 280, maxWidth: 260 }}
                                onClick={() => window.open(m.imageUrl!, '_blank')}
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            )}

                            {/* Message text */}
                            {m.message && (
                              <p className="text-base whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">{m.message.replace(/\n{3,}/g, '\n\n')}</p>
                            )}

                            {/* Footer: time + admin actions */}
                            <div className={`flex items-center gap-2 mt-0.5 ${isMe ? 'justify-end' : 'justify-between'}`}>
                              <span className={`text-[10px] ${isMe ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                                {new Date(m.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {isLeader && (
                                <div className="flex gap-1.5 opacity-30 group-hover:opacity-100 active:opacity-100 transition-opacity">
                                  {!m.isPinned && (
                                    <button onClick={() => pinMessage(m.id)} className="hover:text-amber-500 active:text-amber-500 transition-colors p-0.5">
                                      <Pin className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button onClick={() => deleteMessage(m.id)} className="hover:text-red-500 active:text-red-500 transition-colors p-0.5">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Reactions display */}
                          {m.reactions && m.reactions.length > 0 && (
                            <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                              {m.reactions.map(r => (
                                <button
                                  key={r.emoji}
                                  onClick={() => sendReaction(m.id, r.emoji)}
                                  className={`flex items-center gap-0.5 text-xs rounded-full px-1.5 py-0.5 border transition-colors ${
                                    r.users.includes(userName)
                                      ? 'bg-primary/10 border-primary/30 text-primary'
                                      : 'bg-background border-border text-foreground hover:bg-muted'
                                  }`}
                                >
                                  <span>{r.emoji}</span>
                                  <span className="text-[10px] font-semibold">{r.users.length}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Reaction picker popup */}
                          <AnimatePresence>
                            {reactionPickerMsgId === m.id && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.8, y: 4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className={`flex gap-1 p-1.5 bg-background border rounded-2xl shadow-xl z-30 ${isMe ? 'self-end' : 'self-start'}`}
                                style={{ position: 'relative' }}
                              >
                                {['❤️','👍','🙏','😂','😢','🔥'].map(e => (
                                  <button
                                    key={e}
                                    className="text-xl hover:scale-125 active:scale-125 transition-transform"
                                    onClick={() => sendReaction(m.id, e)}
                                  >
                                    {e}
                                  </button>
                                ))}
                                <div className="w-px bg-border mx-0.5 self-stretch" />
                                <button
                                  className="flex items-center gap-1 text-xs text-primary font-semibold px-2 self-center rounded-lg hover:bg-muted active:bg-muted"
                                  onClick={() => { setReplyTo(m); setReactionPickerMsgId(null); inputRef.current?.focus(); }}
                                >
                                  <Reply className="w-3.5 h-3.5" />رد
                                </button>
                                <button
                                  className="text-[10px] text-muted-foreground px-1 self-center"
                                  onClick={() => setReactionPickerMsgId(null)}
                                >✕</button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Reply button (for my messages) */}
                        {isMe && (
                          <button
                            className="opacity-60 group-hover:opacity-100 active:opacity-100 transition-opacity self-end mb-1 ml-1 p-1.5 rounded-full hover:bg-muted active:bg-muted text-primary"
                            onClick={() => { setReplyTo(m); inputRef.current?.focus(); }}
                            title="رد"
                          >
                            <Reply className="w-4 h-4 rotate-180" />
                          </button>
                        )}
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>
      </div>

      {/* @mention autocomplete */}
      <AnimatePresence>
        {showMention && filteredMembers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="mx-3 mb-1 border rounded-xl bg-background shadow-lg overflow-hidden"
          >
            {filteredMembers.slice(0, 5).map(name => (
              <button
                key={name}
                className="w-full text-right px-4 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                onClick={() => insertMention(name)}
              >
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                  {name[0]}
                </div>
                {name}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emoji picker */}
      <AnimatePresence>
        {showEmoji && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mx-3 mb-1 p-3 border rounded-xl bg-background shadow-lg"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground">أضف إيموجي للرسالة</span>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => { setShowEmoji(false); inputRef.current?.focus(); }}
                title="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-10 gap-1.5">
              {EMOJIS.map(e => (
                <button
                  key={e}
                  className="text-xl hover:scale-125 active:scale-125 transition-transform"
                  onClick={() => insertEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image preview */}
      {imagePreview && (
        <div className="mx-3 mb-1 flex items-center gap-2 p-2 border rounded-xl bg-muted/40">
          <img src={imagePreview} alt="preview" className="w-14 h-14 object-cover rounded-lg" />
          <p className="text-xs text-muted-foreground flex-1">جاهزة للإرسال</p>
          <button onClick={() => setImagePreview(null)} className="text-muted-foreground hover:text-destructive">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="mx-3 mb-1 flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-r-2 border-primary rounded-r-lg">
          <Reply className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-primary">{replyTo.userName}</p>
            <p className="text-xs text-muted-foreground truncate">{replyTo.message || '📷 صورة'}</p>
          </div>
          <button onClick={() => setReplyTo(null)}>
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Locked banner when admin_only mode and user is not admin */}
      {messagingMode === 'admin_only' && !isLeader && (
        <div className="flex items-center justify-center gap-2 px-4 py-2.5 border-t bg-muted/50 shrink-0" style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))' }}>
          <span className="text-sm text-muted-foreground">🔒 الإرسال للأدمن فقط حالياً</span>
        </div>
      )}

      {/* Input bar */}
      {(messagingMode === 'all' || isLeader) && (
      <div className="flex items-end gap-1.5 px-3 py-2.5 border-t bg-background shrink-0" style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />
        <button
          className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={imageLoading}
          title="إرسال صورة"
          data-testid="button-attach-image"
        >
          {imageLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Image className="w-5 h-5" />}
        </button>

        <button
          className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
          onClick={() => setVersePickerOpen(true)}
          title="إرسال آية"
          data-testid="button-send-verse"
        >
          <BookOpen className="w-5 h-5" />
        </button>

        <textarea
          ref={inputRef}
          value={newMessage}
          rows={1}
          onChange={e => { handleInput(e.target.value); autoGrow(e.target); }}
          placeholder="اكتب رسالة..."
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          className="flex-1 min-w-0 resize-none bg-muted/40 rounded-2xl px-4 py-2 text-sm border-0 focus:outline-none focus:ring-1 focus:ring-primary max-h-32 leading-relaxed"
          dir="rtl"
          data-testid="input-chat-message"
        />

        <button
          className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
          onClick={() => setShowEmoji(v => !v)}
          title="إيموجي"
          data-testid="button-emoji"
        >
          <Smile className="w-5 h-5" />
        </button>

        <Button
          size="icon"
          className="rounded-full w-10 h-10 shrink-0"
          onClick={() => sendMessage()}
          disabled={sending || (!newMessage.trim() && !imagePreview)}
          data-testid="button-send-message"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
      )}

      {/* Verse picker dialog */}
      <Dialog open={versePickerOpen} onOpenChange={setVersePickerOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>إرسال آية كريمة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <select value={selectedBook} onChange={e => { setSelectedBook(e.target.value); setSelectedChapter(''); setSelectedVerse(''); }}
              className="w-full border rounded-md p-2.5 bg-background text-foreground" data-testid="select-verse-book">
              <option value="">اختر السفر</option>
              {allBooks?.map((b: any) => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            {selectedBookData && (
              <select value={selectedChapter} onChange={e => { setSelectedChapter(e.target.value); setSelectedVerse(''); }}
                className="w-full border rounded-md p-2.5 bg-background text-foreground" data-testid="select-verse-chapter">
                <option value="">اختر الإصحاح</option>
                {Array.from({ length: selectedBookData.chaptersCount }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            )}
            {verses && verses.length > 0 && (
              <select value={selectedVerse} onChange={e => setSelectedVerse(e.target.value)}
                className="w-full border rounded-md p-2.5 bg-background text-foreground" data-testid="select-verse-number">
                <option value="">اختر الآية</option>
                {verses.map((v: any) => <option key={v.verse} value={v.verse}>{v.verse} — {v.text?.slice(0, 40)}…</option>)}
              </select>
            )}
            <Button onClick={sendVerse} disabled={!selectedVerse} className="w-full h-11" data-testid="button-confirm-send-verse">
              <Send className="w-4 h-4 ml-2" />
              إرسال الآية
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
