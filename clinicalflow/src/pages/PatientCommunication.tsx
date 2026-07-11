import React, { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { usePatients } from '@/hooks/usePatients';
import { useAppointments } from '@/hooks/useVisits';
import { useUsers } from '@/hooks/useUsers';
import { messageStore, PatientMessage, MessageType } from '@/stores/communicationStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MessageSquare, Send, Sparkles, RefreshCw, Copy, Phone, Search, Clock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const MESSAGE_TYPES: { value: MessageType; labelEn: string; labelAr: string }[] = [
  { value: 'reminder',     labelEn: 'Appointment Reminder', labelAr: 'تذكير بالموعد' },
  { value: 'confirmation', labelEn: 'Booking Confirmation', labelAr: 'تأكيد الحجز' },
  { value: 'followup',     labelEn: 'Post-Visit Follow-up', labelAr: 'متابعة بعد الزيارة' },
  { value: 'no_show',      labelEn: 'Missed Appointment',   labelAr: 'موعد فائت' },
  { value: 'custom',       labelEn: 'Custom Message',       labelAr: 'رسالة مخصصة' },
];

const PatientCommunication: React.FC = () => {
  const { isAr, language } = useLanguage();
  const { user } = useAuth();
  const { patients } = usePatients();
  const { appointments } = useAppointments();
  const { doctors } = useUsers();

  const [search, setSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('reminder');
  const [customNote, setCustomNote] = useState('');
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [sentMessages, setSentMessages] = useState<PatientMessage[]>(() => messageStore.getAll());

  const filteredPatients = useMemo(() => {
    const q = search.toLowerCase();
    return patients.filter(p =>
      p.name.toLowerCase().includes(q) || p.nameAr.includes(q) || p.phone.includes(q)
    ).slice(0, 20);
  }, [patients, search]);

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  const lastAppointment = useMemo(() => {
    if (!selectedPatientId) return null;
    return appointments
      .filter(a => a.patientId === selectedPatientId)
      .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  }, [appointments, selectedPatientId]);

  const lastDoctor = lastAppointment ? doctors.find(d => d.id === lastAppointment.doctorId) : null;

  const handleGenerate = async () => {
    if (!selectedPatient) return;
    setIsGenerating(true);
    setGeneratedMessage('');
    try {
      const res = await fetch('/api/generate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageType,
          patientName: isAr ? selectedPatient.nameAr : selectedPatient.name,
          appointmentDate: lastAppointment?.date || '',
          appointmentTime: lastAppointment?.time || '',
          doctorName: lastDoctor ? (isAr ? lastDoctor.nameAr : lastDoctor.name) : '',
          clinicName: isAr ? 'عيادتنا' : 'Our Clinic',
          language,
          customNote,
        }),
      });
      const data = await res.json();
      setGeneratedMessage(data.message || '');
    } catch {
      toast.error(isAr ? 'فشل في توليد الرسالة' : 'Failed to generate message');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedMessage);
    toast.success(isAr ? 'تم النسخ' : 'Copied to clipboard');
  };

  const handleWhatsApp = () => {
    if (!selectedPatient || !generatedMessage) return;
    const phone = selectedPatient.phone.replace(/\D/g, '');
    const intl = phone.startsWith('0') ? `2${phone}` : phone;
    const url = `https://wa.me/${intl}?text=${encodeURIComponent(generatedMessage)}`;
    window.open(url, '_blank');
    // Save to message log
    const msg: PatientMessage = {
      id: `msg-${Date.now()}`,
      clinicId: user?.clinicId || '',
      patientId: selectedPatient.id,
      patientName: selectedPatient.name,
      patientPhone: selectedPatient.phone,
      messageType,
      content: generatedMessage,
      status: 'sent',
      language: language as 'ar' | 'en',
      createdAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
    };
    messageStore.add(msg);
    setSentMessages(messageStore.getAll());
    toast.success(isAr ? 'تم فتح واتساب' : 'WhatsApp opened');
  };

  const patientMessages = useMemo(() =>
    sentMessages.filter(m => m.patientId === selectedPatientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [sentMessages, selectedPatientId]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <MessageSquare className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{isAr ? 'التواصل مع المرضى' : 'Patient Communication'}</h1>
          <p className="text-sm text-muted-foreground">{isAr ? 'إرسال رسائل واتساب ذكية للمرضى' : 'Send AI-powered WhatsApp messages to patients'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patient selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{isAr ? 'اختر المريض' : 'Select Patient'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 text-sm"
                placeholder={isAr ? 'ابحث بالاسم أو الهاتف...' : 'Search by name or phone...'}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {filteredPatients.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPatientId(p.id); setGeneratedMessage(''); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors ${selectedPatientId === p.id ? 'bg-primary/10 text-primary font-medium' : ''}`}
                >
                  <div className="font-medium">{isAr ? p.nameAr : p.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />{p.phone}
                  </div>
                </button>
              ))}
              {filteredPatients.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">{isAr ? 'لا نتائج' : 'No results'}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Message composer */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {isAr ? 'توليد الرسالة بالذكاء الاصطناعي' : 'AI Message Generator'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedPatient ? (
              <div className="py-12 text-center text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{isAr ? 'اختر مريضاً للبدء' : 'Select a patient to get started'}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                    {selectedPatient.name[0]}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{isAr ? selectedPatient.nameAr : selectedPatient.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{selectedPatient.phone}</p>
                  </div>
                </div>

                <Select value={messageType} onValueChange={(v: MessageType) => { setMessageType(v); setGeneratedMessage(''); }}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESSAGE_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        {isAr ? t.labelAr : t.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {messageType === 'custom' && (
                  <Textarea
                    rows={2}
                    placeholder={isAr ? 'أضف ملاحظة أو تعليمة إضافية...' : 'Add a custom note or instruction...'}
                    value={customNote}
                    onChange={e => setCustomNote(e.target.value)}
                    className="resize-none text-sm"
                  />
                )}

                <Button className="w-full gap-2" onClick={handleGenerate} disabled={isGenerating}>
                  {isGenerating
                    ? <><RefreshCw className="h-4 w-4 animate-spin" />{isAr ? 'جارٍ التوليد...' : 'Generating...'}</>
                    : <><Sparkles className="h-4 w-4" />{isAr ? 'توليد رسالة بالذكاء الاصطناعي' : 'Generate AI Message'}</>}
                </Button>

                {generatedMessage && (
                  <div className="space-y-3">
                    <Textarea
                      rows={5}
                      value={generatedMessage}
                      onChange={e => setGeneratedMessage(e.target.value)}
                      className="resize-none text-sm"
                      dir={language === 'ar' ? 'rtl' : 'ltr'}
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={handleCopy}>
                        <Copy className="h-3.5 w-3.5" />{isAr ? 'نسخ' : 'Copy'}
                      </Button>
                      <Button size="sm" className="gap-1.5 flex-1 bg-green-600 hover:bg-green-700" onClick={handleWhatsApp}>
                        <Send className="h-3.5 w-3.5" />{isAr ? 'إرسال واتساب' : 'Send WhatsApp'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Message history */}
                {patientMessages.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground uppercase">{isAr ? 'الرسائل السابقة' : 'Message History'}</p>
                    {patientMessages.slice(0, 3).map(m => {
                      const mt = MESSAGE_TYPES.find(t => t.value === m.messageType);
                      return (
                        <div key={m.id} className="flex items-start gap-2 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-medium">{isAr ? mt?.labelAr : mt?.labelEn}</span>
                            <span className="text-muted-foreground mx-1">·</span>
                            <span className="text-muted-foreground">{new Date(m.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB')}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PatientCommunication;
