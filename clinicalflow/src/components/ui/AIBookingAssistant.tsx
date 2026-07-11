import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useSpecialties } from '@/hooks/useSpecialties';
import { useUsers } from '@/hooks/useUsers';
import { useSchedule } from '@/hooks/useSchedule';
import { useAppointments } from '@/hooks/useVisits';
import { usePatients } from '@/hooks/usePatients';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, X, Send, Bot, User, Loader2, CalendarCheck, Stethoscope, Search, UserCheck } from 'lucide-react';
import { toast } from 'sonner';

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SlotSelection {
  doctorId: string;
  doctorName: string;
  specialtyId: string;
  slots: { date: string; times: string[] }[];
}

interface DoctorOption {
  id: string;
  name: string;
  nameAr: string;
  specialtyId: string;
}

interface PendingBooking {
  doctorId: string;
  doctorName: string;
  specialtyId: string;
  specialtyName: string;
  date: string;
  time: string;
}

const QUICK_PROMPTS = [
  'عندي ألم في الأسنان',
  'عندي صداع شديد',
  'عندي ألم في المعدة',
  'عاوز دكتور جلدية',
  'عاوز دكتور أسنان',
  'عاوز أقرب ميعاد',
];

const DEMO_SLOTS = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30'];

const SPECIALTY_KEYWORDS: Record<string, string[]> = {
  'Dentistry': ['أسنان', 'سن', 'ضرس', 'اسنان', 'dentist', 'dental', 'teeth', 'tooth'],
  'Dermatology': ['جلدية', 'جلد', 'بشرة', 'حبوب', 'طفح', 'derma', 'skin', 'rash'],
  'Cardiology': ['قلب', 'صدر', 'cardio', 'heart', 'chest'],
  'Orthopedics': ['عظام', 'مفاصل', 'ظهر', 'عظم', 'ortho', 'bone', 'joint', 'back'],
  'Ophthalmology': ['عيون', 'عين', 'نظر', 'eye', 'vision', 'ophthal'],
  'ENT': ['أنف', 'أذن', 'حنجرة', 'انف', 'اذن', 'ear', 'nose', 'throat', 'ent'],
  'Neurology': ['أعصاب', 'صداع', 'اعصاب', 'neuro', 'headache', 'migraine'],
  'Gastroenterology': ['معدة', 'هضمي', 'بطن', 'أمعاء', 'امعاء', 'gastro', 'stomach', 'digest'],
  'General Medicine': ['عام', 'باطنة', 'حرارة', 'برد', 'انفلونزا', 'general', 'fever', 'cold', 'flu', 'internal'],
  'Pediatrics': ['أطفال', 'اطفال', 'طفل', 'pediatr', 'child', 'kid'],
  'Urology': ['مسالك', 'بول', 'كلى', 'urol', 'urinary', 'kidney'],
  'Gynecology': ['نساء', 'نسا', 'توليد', 'gyn', 'obstet', 'women'],
  'Psychiatry': ['نفسي', 'نفسية', 'اكتئاب', 'قلق', 'psych', 'mental', 'depression', 'anxiety'],
};

const SPECIALTY_NAMES_AR: Record<string, string> = {
  'Dentistry': 'طب الأسنان',
  'Dermatology': 'الجلدية',
  'Cardiology': 'القلب',
  'Orthopedics': 'العظام',
  'Ophthalmology': 'العيون',
  'ENT': 'أنف وأذن وحنجرة',
  'Neurology': 'الأعصاب',
  'Gastroenterology': 'الجهاز الهضمي',
  'General Medicine': 'طب عام',
  'Pediatrics': 'الأطفال',
  'Urology': 'المسالك البولية',
  'Gynecology': 'النساء والتوليد',
  'Psychiatry': 'الطب النفسي',
};

const EARLIEST_KEYWORDS = ['أقرب', 'اقرب', 'أسرع', 'اسرع', 'earliest', 'soonest', 'first available', 'أول'];
const DOCTOR_KEYWORDS = ['دكتور', 'دكتوره', 'طبيب', 'doctor', 'dr'];

function generateDemoSlots(): { date: string; times: string[] }[] {
  const slots: { date: string; times: string[] }[] = [];
  const today = new Date();
  for (let i = 1; i <= 30 && slots.length < 5; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const day = d.getDay();
    if (day >= 0 && day <= 4) {
      slots.push({ date: d.toISOString().split('T')[0], times: [...DEMO_SLOTS] });
    }
  }
  return slots;
}

