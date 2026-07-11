import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import {
  chatbotScenarioStore, chatbotSettingsStore,
  DEFAULT_SCENARIOS, type ChatbotScenario, type ChatbotSettings,
} from '@/stores/chatbotStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Bot, MessageSquare, Settings, Plus, Trash2, RefreshCw, Send, Sparkles, CheckCircle2, Circle, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

interface ChatMessage { role: 'user' | 'bot'; text: string; ts: string; }

const ChatbotManager: React.FC = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isAr = language === 'ar';
  const clinicId = user?.clinicId || '';

  const [scenarios, setScenarios] = useState<ChatbotScenario[]>([]);
  const [botSettings, setBotSettings] = useState<ChatbotSettings>({
    clinicId, isEnabled: true,
    welcomeMessage: isAr ? 'مرحباً بكم في عيادتنا! كيف يمكنني مساعدتكم؟' : 'Welcome! How can I help you today?',
    outOfHoursMessage: isAr ? 'العيادة مغلقة حالياً، سنرد عليكم في أقرب وقت.' : 'The clinic is closed now. We will reply soon.',
    bookingUrl: '', clinicPhone: '',
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newScenario, setNewScenario] = useState({ trigger: '', reply: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string>(`cb-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // WhatsApp Simulator state
  const [simMessages, setSimMessages] = useState<ChatMessage[]>([]);
  const [simInput, setSimInput] = useState('');
  const [simSending, setSimSending] = useState(false);
  const [simState, setSimState] = useState<string>('idle');
  const simUserId = useRef<string>(`sim-${clinicId}-${Date.now()}`);
  const simBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadScenarios = () => {
      let all = chatbotScenarioStore.getAll().filter(s => s.clinicId === clinicId);
      if (all.length === 0 && clinicId) {
        DEFAULT_SCENARIOS.forEach((s, i) => chatbotScenarioStore.add({ ...s, id: `sc-${clinicId}-${i}`, clinicId, usageCount: 0, createdAt: new Date().toISOString() }));
        all = chatbotScenarioStore.getAll().filter(s => s.clinicId === clinicId);
      }
      setScenarios(all);
    };
    loadScenarios();
    const unsub = chatbotScenarioStore.subscribe(loadScenarios);

    const loadSettings = () => {
      const existing = chatbotSettingsStore.getAll().find(s => s.clinicId === clinicId);
      if (existing) setBotSettings(existing);
    };
    loadSettings();
    const unsubSettings = chatbotSettingsStore.subscribe(loadSettings);

    return () => { unsub(); unsubSettings(); };
  }, [clinicId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const saveSettings = () => {
    const existing = chatbotSettingsStore.getAll().find(s => s.clinicId === clinicId);
    if (existing) chatbotSettingsStore.update(s => s.clinicId === clinicId, botSettings);
    else chatbotSettingsStore.add({ ...botSettings, clinicId, id: `cbset-${Date.now()}` });
    toast.success(isAr ? 'تم حفظ الإعدادات' : 'Settings saved');
  };

  const sendMessage = async () => {
    if (!input.trim() || isSending) return;
    const userMsg = input.trim();
    setInput('');
    const ts = new Date().toISOString();
    setMessages(m => [...m, { role: 'user', text: userMsg, ts }]);
    setIsSending(true);
    try {
      const res = await fetch('/api/chatbot-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          scenarios,
          settings: botSettings,
          sessionId: sessionIdRef.current,
          clinicId,
        }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: 'bot', text: data.reply || (isAr ? 'آسف، حدث خطأ.' : 'Sorry, an error occurred.'), ts: new Date().toISOString() }]);
      // Increment usage count if matched scenario
      if (data.source === 'scenario') {
        const matched = scenarios.find(s => userMsg.toLowerCase().includes(s.trigger.toLowerCase()));
        if (matched) chatbotScenarioStore.update(s => s.id === matched.id, { usageCount: (matched.usageCount || 0) + 1 });
      }
    } catch {
      setMessages(m => [...m, { role: 'bot', text: isAr ? 'حدث خطأ في الاتصال' : 'Connection error', ts: new Date().toISOString() }]);
    }
    setIsSending(false);
  };

  const generateScenarios = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/chatbot-scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicType: 'general', language }),
      });
      const data = await res.json();
      (data.scenarios || []).forEach((s: any) => {
        chatbotScenarioStore.add({ id: `sc-${Date.now()}-${Math.random().toString(36).slice(2)}`, clinicId, trigger: s.trigger, reply: s.reply, isActive: true, usageCount: 0, createdAt: new Date().toISOString() });
      });
      toast.success(isAr ? `تم توليد ${(data.scenarios || []).length} سيناريو` : `Generated ${(data.scenarios || []).length} scenarios`);
    } catch {
      toast.error(isAr ? 'فشل التوليد' : 'Generation failed');
    }
    setIsGenerating(false);
  };

  const addScenario = () => {
    if (!newScenario.trigger || !newScenario.reply) return;
    chatbotScenarioStore.add({ id: `sc-${Date.now()}`, clinicId, trigger: newScenario.trigger, reply: newScenario.reply, isActive: true, usageCount: 0, createdAt: new Date().toISOString() });
    setNewScenario({ trigger: '', reply: '' });
    toast.success(isAr ? 'تم إضافة السيناريو' : 'Scenario added');
  };

  const toggleScenario = (id: string, isActive: boolean) => chatbotScenarioStore.update(s => s.id === id, { isActive: !isActive });
  const deleteScenario = (id: string) => chatbotScenarioStore.remove(s => s.id === id);

  const timeAgo = (ts: string) => {
    const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return isAr ? 'الآن' : 'now';
    return isAr ? `${m} د` : `${m}m`;
  };

  const sendSimMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = simInput.trim();
    if (!text || simSending) return;
    setSimInput('');
    const ts = new Date().toISOString();
    setSimMessages(prev => [...prev, { role: 'user', text, ts }]);
    setSimSending(true);
    setTimeout(() => simBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    try {
      const res = await fetch('/api/whatsapp-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: simUserId.current, message: text, clinicId }),
      });
      const data = await res.json();
      if (data.reply) {
        setSimMessages(prev => [...prev, { role: 'bot', text: data.reply, ts: new Date().toISOString() }]);
        setSimState(data.state || 'idle');
      } else {
        setSimMessages(prev => [...prev, { role: 'bot', text: data.error || 'خطأ غير متوقع', ts: new Date().toISOString() }]);
      }
    } catch {
      setSimMessages(prev => [...prev, { role: 'bot', text: 'تعذّر الاتصال بالخادم.', ts: new Date().toISOString() }]);
    } finally {
      setSimSending(false);
      setTimeout(() => simBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  const resetSim = () => {
    simUserId.current = `sim-${clinicId}-${Date.now()}`;
    setSimMessages([]);
    setSimState('idle');
    setSimInput('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            {isAr ? 'مدير الشات بوت' : 'WhatsApp Chatbot'}
          </h1>
          <p className="text-muted-foreground">{isAr ? 'إدارة ردود واتساب التلقائية' : 'Manage automated WhatsApp replies'}</p>
        </div>
        <Badge variant={botSettings.isEnabled ? 'default' : 'secondary'} className="gap-1.5 text-sm px-3 py-1">
          <span className={`h-2 w-2 rounded-full ${botSettings.isEnabled ? 'bg-green-400' : 'bg-gray-400'}`} />
          {botSettings.isEnabled ? (isAr ? 'نشط' : 'Active') : (isAr ? 'متوقف' : 'Paused')}
        </Badge>
      </div>

      <Tabs defaultValue="test">
        <TabsList>
          <TabsTrigger value="test" className="gap-1.5">
            <MessageSquare className="h-4 w-4" />
            {isAr ? 'اختبار مباشر' : 'Live Test'}
          </TabsTrigger>
          <TabsTrigger value="scenarios" className="gap-1.5">
            <Bot className="h-4 w-4" />
            {isAr ? 'السيناريوهات' : 'Scenarios'}
            <Badge variant="secondary" className="h-5 text-xs">{scenarios.filter(s => s.isActive).length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings className="h-4 w-4" />
            {isAr ? 'الإعدادات' : 'Settings'}
          </TabsTrigger>
          <TabsTrigger value="wa-sim" className="gap-1.5">
            <Smartphone className="h-4 w-4" />
            {isAr ? 'محاكي واتساب' : 'WA Simulator'}
          </TabsTrigger>
        </TabsList>

        {/* ── Live Test Tab ─────────────────────────────────────── */}
        <TabsContent value="test" className="mt-4">
          <Card>
            <CardHeader className="pb-3 flex-row items-center gap-3 space-y-0">
              <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">{isAr ? 'بوت العيادة' : 'Clinic Bot'}</CardTitle>
                <p className="text-xs text-green-600 font-medium">{isAr ? 'متصل' : 'Online'}</p>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              {/* Chat messages */}
              <div className="h-80 overflow-y-auto p-4 space-y-3 bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2260%22%20height%3D%2260%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%221%22%20fill%3D%22rgba(0%2C0%2C0%2C.03)%22%2F%3E%3C/svg%3E')]">
                {/* Welcome */}
                <div className="flex justify-start">
                  <div className="max-w-[75%] bg-white dark:bg-muted border rounded-xl rounded-tl-sm px-3 py-2 shadow-sm">
                    <p className="text-sm">{botSettings.welcomeMessage}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 text-right">{isAr ? 'البوت' : 'Bot'}</p>
                  </div>
                </div>
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-xl shadow-sm text-sm ${msg.role === 'user' ? 'bg-green-500 text-white rounded-tr-sm' : 'bg-white dark:bg-muted border rounded-tl-sm'}`}>
                      <p>{msg.text}</p>
                      <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-green-100 text-right' : 'text-muted-foreground text-right'}`}>{timeAgo(msg.ts)}</p>
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-muted border rounded-xl rounded-tl-sm px-3 py-2 shadow-sm">
                      <div className="flex gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} /><span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} /><span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} /></div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
              {/* Input */}
              <div className="p-3 border-t flex gap-2">
                <Input
                  placeholder={isAr ? 'اكتب رسالة...' : 'Type a message...'}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  className="flex-1"
                />
                <Button size="sm" onClick={sendMessage} disabled={isSending || !input.trim()} className="gap-1 bg-green-500 hover:bg-green-600 text-white">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Scenarios Tab ─────────────────────────────────────── */}
        <TabsContent value="scenarios" className="mt-4 space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">{isAr ? 'يطابق النظام الرسائل الواردة بهذه الكلمات المفتاحية' : 'System matches incoming messages with these keywords'}</p>
            <Button size="sm" variant="outline" onClick={generateScenarios} disabled={isGenerating} className="gap-1.5">
              {isGenerating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {isAr ? 'توليد بالذكاء الاصطناعي' : 'AI Generate'}
            </Button>
          </div>

          {/* Add new */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{isAr ? 'الكلمة المفتاحية (Trigger)' : 'Trigger Keyword'}</Label>
                  <Input placeholder={isAr ? 'مثال: حجز موعد' : 'e.g. book appointment'} value={newScenario.trigger} onChange={e => setNewScenario(p => ({ ...p, trigger: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{isAr ? 'الرد التلقائي' : 'Auto Reply'}</Label>
                  <Input placeholder={isAr ? 'رسالة الرد...' : 'Reply message...'} value={newScenario.reply} onChange={e => setNewScenario(p => ({ ...p, reply: e.target.value }))} />
                </div>
              </div>
              <Button size="sm" onClick={addScenario} className="gap-1.5">
                <Plus className="h-4 w-4" />
                {isAr ? 'إضافة سيناريو' : 'Add Scenario'}
              </Button>
            </CardContent>
          </Card>

          {/* Scenario list */}
          <div className="space-y-2">
            {scenarios.map(s => (
              <Card key={s.id} className={`border ${s.isActive ? '' : 'opacity-60'}`}>
                <CardContent className="p-3 flex items-start gap-3">
                  <button onClick={() => toggleScenario(s.id!, s.isActive)} className="mt-0.5 shrink-0">
                    {s.isActive ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs font-mono">{s.trigger}</Badge>
                      {s.usageCount > 0 && <span className="text-xs text-muted-foreground">{s.usageCount}× {isAr ? 'استخدام' : 'uses'}</span>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{s.reply}</p>
                  </div>
                  <button onClick={() => deleteScenario(s.id!)} className="text-destructive hover:text-destructive/80 shrink-0 mt-0.5">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Settings Tab ──────────────────────────────────────── */}
        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{isAr ? 'إعدادات البوت' : 'Bot Settings'}</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{isAr ? 'تفعيل البوت' : 'Enable Chatbot'}</p>
                  <p className="text-sm text-muted-foreground">{isAr ? 'الرد التلقائي على رسائل واتساب' : 'Auto-reply to WhatsApp messages'}</p>
                </div>
                <Switch checked={botSettings.isEnabled} onCheckedChange={v => setBotSettings(p => ({ ...p, isEnabled: v }))} />
              </div>
              <Separator />
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{isAr ? 'رقم الواتساب' : 'WhatsApp Number'}</Label>
                  <Input placeholder="+20 10xxxxxxxx" value={botSettings.clinicPhone} onChange={e => setBotSettings(p => ({ ...p, clinicPhone: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{isAr ? 'رابط الحجز' : 'Booking URL'}</Label>
                  <Input placeholder="https://..." value={botSettings.bookingUrl} onChange={e => setBotSettings(p => ({ ...p, bookingUrl: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'رسالة الترحيب' : 'Welcome Message'}</Label>
                <Textarea rows={2} value={botSettings.welcomeMessage} onChange={e => setBotSettings(p => ({ ...p, welcomeMessage: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'رسالة خارج أوقات العمل' : 'Out-of-Hours Message'}</Label>
                <Textarea rows={2} value={botSettings.outOfHoursMessage} onChange={e => setBotSettings(p => ({ ...p, outOfHoursMessage: e.target.value }))} />
              </div>
              <Button onClick={saveSettings} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {isAr ? 'حفظ الإعدادات' : 'Save Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── WhatsApp Booking Bot Simulator ─────────────────── */}
        <TabsContent value="wa-sim" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-green-600" />
                    {isAr ? 'محاكي بوت الحجز عبر واتساب' : 'WhatsApp Booking Bot Simulator'}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAr ? 'اختبر تدفق الحجز كما يراه المريض. أرسل "حجز" للبدء.' : 'Test the booking flow as a patient sees it. Send "حجز" to start.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-mono">
                    {isAr ? 'الحالة:' : 'State:'} {simState}
                  </Badge>
                  <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={resetSim}>
                    <RefreshCw className="h-3 w-3" />
                    {isAr ? 'إعادة' : 'Reset'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Chat window */}
              <div className="h-80 overflow-y-auto bg-[#e5ddd5] dark:bg-muted/30 px-3 py-3 flex flex-col gap-2">
                {/* Quick-start hint */}
                {simMessages.length === 0 && (
                  <div className="flex justify-center">
                    <span className="text-[10px] bg-black/10 text-foreground/70 px-3 py-1 rounded-full">
                      {isAr ? 'أرسل "حجز" أو "عاوز احجز" للبدء' : 'Send "حجز" or "عاوز احجز" to start'}
                    </span>
                  </div>
                )}
                {simMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] px-3 py-2 rounded-xl shadow-sm text-sm whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-[#dcf8c6] dark:bg-green-900 text-foreground rounded-tr-sm'
                        : 'bg-white dark:bg-muted border rounded-tl-sm text-foreground'
                    }`}>
                      <p>{msg.text}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{timeAgo(msg.ts)}</p>
                    </div>
                  </div>
                ))}
                {simSending && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-muted border rounded-xl rounded-tl-sm px-3 py-2 shadow-sm">
                      <div className="flex gap-1">
                        {[0, 150, 300].map(d => (
                          <span key={d} className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={simBottomRef} />
              </div>

              {/* Quick-send chips */}
              <div className="px-3 pt-2 flex gap-1.5 flex-wrap">
                {['حجز', 'احجز قلب بكره', 'احجز أسنان الصبح', '1', '2', '0'].map(chip => (
                  <button
                    key={chip}
                    type="button"
                    className="text-xs border rounded-full px-2.5 py-0.5 hover:bg-muted transition-colors"
                    onClick={() => setSimInput(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Input row */}
              <form onSubmit={sendSimMessage} className="flex gap-2 p-3 border-t">
                <Input
                  className="flex-1 h-8 text-sm"
                  placeholder={isAr ? 'اكتب رسالة...' : 'Type a message...'}
                  value={simInput}
                  onChange={e => setSimInput(e.target.value)}
                  disabled={simSending}
                />
                <Button type="submit" size="sm" className="h-8 px-3 bg-green-600 hover:bg-green-700" disabled={simSending || !simInput.trim()}>
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ChatbotManager;