function isArabicText(text: string): boolean {
  const arabicChars = text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g);
  return !!arabicChars && arabicChars.length > text.replace(/\s/g, '').length * 0.3;
}

function extractTime(text: string): string | null {
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const h = match[1].padStart(2, '0');
    return `${h}:${match[2]}`;
  }
  return null;
}

interface AIBookingAssistantProps {
  mode?: 'floating' | 'embedded';
  patientId?: string;
  onBookingComplete?: () => void;
}

const AIBookingAssistant = ({ mode = 'floating', patientId: externalPatientId, onBookingComplete }: AIBookingAssistantProps) => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { specialties } = useSpecialties();
  const { activeDoctors, getDoctorsBySpecialty } = useUsers();
  const { getAvailableSlots, getDoctorWorkingDays } = useSchedule();
  const { createAppointment } = useAppointments();
  const { patients } = usePatients();

  const isEmbedded = mode === 'embedded';
  const isStaffUser = user?.role === 'admin' || user?.role === 'receptionist' || user?.role === 'doctor';
  const needsPatientSelection = !isEmbedded && isStaffUser && !externalPatientId;

  const [isOpen, setIsOpen] = useState(isEmbedded);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingBooking, setPendingBooking] = useState<PendingBooking | null>(null);
  const [slotSelection, setSlotSelection] = useState<SlotSelection | null>(null);
  const [doctorOptions, setDoctorOptions] = useState<DoctorOption[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [patientSearch, setPatientSearch] = useState('');
  const [chatLang, setChatLang] = useState<'ar' | 'en'>(language === 'ar' ? 'ar' : 'en');
  const chatLangRef = useRef(chatLang);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredPatients = patients.filter(p => {
    if (!patientSearch.trim()) return true;
    const q = patientSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.nameAr.includes(patientSearch) || p.phone.includes(q);
  });

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, pendingBooking, slotSelection, doctorOptions]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const getPatientId = (): string => {
    if (externalPatientId) return externalPatientId;
    if (selectedPatientId) return selectedPatientId;
    if (user?.role === 'patient' && user?.patientId) return user.patientId;
    if (isStaffUser) return '';
    const firstPatient = patients[0];
    return firstPatient?.id || '';
  };

  const getSelectedPatientName = (): string => {
    const pid = getPatientId();
    const patient = patients.find(p => p.id === pid);
    if (!patient) return '';
    return language === 'ar' ? patient.nameAr : patient.name;
  };

  const getDoctorSlotsWithFallback = (doctorId: string): { date: string; times: string[] }[] => {
    const workingDays = getDoctorWorkingDays(doctorId);
    const slots: { date: string; times: string[] }[] = [];
    const today = new Date();

    if (workingDays.length > 0) {
      for (let i = 1; i <= 60 && slots.length < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        if (workingDays.includes(d.getDay())) {
          const dateStr = d.toISOString().split('T')[0];
          const available = getAvailableSlots(doctorId, dateStr);
          if (available.length > 0) {
            slots.push({ date: dateStr, times: available.slice(0, 8) });
          }
        }
      }
    }

    if (slots.length === 0) {
      return generateDemoSlots();
    }
    return slots;
  };

  const addBotMessage = (content: string) => {
    setMessages(prev => [...prev, { role: 'assistant', content }]);
  };

  const addUserMessage = (content: string) => {
    const detectedLang = isArabicText(content) ? 'ar' : 'en';
    setChatLang(detectedLang);
    chatLangRef.current = detectedLang;
    setMessages(prev => [...prev, { role: 'user', content }]);
  };

  const matchSpecialtyLocally = (text: string): string | null => {
    const lower = text.toLowerCase();
    for (const [specName, keywords] of Object.entries(SPECIALTY_KEYWORDS)) {
      if (keywords.some(kw => lower.includes(kw))) {
        return specName;
      }
    }
    const activeSpecs = specialties.filter(s => s.isActive);
    for (const spec of activeSpecs) {
      if (lower.includes(spec.name.toLowerCase()) || lower.includes(spec.nameAr)) {
        return spec.name;
      }
    }
    return null;
  };

  const findSpecialtyByName = (name: string) => {
    const lower = name.toLowerCase().trim();
    return specialties.find(s =>
      s.isActive && (
        s.name.toLowerCase().includes(lower) ||
        lower.includes(s.name.toLowerCase()) ||
        s.nameAr.includes(name.trim())
      )
    );
  };

  const getSpecDisplayName = (specName: string): string => {
    const spec = findSpecialtyByName(specName);
    if (spec) return chatLangRef.current === 'ar' ? spec.nameAr : spec.name;
    const allSpecs = specialties.filter(s => s.isActive);
    const found = allSpecs.find(s => s.name.toLowerCase() === specName.toLowerCase() || s.nameAr === specName);
    if (found) return chatLangRef.current === 'ar' ? found.nameAr : found.name;
    if (chatLangRef.current === 'ar' && SPECIALTY_NAMES_AR[specName]) return SPECIALTY_NAMES_AR[specName];
    return specName;
  };

  const showDoctorsForSpecialty = (specName: string) => {
    const spec = findSpecialtyByName(specName);
    const displayName = getSpecDisplayName(specName);
    if (!spec) {
      const activeSpecs = specialties.filter(s => s.isActive);
      if (activeSpecs.length === 0) {
        addBotMessage(
          chatLangRef.current === 'ar'
            ? 'عذراً، مفيش تخصصات متاحة حالياً.'
            : 'Sorry, no specialties available currently.'
        );
        return;
      }
      const specList = activeSpecs.map(s => chatLangRef.current === 'ar' ? s.nameAr : s.name).join('\n- ');
      addBotMessage(
        chatLangRef.current === 'ar'
          ? `عذراً، تخصص ${displayName} مش متاح حالياً. التخصصات المتاحة:\n- ${specList}`
          : `Sorry, ${displayName} is not available currently. Available specialties:\n- ${specList}`
      );
      return;
    }

    const doctors = getDoctorsBySpecialty(spec.id);
    if (doctors.length === 0) {
      addBotMessage(
        chatLangRef.current === 'ar'
          ? `عذراً، مفيش دكاترة متاحين في ${spec.nameAr} حالياً.`
          : `Sorry, no doctors available in ${spec.name} currently.`
      );
      return;
    }

    setDoctorOptions(doctors.map(d => ({ id: d.id, name: d.name, nameAr: d.nameAr, specialtyId: spec.id })));
    addBotMessage(
      chatLangRef.current === 'ar'
        ? `تمام! دول الدكاترة المتاحين في ${spec.nameAr}. اختار دكتور:`
        : `Here are the available doctors in ${spec.name}. Choose a doctor:`
    );
  };

  const searchDoctorByName = (name: string) => {
    const searchLower = name.toLowerCase();
    const found = activeDoctors.filter(d =>
      d.name.toLowerCase().includes(searchLower) ||
      d.nameAr.includes(name)
    );

    if (found.length === 0) {
      addBotMessage(
        chatLangRef.current === 'ar'
          ? 'عذراً، مفيش دكتور بالاسم ده. جرب تاني أو اختار تخصص.'
          : 'Sorry, no doctor found with that name. Try again or choose a specialty.'
      );
      return;
    }

    if (found.length === 1) {
      const doc = found[0];
      const docName = chatLangRef.current === 'ar' ? doc.nameAr : doc.name;
      const slots = getDoctorSlotsWithFallback(doc.id);
      setDoctorOptions([]);
      setSlotSelection({
        doctorId: doc.id,
        doctorName: docName,
        specialtyId: doc.specialtyId || '',
        slots,
      });
      addBotMessage(
        chatLangRef.current === 'ar'
          ? `تمام! دي المواعيد المتاحة مع ${docName}. اختار الوقت اللي يناسبك:`
          : `Here are the available slots for ${docName}. Pick a time:`
      );
    } else {
      setDoctorOptions(found.map(d => ({ id: d.id, name: d.name, nameAr: d.nameAr, specialtyId: d.specialtyId || '' })));
      addBotMessage(
        chatLangRef.current === 'ar'
          ? 'لقيت أكتر من دكتور. اختار واحد:'
          : 'Found multiple doctors. Choose one:'
      );
    }
  };

  const handleEarliestAppointment = () => {
    let earliest: { doctorId: string; doctorName: string; doctorNameAr: string; specialtyId: string; specialtyName: string; specialtyNameAr: string; date: string; time: string } | null = null;

    for (const doc of activeDoctors) {
      const slots = getDoctorSlotsWithFallback(doc.id);
      if (slots.length > 0 && slots[0].times.length > 0) {
        const slot = {
          doctorId: doc.id,
          doctorName: doc.name,
          doctorNameAr: doc.nameAr,
          specialtyId: doc.specialtyId || '',
          specialtyName: specialties.find(s => s.id === doc.specialtyId)?.name || '',
          specialtyNameAr: specialties.find(s => s.id === doc.specialtyId)?.nameAr || '',
          date: slots[0].date,
          time: slots[0].times[0],
        };
        if (!earliest || slot.date < earliest.date || (slot.date === earliest.date && slot.time < earliest.time)) {
          earliest = slot;
        }
      }
    }

    if (earliest) {
      const docName = chatLangRef.current === 'ar' ? earliest.doctorNameAr : earliest.doctorName;
      const specName = chatLangRef.current === 'ar' ? earliest.specialtyNameAr : earliest.specialtyName;
      setPendingBooking({
        doctorId: earliest.doctorId,
        doctorName: docName,
        specialtyId: earliest.specialtyId,
        specialtyName: specName,
        date: earliest.date,
        time: earliest.time,
      });
      addBotMessage(
        chatLangRef.current === 'ar'
          ? `أقرب موعد متاح: ${docName} (${specName}) يوم ${earliest.date} الساعة ${earliest.time}. اضغط عشان تحجز:`
          : `Earliest available: ${docName} (${specName}) on ${earliest.date} at ${earliest.time}. Click to book:`
      );
    } else {
      addBotMessage(
        chatLangRef.current === 'ar'
          ? 'عذراً، مفيش مواعيد متاحة حالياً.'
          : 'Sorry, no appointments available currently.'
      );
    }
  };

  const detectSpecialtyViaAI = async (complaint: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/detect-specialty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complaint }),
      });

      if (!res.ok) {
        throw new Error('API error');
      }

      const data = await res.json();
      return data.specialty || null;
    } catch (err) {
      console.error('Specialty detection error:', err);
      return null;
    }
  };

  const extractDoctorName = (text: string): string | null => {
    const lower = text.toLowerCase();
    for (const kw of DOCTOR_KEYWORDS) {
      const idx = lower.indexOf(kw);
      if (idx !== -1) {
        const after = text.substring(idx + kw.length).trim();
        if (after.length > 0) {
          const candidate = after.split(/[,،.؟?!]/)[0].trim();
          const candidateLower = candidate.toLowerCase();
          let isSpecialtyWord = false;
          for (const keywords of Object.values(SPECIALTY_KEYWORDS)) {
            if (keywords.some(sk => candidateLower.includes(sk) || sk.includes(candidateLower))) {
              isSpecialtyWord = true;
              break;
            }
          }
          for (const spec of specialties) {
            if (spec.name.toLowerCase().includes(candidateLower) || spec.nameAr.includes(candidate)) {
              isSpecialtyWord = true;
              break;
            }
          }
          if (isSpecialtyWord) return null;
          return candidate;
        }
      }
    }
    return null;
  };

  const handleDoctorSelect = (doctor: DoctorOption) => {
    setDoctorOptions([]);
    const slots = getDoctorSlotsWithFallback(doctor.id);
    const docName = chatLangRef.current === 'ar' ? doctor.nameAr : doctor.name;

    setSlotSelection({
      doctorId: doctor.id,
      doctorName: docName,
      specialtyId: doctor.specialtyId,
      slots,
    });

    setMessages(prev => [...prev,
      { role: 'user', content: chatLangRef.current === 'ar' ? `اختار ${docName}` : `Selected ${docName}` },
      {
        role: 'assistant',
        content: chatLangRef.current === 'ar'
          ? `تمام! دي المواعيد المتاحة مع ${docName}. اختار الوقت اللي يناسبك:`
          : `Great! Here are the available slots for ${docName}. Pick a time:`
      }
    ]);
  };

  const handleSlotClick = async (date: string, time: string) => {
    if (!slotSelection) return;

    const patientId = getPatientId();
    if (!patientId) {
      toast.error(chatLangRef.current === 'ar' ? 'لا يوجد مريض محدد' : 'No patient selected');
      return;
    }

    try {
      await createAppointment({
        patientId,
        doctorId: slotSelection.doctorId,
        specialtyId: slotSelection.specialtyId,
        date,
        time,
      });
      toast.success(chatLangRef.current === 'ar' ? 'تم حجز الموعد بنجاح!' : 'Appointment booked successfully!');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: chatLangRef.current === 'ar'
          ? `تم حجز موعدك بنجاح مع ${slotSelection.doctorName} يوم ${date} الساعة ${time}`
          : `Your appointment with ${slotSelection.doctorName} on ${date} at ${time} has been booked!`
      }]);
      setSlotSelection(null);
      setPendingBooking(null);
      setDoctorOptions([]);
      onBookingComplete?.();
    } catch {
      toast.error(chatLangRef.current === 'ar' ? 'هذا الموعد محجوز بالفعل' : 'This slot is already booked');
    }
  };

  const handleBookPending = async () => {
    if (!pendingBooking) return;

    const patientId = getPatientId();
    if (!patientId) {
      toast.error(chatLangRef.current === 'ar' ? 'لا يوجد مريض محدد' : 'No patient selected');
      return;
    }

    try {
      await createAppointment({
        patientId,
        doctorId: pendingBooking.doctorId,
        specialtyId: pendingBooking.specialtyId,
        date: pendingBooking.date,
        time: pendingBooking.time,
      });
      toast.success(chatLangRef.current === 'ar' ? 'تم حجز الموعد بنجاح!' : 'Appointment booked successfully!');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: chatLangRef.current === 'ar'
          ? `تم حجز موعدك بنجاح مع ${pendingBooking.doctorName} يوم ${pendingBooking.date} الساعة ${pendingBooking.time}`
          : `Your appointment with ${pendingBooking.doctorName} on ${pendingBooking.date} at ${pendingBooking.time} has been booked!`
      }]);
      setPendingBooking(null);
      setSlotSelection(null);
      setDoctorOptions([]);
      onBookingComplete?.();
    } catch {
      toast.error(chatLangRef.current === 'ar' ? 'هذا الموعد محجوز بالفعل' : 'This slot is already booked');
    }
  };

  const handleSend = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isLoading) return;

    setPendingBooking(null);
    setInput('');

    if (slotSelection) {
      const typedTime = extractTime(msg);
      if (typedTime) {
        for (const daySlot of slotSelection.slots) {
          if (daySlot.times.includes(typedTime)) {
            addUserMessage(msg);
            handleSlotClick(daySlot.date, typedTime);
            return;
          }
        }
        addUserMessage(msg);
        const freshSlots = getDoctorSlotsWithFallback(slotSelection.doctorId);
        setSlotSelection(prev => prev ? { ...prev, slots: freshSlots } : null);
        addBotMessage(
          chatLangRef.current === 'ar'
            ? `عذراً، الساعة ${typedTime} مش متاحة. اختار من المواعيد المتاحة:`
            : `Sorry, ${typedTime} is not available. Please choose from the available slots:`
        );
        return;
      }
    }

    addUserMessage(msg);

    const lower = msg.toLowerCase();

    if (EARLIEST_KEYWORDS.some(kw => lower.includes(kw))) {
      handleEarliestAppointment();
      return;
    }

    const localMatch = matchSpecialtyLocally(msg);
    if (localMatch) {
      showDoctorsForSpecialty(localMatch);
      return;
    }

    const doctorName = extractDoctorName(msg);
    if (doctorName) {
      searchDoctorByName(doctorName);
      return;
    }

    setIsLoading(true);
    try {
      const detectedSpecialty = await detectSpecialtyViaAI(msg);
      if (detectedSpecialty) {
        const spec = findSpecialtyByName(detectedSpecialty);
        if (spec) {
          showDoctorsForSpecialty(spec.name);
        } else {
          const activeSpecs = specialties.filter(s => s.isActive);
          const specList = activeSpecs.map(s => chatLangRef.current === 'ar' ? s.nameAr : s.name).join('، ');
          const detectedDisplayName = getSpecDisplayName(detectedSpecialty);
          addBotMessage(
            chatLangRef.current === 'ar'
              ? `بناءً على وصفك، التخصص المناسب هو ${detectedDisplayName} لكنه مش متاح حالياً. التخصصات المتاحة:\n${specList}`
              : `Based on your description, ${detectedDisplayName} would be appropriate but is not available. Available specialties:\n${specList}`
          );
        }
      } else {
        addBotMessage(
          chatLangRef.current === 'ar'
            ? 'عذراً، مقدرتش أحدد التخصص المناسب. ممكن تختار تخصص من القائمة أو توصف الأعراض بشكل أوضح.'
            : 'Sorry, I couldn\'t determine the right specialty. Please choose a specialty from the list or describe your symptoms more clearly.'
        );
      }
    } catch {
      addBotMessage(
        chatLangRef.current === 'ar'
          ? 'عذراً، حصل مشكلة. جرب تاني أو اختار تخصص من الخيارات السريعة.'
          : 'Sorry, something went wrong. Try again or choose from the quick options.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInput('');
    setPendingBooking(null);
    setSlotSelection(null);
    setDoctorOptions([]);
    setSelectedPatientId('');
    setPatientSearch('');
  };

  const showQuickPrompts = messages.length === 0;

  const embeddedWelcome = language === 'ar'
    ? 'أهلاً! وصّفلي الأعراض أو قولي التخصص المطلوب وهساعدك تحجز الموعد.'
    : 'Hello! Describe the symptoms or tell me the specialty you need, and I\'ll help book the appointment.';

  const floatingWelcome = language === 'ar'
    ? 'أهلاً! أنا مساعد الحجز الذكي. قولي إيه اللي محتاجه وهساعدك تحجز موعد.'
    : 'Hello! I\'m the smart booking assistant. Tell me what you need and I\'ll help you book an appointment.';

  const patientSelectionContent = (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-start gap-2 mb-3">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="bg-muted rounded-lg rounded-tl-none px-3 py-2 text-sm max-w-[280px]">
            {language === 'ar'
              ? 'أهلاً! اختار المريض الأول عشان نبدأ الحجز.'
              : 'Hello! Please select a patient first to start booking.'}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground rtl:left-auto rtl:right-3" />
          <Input
            value={patientSearch}
            onChange={e => setPatientSearch(e.target.value)}
            placeholder={language === 'ar' ? 'ابحث عن مريض...' : 'Search patient...'}
            className="pl-9 rtl:pr-9 rtl:pl-3 text-sm"
            dir={isRTL ? 'rtl' : 'ltr'}
            data-testid="input-patient-search-ai"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredPatients.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {language === 'ar' ? 'لا يوجد نتائج' : 'No patients found'}
            </p>
          ) : (
            filteredPatients.map(p => (
              <Button
                key={p.id}
                variant="ghost"
                className="w-full h-auto py-2.5 px-3 justify-start gap-3"
                onClick={() => { setSelectedPatientId(p.id); setPatientSearch(''); }}
                data-testid={`button-select-patient-ai-${p.id}`}
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="text-left rtl:text-right flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{language === 'ar' ? p.nameAr : p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.phone}</p>
                </div>
              </Button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );

  const chatContent = (
    <>
      {needsPatientSelection && selectedPatientId && (
        <div className="px-4 py-2 border-b border-border bg-muted/50 flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-medium truncate flex-1">{getSelectedPatientName()}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={() => { setSelectedPatientId(''); handleReset(); }}
            data-testid="button-change-patient-ai"
          >
            {language === 'ar' ? 'تغيير' : 'Change'}
          </Button>
        </div>
      )}
      <ScrollArea className="flex-1 px-4 py-3">
        <div className="space-y-3">
          {showQuickPrompts && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-lg rounded-tl-none px-3 py-2 text-sm max-w-[280px]">
                  {isEmbedded ? embeddedWelcome : floatingWelcome}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 pl-9">
                {QUICK_PROMPTS.map((prompt, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="h-auto py-1.5 px-2.5 text-xs whitespace-normal text-right"
                    onClick={() => handleSend(prompt)}
                    data-testid={`button-quick-prompt-${i}`}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${msg.role === 'user' ? 'bg-chart-1/10' : 'bg-primary/10'}`}>
                {msg.role === 'user' ? <User className="h-4 w-4 text-chart-1" /> : <Bot className="h-4 w-4 text-primary" />}
              </div>
              <div className={`rounded-lg px-3 py-2 text-sm max-w-[280px] whitespace-pre-wrap ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-muted rounded-tl-none'}`}>
                {msg.content}
              </div>
            </div>
          ))}

          {doctorOptions.length > 0 && (
            <div className="pl-9 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {chatLang === 'ar' ? 'اختر دكتور:' : 'Choose a doctor:'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {doctorOptions.map((doc) => (
                  <Button
                    key={doc.id}
                    variant="outline"
                    size="sm"
                    className="h-auto py-1.5 px-2.5 text-xs gap-1"
                    onClick={() => handleDoctorSelect(doc)}
                    data-testid={`button-doctor-${doc.id}`}
                  >
                    <Stethoscope className="h-3 w-3" />
                    {chatLang === 'ar' ? doc.nameAr : doc.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {pendingBooking && (
            <div className="pl-9">
              <Button
                className="w-full gap-2"
                onClick={handleBookPending}
                data-testid="button-book-pending"
              >
                <CalendarCheck className="h-4 w-4" />
                {chatLang === 'ar' ? 'احجز هذا الموعد' : 'Book This Appointment'}
              </Button>
            </div>
          )}

          {slotSelection && (
            <div className="pl-9 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {chatLang === 'ar'
                  ? `المواعيد المتاحة مع ${slotSelection.doctorName}:`
                  : `Available slots for ${slotSelection.doctorName}:`}
              </p>
              {slotSelection.slots.slice(0, 3).map((daySlot) => (
                <div key={daySlot.date} className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{daySlot.date}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {daySlot.times.map((time) => (
                      <Button
                        key={`${daySlot.date}-${time}`}
                        variant="outline"
                        size="sm"
                        className="h-auto py-1 px-2 text-xs"
                        onClick={() => handleSlotClick(daySlot.date, time)}
                        data-testid={`button-slot-${daySlot.date}-${time}`}
                      >
                        {time}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isLoading && (
            <div className="flex items-start gap-2">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted rounded-lg rounded-tl-none px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border p-3">
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={language === 'ar' ? 'اكتب رسالتك...' : 'Type your message...'}
            className="flex-1 text-sm"
            dir={isRTL ? 'rtl' : 'ltr'}
            disabled={isLoading}
            data-testid="input-chat-message"
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()} data-testid="button-send-message">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </>
  );

  if (isEmbedded) {
    return (
      <Card className="flex flex-col h-[460px] overflow-hidden" data-testid="ai-assistant-embedded">
        <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <span className="font-semibold text-sm">
              {language === 'ar' ? 'مساعد الحجز الذكي' : 'AI Booking Assistant'}
            </span>
            <Badge variant="secondary" className="text-xs bg-primary-foreground/20 text-primary-foreground">AI</Badge>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20" onClick={handleReset} data-testid="button-reset-chat">
              <MessageCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
        {chatContent}
      </Card>
    );
  }

  return (
    <>
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-auto px-4 py-3 rounded-full shadow-lg hover:shadow-xl transition-all gap-2"
          data-testid="button-open-ai-assistant"
        >
          <Bot className="h-5 w-5" />
          <span className="text-sm font-semibold">
            {language === 'ar' ? 'مساعد الحجز الذكي' : 'AI Booking Assistant'}
          </span>
        </Button>
      )}

      {isOpen && (
        <Card className="fixed bottom-6 right-6 z-50 w-[380px] h-[560px] flex flex-col shadow-2xl border-2 overflow-hidden" data-testid="ai-assistant-panel">
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <span className="font-semibold text-sm">
                {language === 'ar' ? 'مساعد الحجز الذكي' : 'AI Booking Assistant'}
              </span>
              <Badge variant="secondary" className="text-xs bg-primary-foreground/20 text-primary-foreground">AI</Badge>
            </div>
            <div className="flex gap-1">
              {(messages.length > 0 || selectedPatientId) && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20" onClick={handleReset} data-testid="button-reset-chat">
                  <MessageCircle className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20" onClick={() => { setIsOpen(false); handleReset(); }} data-testid="button-close-ai-assistant">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {needsPatientSelection && !selectedPatientId ? patientSelectionContent : chatContent}
        </Card>
      )}
    </>
  );
};

export default AIBookingAssistant;
