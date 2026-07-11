import { useState, useRef, useEffect, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useSpecialties } from '@/hooks/useSpecialties';
import { useUsers } from '@/hooks/useUsers';
import { useSchedule } from '@/hooks/useSchedule';
import { useAppointments } from '@/hooks/useVisits';
import { usePatients } from '@/hooks/usePatients';
import { userStore } from '@/stores/userStore';
import { clinicStore } from '@/stores/clinicStore';
import { specialtyStore } from '@/stores/specialtyStore';
import { getEnabledClinicVisitTypes } from '@/stores/visitTypeStore';
import { getClinicsForDoctor } from '@/stores/doctorClinicStore';
import { getAverageRating } from '@/stores/ratingStore';
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
  clinicId?: string;
  visitTypeId?: string;
  slots: { date: string; times: string[] }[];
}

interface ClinicChoice {
  id: string;      // clinic id OR 'home_visit'
  name: string;
  nameAr: string;
  address?: string;
  isHomeVisit?: boolean;
}

interface VisitTypeChoice {
  id: string;
  name: string;
  nameAr: string;
  price: number;
  durationMinutes: number;
  isUrgent: boolean;
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
  'عاوز أرخص دكتور أسنان',
  'أفضل دكتور أعصاب',
  'متاح اليوم',
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
const CHEAPEST_KEYWORDS = ['ارخص', 'أرخص', 'أقل سعر', 'أقل تكلفة', 'اقل سعر', 'cheapest', 'cheap', 'lowest price', 'affordable', 'رخيص'];
const BEST_RATED_KEYWORDS = ['أفضل', 'افضل', 'أعلى تقييم', 'اعلى تقييم', 'best', 'highest rated', 'top rated', 'تقييم'];
const TODAY_KEYWORDS = ['اليوم', 'متاح اليوم', 'today', 'available today'];
const NEAREST_KEYWORDS = ['قريب مني', 'أقرب ليا', 'اقرب ليا', 'nearest', 'closest', 'near me', 'قريب منى'];
const MEDICAL_ADVICE_KEYWORDS = ['علاج', 'دواء', 'جرعة', 'treatment', 'medicine', 'prescription', 'diagnos', 'تشخيص', 'هل مرضي', 'هل أنا', 'خطير', 'مزمن'];
const BOOKING_INTENT_KEYWORDS = [
  'احجز', 'اكشف', 'عاوز', 'عايز', 'محتاج موعد', 'موعد', 'حجز',
  'عندي وجع', 'عندي ألم', 'مريض', 'book', 'appointment', 'need doctor',
];

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

// Arabic month names → month number
const AR_MONTHS: Record<string, number> = {
  'يناير': 1, 'فبراير': 2, 'مارس': 3, 'ابريل': 4, 'أبريل': 4,
  'مايو': 5, 'يونيو': 6, 'يوليو': 7, 'أغسطس': 8, 'اغسطس': 8,
  'سبتمبر': 9, 'اكتوبر': 10, 'أكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12,
};
const EN_MONTHS: Record<string, number> = {
  'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
  'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
};

/** Extract a specific date string YYYY-MM-DD from free text (Arabic/English). */
function extractDate(text: string): string | null {
  const currentYear = new Date().getFullYear();

  // Pattern 1: DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY (numbers only)
  const numericMatch = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (numericMatch) {
    const [, d, m, y] = numericMatch;
    const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
    const month = parseInt(m);
    const day = parseInt(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Pattern 2: "يوم DD شهر YYYY" or "DD monthName YYYY"
  const lower = text.toLowerCase();
  for (const [name, monthNum] of Object.entries({ ...AR_MONTHS, ...EN_MONTHS })) {
    const monthPattern = new RegExp(`(\\d{1,2})\\s*${name}\\s*(\\d{2,4})?`, 'i');
    const match = text.match(monthPattern) || lower.match(monthPattern);
    if (match) {
      const day = parseInt(match[1]);
      const year = match[2] ? (match[2].length === 2 ? 2000 + parseInt(match[2]) : parseInt(match[2])) : currentYear;
      return `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Pattern 3: "YYYY-MM-DD" already formatted
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];

  return null;
}

interface AIBookingAssistantProps {
  mode?: 'floating' | 'embedded';
  patientId?: string;
  initialDoctorId?: string;
  initialClinicId?: string;
  onBookingComplete?: () => void;
}

const AIBookingAssistant = ({ mode = 'floating', patientId: externalPatientId, initialDoctorId, initialClinicId, onBookingComplete }: AIBookingAssistantProps) => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { specialties } = useSpecialties();
  const { activeDoctors, getDoctorsBySpecialty } = useUsers();
  const { getAvailableSlots, getDoctorWorkingDays } = useSchedule();
  const { createAppointment } = useAppointments();
  const { patients } = usePatients();

  const isEmbedded = mode === 'embedded';
  const isStaffUser = user?.role === 'admin' || user?.role === 'reception' || user?.role === 'doctor';
  const isPatientUser = user?.role === 'patient';

  // Resolve context from props (doctor page / clinic page)
  const contextDoctor = useMemo(() => initialDoctorId ? userStore.get(u => u.id === initialDoctorId && u.role === 'doctor') : undefined, [initialDoctorId]);
  const contextClinic = useMemo(() => initialClinicId ? clinicStore.get(c => c.id === initialClinicId) : undefined, [initialClinicId]);
  const contextDoctorSpecialty = useMemo(() => contextDoctor?.specialtyId ? specialtyStore.get(s => s.id === contextDoctor.specialtyId) : undefined, [contextDoctor]);

  // If patient is already known (logged-in patient OR externalPatientId), no patient search needed
  const patientAlreadyKnown = !!externalPatientId || isPatientUser;
  // Staff inside clinic management need to search; staff/visitors on public pages don't staff-search
  const needsPatientSelection = !isEmbedded && isStaffUser && !externalPatientId && !initialDoctorId && !initialClinicId;

  const [isOpen, setIsOpen] = useState(isEmbedded);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingBooking, setPendingBooking] = useState<PendingBooking | null>(null);
  const [slotSelection, setSlotSelection] = useState<SlotSelection | null>(null);
  const [doctorOptions, setDoctorOptions] = useState<DoctorOption[]>([]);
  const [clinicChoices, setClinicChoices] = useState<ClinicChoice[]>([]);
  const [visitTypeChoices, setVisitTypeChoices] = useState<VisitTypeChoice[]>([]);
  const [pendingDoctorOption, setPendingDoctorOption] = useState<DoctorOption | null>(null);
  const [pendingClinicId, setPendingClinicId] = useState<string>('');
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [patientSearch, setPatientSearch] = useState('');
  const [chatLang, setChatLang] = useState<'ar' | 'en'>(language === 'ar' ? 'ar' : 'en');
  const chatLangRef = useRef(chatLang);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredPatients = patients.filter(p => {
    if (!patientSearch.trim()) return true;
    const q = patientSearch.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(q) ||
      p.nameAr.includes(patientSearch.trim()) ||
      p.phone.includes(q) ||
      (p.nationalId && p.nationalId.includes(q))
    );
  });

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, pendingBooking, slotSelection, doctorOptions]);

  // Drop-off recovery: nudge user if they go idle mid-flow
  useEffect(() => {
    if (dropOffRef.current) clearTimeout(dropOffRef.current);
    if (messages.length > 0 && (slotSelection || doctorOptions.length > 0)) {
      dropOffRef.current = setTimeout(() => {
        const isAr = chatLangRef.current === 'ar';
        if (slotSelection) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: isAr
              ? `لسه هنا؟ 😊 المواعيد مع ${slotSelection.doctorName} لسه متاحة — اضغط على أي وقت للحجز فوراً.`
              : `Still there? 😊 Slots with ${slotSelection.doctorName} are still available — tap any time to book instantly.`,
          }]);
        } else if (doctorOptions.length > 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: isAr
              ? 'لسه هنا؟ اختار دكتور من القائمة عشان أعرضلك المواعيد المتاحة.'
              : 'Still there? Choose a doctor from the list to see available slots.',
          }]);
        }
      }, 90_000);
    }
    return () => { if (dropOffRef.current) clearTimeout(dropOffRef.current); };
  }, [messages.length, slotSelection, doctorOptions.length]);

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
      performDoctorFlow({ id: doc.id, name: doc.name, nameAr: doc.nameAr, specialtyId: doc.specialtyId || '' });
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

  // ── Core clinic/visit-type flow (shared by button-click and name-search) ──
  const performDoctorFlow = (doctor: DoctorOption) => {
    const fullDoctor = userStore.get(u => u.id === doctor.id);
    const clinicIds = getClinicsForDoctor(doctor.id);
    const hasHomeVisit = !!(fullDoctor?.homeVisitEnabled);
    const docName = chatLangRef.current === 'ar' ? doctor.nameAr : doctor.name;

    const choices: ClinicChoice[] = clinicIds.map(cid => {
      const c = clinicStore.get(cl => cl.id === cid);
      return {
        id: cid,
        name: c?.name || cid,
        nameAr: c?.nameAr || c?.name || cid,
        address: chatLangRef.current === 'ar' ? (c?.addressAr || c?.address) : c?.address,
      };
    });
    if (hasHomeVisit) {
      choices.push({ id: 'home_visit', name: 'Home Visit', nameAr: 'زيارة منزلية', isHomeVisit: true });
    }

    setPendingDoctorOption(doctor);

    if (choices.length === 0) {
      // Not linked to any clinic — go straight to slots
      proceedToSlots(doctor, '', undefined);
    } else if (choices.length === 1 && !hasHomeVisit) {
      // Single clinic, no home visit → skip straight to visit types
      addBotMessage(chatLangRef.current === 'ar'
        ? `ممتاز! تم اختيار ${docName}. الآن اختر نوع الكشف:`
        : `Great! Selected ${docName}. Now choose the visit type:`);
      handleClinicSelect(choices[0].id, doctor);
    } else {
      // Multiple clinics or home visit → ask which
      setClinicChoices(choices);
      addBotMessage(chatLangRef.current === 'ar'
        ? `${docName} متاح في أكتر من مكان. اختار:`
        : `${docName} is available in multiple locations. Choose:`);
    }
  };

  // ── Step 1: doctor selected via button ───────────────────────────────
  const handleDoctorSelect = (doctor: DoctorOption) => {
    setDoctorOptions([]);
    const docName = chatLangRef.current === 'ar' ? doctor.nameAr : doctor.name;
    setMessages(prev => [...prev,
      { role: 'user', content: chatLangRef.current === 'ar' ? `اختار ${docName}` : `Selected ${docName}` },
    ]);
    performDoctorFlow(doctor);
  };

  // ── Step 2: clinic selected → show visit types ────────────────────────
  const handleClinicSelect = (clinicId: string, doctorOverride?: DoctorOption) => {
    const doctor = doctorOverride || pendingDoctorOption;
    if (!doctor) return;
    setClinicChoices([]);
    setPendingClinicId(clinicId);

    if (clinicId !== 'home_visit') {
      const vts = getEnabledClinicVisitTypes(clinicId);
      if (vts.length > 0) {
        setVisitTypeChoices(vts.map(vt => ({
          id: vt.id, name: vt.name, nameAr: vt.nameAr,
          price: vt.price, durationMinutes: vt.durationMinutes, isUrgent: vt.isUrgent,
        })));
        addBotMessage(chatLangRef.current === 'ar' ? 'اختر نوع الكشف:' : 'Choose visit type:');
        return;
      }
    }
    // No visit types or home visit → go directly to slots
    proceedToSlots(doctor, clinicId, undefined);
  };

  // ── Step 3: visit type selected → show slots ──────────────────────────
  const handleVisitTypeSelect = (vtId: string) => {
    const doctor = pendingDoctorOption;
    if (!doctor) return;
    setVisitTypeChoices([]);
    proceedToSlots(doctor, pendingClinicId, vtId);
  };

  const proceedToSlots = (doctor: DoctorOption, clinicId: string, visitTypeId: string | undefined) => {
    const docName = chatLangRef.current === 'ar' ? doctor.nameAr : doctor.name;
    const slots = getDoctorSlotsWithFallback(doctor.id);
    setSlotSelection({ doctorId: doctor.id, doctorName: docName, specialtyId: doctor.specialtyId, clinicId: clinicId || undefined, visitTypeId, slots });
    addBotMessage(chatLangRef.current === 'ar'
      ? `تمام! دي المواعيد المتاحة مع ${docName}. اختار الوقت اللي يناسبك:`
      : `Here are the available slots for ${docName}. Pick a time:`
    );
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
        clinicId: slotSelection.clinicId || undefined,
        visitTypeId: slotSelection.visitTypeId || undefined,
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

  // ── Helper: get minimum consultation price for a doctor ─────────────
  const getDoctorMinPrice = (doctorId: string): number | null => {
    const clinics = getClinicsForDoctor(doctorId);
    let min: number | null = null;
    for (const clinicId of clinics) {
      const vts = getEnabledClinicVisitTypes(clinicId);
      for (const vt of vts) {
        if (!vt.isUrgent && (min === null || vt.price < min)) min = vt.price;
      }
    }
    return min;
  };

  const handleCheapestDoctor = (specName: string | null) => {
    const spec = specName ? findSpecialtyByName(specName) : null;
    const candidates = spec
      ? getDoctorsBySpecialty(spec.id)
      : activeDoctors;
    if (candidates.length === 0) {
      addBotMessage(chatLangRef.current === 'ar' ? 'لا يوجد أطباء متاحين.' : 'No doctors available.');
      return;
    }
    const withPrices = candidates
      .map(d => ({ doc: d, price: getDoctorMinPrice(d.id) }))
      .filter(x => x.price !== null)
      .sort((a, b) => (a.price as number) - (b.price as number));
    if (withPrices.length === 0) {
      addBotMessage(chatLangRef.current === 'ar' ? 'لا تتوفر معلومات أسعار لهذا التخصص.' : 'No pricing info available for this specialty.');
      return;
    }
    const top = withPrices.slice(0, 3);
    const lines = top.map(x => {
      const name = chatLangRef.current === 'ar' ? x.doc.nameAr : x.doc.name;
      return `• ${name} — ${x.price} ج.م`;
    }).join('\n');
    const specLabel = spec ? (chatLangRef.current === 'ar' ? spec.nameAr : spec.name) : (chatLangRef.current === 'ar' ? 'جميع التخصصات' : 'all specialties');
    addBotMessage(chatLangRef.current === 'ar'
      ? `أرخص الأطباء في ${specLabel}:\n${lines}\n\nاختار طبيباً للحجز:`
      : `Cheapest doctors in ${specLabel}:\n${lines}\n\nChoose a doctor to book:`
    );
    setDoctorOptions(top.map(x => ({ id: x.doc.id, name: x.doc.name, nameAr: x.doc.nameAr, specialtyId: x.doc.specialtyId || '' })));
  };

  const handleBestRatedDoctor = (specName: string | null) => {
    const spec = specName ? findSpecialtyByName(specName) : null;
    const candidates = spec ? getDoctorsBySpecialty(spec.id) : activeDoctors;
    if (candidates.length === 0) {
      addBotMessage(chatLangRef.current === 'ar' ? 'لا يوجد أطباء متاحين.' : 'No doctors available.');
      return;
    }
    const withRatings = candidates
      .map(d => { const r = getAverageRating(d.id, 'doctor'); return { doc: d, avg: r.avg, count: r.count }; })
      .filter(x => x.count > 0)
      .sort((a, b) => b.avg - a.avg || b.count - a.count);
    const top = withRatings.length > 0 ? withRatings.slice(0, 3) : candidates.slice(0, 3).map(d => ({ doc: d, avg: 0, count: 0 }));
    const specLabel = spec ? (chatLangRef.current === 'ar' ? spec.nameAr : spec.name) : (chatLangRef.current === 'ar' ? 'جميع التخصصات' : 'all specialties');
    const lines = top.map(x => {
      const name = chatLangRef.current === 'ar' ? x.doc.nameAr : x.doc.name;
      return x.avg > 0 ? `• ${name} ⭐ ${x.avg.toFixed(1)} (${x.count})` : `• ${name}`;
    }).join('\n');
    addBotMessage(chatLangRef.current === 'ar'
      ? `أعلى الأطباء تقييماً في ${specLabel}:\n${lines}\n\nاختار طبيباً للحجز:`
      : `Top-rated doctors in ${specLabel}:\n${lines}\n\nChoose a doctor to book:`
    );
    setDoctorOptions(top.map(x => ({ id: x.doc.id, name: x.doc.name, nameAr: x.doc.nameAr, specialtyId: x.doc.specialtyId || '' })));
  };

  const handleAvailableToday = (specName: string | null) => {
    const today = new Date().toISOString().split('T')[0];
    const spec = specName ? findSpecialtyByName(specName) : null;
    const candidates = spec ? getDoctorsBySpecialty(spec.id) : activeDoctors;
    const available = candidates.filter(d => getAvailableSlots(d.id, today).length > 0);
    if (available.length === 0) {
      addBotMessage(chatLangRef.current === 'ar' ? 'لا توجد مواعيد متاحة اليوم.' : 'No appointments available today.');
      return;
    }
    const specLabel = spec ? (chatLangRef.current === 'ar' ? spec.nameAr : spec.name) : '';
    addBotMessage(chatLangRef.current === 'ar'
      ? `الأطباء المتاحين اليوم${specLabel ? ' في ' + specLabel : ''}:\nاختار طبيباً للحجز:`
      : `Doctors available today${specLabel ? ' in ' + specLabel : ''}:\nChoose a doctor to book:`
    );
    setDoctorOptions(available.slice(0, 5).map(d => ({ id: d.id, name: d.name, nameAr: d.nameAr, specialtyId: d.specialtyId || '' })));
  };

  const handleNearestDoctor = (specName: string | null) => {
    const spec = specName ? findSpecialtyByName(specName) : null;
    const candidates = spec ? getDoctorsBySpecialty(spec.id) : activeDoctors;
    // Try to use user's city if patient is logged in
    const userCity = (user as any)?.city || '';
    const withClinics = candidates.map(d => {
      const clinicIds = getClinicsForDoctor(d.id);
      const clinics = clinicIds.map(cid => clinicStore.get(c => c.id === cid)).filter(Boolean);
      const cityMatch = userCity ? clinics.some(c => c!.city?.toLowerCase() === userCity.toLowerCase() || c!.cityAr === userCity) : false;
      return { doc: d, clinics, cityMatch };
    });
    const sorted = [...withClinics].sort((a, b) => (b.cityMatch ? 1 : 0) - (a.cityMatch ? 1 : 0));
    const top = sorted.slice(0, 4);
    const specLabel = spec ? (chatLangRef.current === 'ar' ? spec.nameAr : spec.name) : (chatLangRef.current === 'ar' ? 'جميع التخصصات' : 'all specialties');
    const lines = top.map(x => {
      const name = chatLangRef.current === 'ar' ? x.doc.nameAr : x.doc.name;
      const city = x.clinics[0] ? (chatLangRef.current === 'ar' ? x.clinics[0]!.cityAr || x.clinics[0]!.city : x.clinics[0]!.city) : '';
      return city ? `• ${name} — ${city}` : `• ${name}`;
    }).join('\n');
    addBotMessage(chatLangRef.current === 'ar'
      ? `أطباء ${specLabel}:\n${lines}\n\nاختار طبيباً للحجز:`
      : `Doctors in ${specLabel}:\n${lines}\n\nChoose a doctor to book:`
    );
    setDoctorOptions(top.map(x => ({ id: x.doc.id, name: x.doc.name, nameAr: x.doc.nameAr, specialtyId: x.doc.specialtyId || '' })));
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

    // ── Block medical advice requests ────────────────────────────────────
    if (MEDICAL_ADVICE_KEYWORDS.some(kw => lower.includes(kw))) {
      addBotMessage(chatLangRef.current === 'ar'
        ? 'أنا مساعد حجز فقط ولا أستطيع تقديم استشارات طبية. للحصول على تشخيص أو علاج، يرجى الحجز مع طبيب مختص.'
        : 'I\'m a booking assistant only and cannot provide medical advice. Please book with a specialist for diagnosis or treatment.'
      );
      return;
    }

    // ── Smart booking queries (cheapest / best rated / today / nearest) ──
    const specInMsg = matchSpecialtyLocally(msg);
    if (CHEAPEST_KEYWORDS.some(kw => lower.includes(kw))) {
      handleCheapestDoctor(specInMsg);
      return;
    }
    if (BEST_RATED_KEYWORDS.some(kw => lower.includes(kw))) {
      handleBestRatedDoctor(specInMsg);
      return;
    }
    if (TODAY_KEYWORDS.some(kw => lower.includes(kw))) {
      handleAvailableToday(specInMsg);
      return;
    }
    if (NEAREST_KEYWORDS.some(kw => lower.includes(kw))) {
      handleNearestDoctor(specInMsg);
      return;
    }

    // ── Specific date request: "يوم 17-4-2026" or "17 أبريل" ────────────
    const requestedDate = extractDate(msg);
    if (requestedDate) {
      // If we already have a selected doctor (context or slot), show slots for that date
      const targetDoctorId = slotSelection?.doctorId || contextDoctor?.id;
      if (targetDoctorId) {
        const slots = getAvailableSlots(targetDoctorId, requestedDate);
        const docNameForDate = slotSelection?.doctorName
          || (chatLangRef.current === 'ar' ? (contextDoctor?.nameAr || contextDoctor?.name) : contextDoctor?.name)
          || '';
        if (slots.length > 0) {
          setSlotSelection(prev => prev
            ? { ...prev, slots: [{ date: requestedDate, times: slots }] }
            : { doctorId: targetDoctorId, doctorName: docNameForDate, specialtyId: contextDoctorSpecialty?.id || '', slots: [{ date: requestedDate, times: slots }] }
          );
          addBotMessage(
            chatLangRef.current === 'ar'
              ? `المواعيد المتاحة مع ${docNameForDate} يوم ${requestedDate}:`
              : `Available slots with ${docNameForDate} on ${requestedDate}:`
          );
        } else {
          addBotMessage(
            chatLangRef.current === 'ar'
              ? `عذراً، لا توجد مواعيد متاحة مع ${docNameForDate} يوم ${requestedDate}. اختار يوم آخر أو اطلب أقرب موعد.`
              : `Sorry, no slots available with ${docNameForDate} on ${requestedDate}. Try another date or ask for the earliest available.`
          );
        }
      } else {
        // No doctor in context — find any doctor with slots on that date
        const found: { doctorId: string; doctorName: string; specialtyId: string; times: string[] }[] = [];
        for (const doc of activeDoctors) {
          const slots = getAvailableSlots(doc.id, requestedDate);
          if (slots.length > 0) {
            found.push({
              doctorId: doc.id,
              doctorName: chatLangRef.current === 'ar' ? doc.nameAr : doc.name,
              specialtyId: doc.specialtyId || '',
              times: slots,
            });
          }
        }
        if (found.length === 0) {
          addBotMessage(
            chatLangRef.current === 'ar'
              ? `عذراً، لا توجد مواعيد متاحة يوم ${requestedDate}. اطلب أقرب موعد أو اختار تخصص.`
              : `Sorry, no appointments available on ${requestedDate}. Ask for the earliest or choose a specialty.`
          );
        } else {
          // Show first doctor's slots, offer others as buttons
          const first = found[0];
          setSlotSelection({ doctorId: first.doctorId, doctorName: first.doctorName, specialtyId: first.specialtyId, slots: [{ date: requestedDate, times: first.times }] });
          if (found.length > 1) {
            setDoctorOptions(found.map(f => ({ id: f.doctorId, name: f.doctorName, nameAr: f.doctorName, specialtyId: f.specialtyId })));
          }
          addBotMessage(
            chatLangRef.current === 'ar'
              ? `المواعيد المتاحة يوم ${requestedDate}:`
              : `Available appointments on ${requestedDate}:`
          );
        }
      }
      return;
    }

    // ── Doctor-context: check if symptoms match this doctor's specialty ──
    if (contextDoctor && contextDoctorSpecialty) {
      const localMatch = matchSpecialtyLocally(msg);
      const docSpecName = contextDoctorSpecialty.name;
      const docSpecNameAr = contextDoctorSpecialty.nameAr;
      const docName = chatLangRef.current === 'ar' ? (contextDoctor.nameAr || contextDoctor.name) : contextDoctor.name;

      const isMatch = !localMatch
        || localMatch.toLowerCase() === docSpecName.toLowerCase()
        || docSpecName.toLowerCase().includes(localMatch.toLowerCase())
        || localMatch.toLowerCase().includes(docSpecName.toLowerCase().split(' ')[0]);

      if (!isMatch) {
        const matchedNameAr = SPECIALTY_NAMES_AR[localMatch] || localMatch;
        addBotMessage(
          chatLangRef.current === 'ar'
            ? `الأعراض اللي ذكرتها تشير إلى تخصص ${matchedNameAr}، بينما ${docName} متخصص في ${docSpecNameAr}. هل تريد المتابعة مع ${docName} على أي حال، أم تبحث عن طبيب ${matchedNameAr}؟`
            : `Your symptoms suggest ${localMatch}, while ${docName} specializes in ${docSpecName}. Would you like to continue booking with ${docName} anyway, or find a ${localMatch} specialist?`
        );
        // Offer to proceed anyway
        const slots = getDoctorSlotsWithFallback(contextDoctor.id);
        setSlotSelection({ doctorId: contextDoctor.id, doctorName: docName, specialtyId: contextDoctorSpecialty.id, slots });
        return;
      }

      // Symptoms match → go straight to slots for this doctor
      const slots = getDoctorSlotsWithFallback(contextDoctor.id);
      setSlotSelection({ doctorId: contextDoctor.id, doctorName: docName, specialtyId: contextDoctorSpecialty.id, slots });
      addBotMessage(
        chatLangRef.current === 'ar'
          ? `ممتاز! أعراضك تناسب تخصص ${docSpecNameAr}. دي المواعيد المتاحة مع ${docName}:`
          : `Great! Your symptoms match ${docSpecName}. Here are the available slots with ${docName}:`
      );
      return;
    }

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

    // ── Booking intent detected but no specialty/doctor found locally ──
    // Instead of an open-ended AI fallback, ask for specialty immediately.
    if (BOOKING_INTENT_KEYWORDS.some(kw => lower.includes(kw))) {
      const activeSpecs = specialties.filter(s => s.isActive);
      if (activeSpecs.length > 0) {
        const specList = activeSpecs.slice(0, 8).map(s => chatLangRef.current === 'ar' ? s.nameAr : s.name).join('، ');
        addBotMessage(chatLangRef.current === 'ar'
          ? `تمام! هساعدك تحجز موعد.\n\nقولي عندك شكوى إيه أو اختار تخصص:\n${specList}`
          : `Sure! I'll help you book an appointment.\n\nDescribe your complaint or pick a specialty:\n${specList}`
        );
        return;
      }
    }

    setIsLoading(true);
    try {
      // Try specialty detection first (cheapest AI call)
      const detectedSpecialty = await detectSpecialtyViaAI(msg);
      if (detectedSpecialty) {
        const spec = findSpecialtyByName(detectedSpecialty);
        if (spec) {
          showDoctorsForSpecialty(spec.name);
        } else {
          const activeSpecs = specialties.filter(s => s.isActive);
          const specList = activeSpecs.map(s => chatLangRef.current === 'ar' ? s.nameAr : s.name).join('، ');
          addBotMessage(
            chatLangRef.current === 'ar'
              ? `بناءً على وصفك، التخصص المناسب هو ${getSpecDisplayName(detectedSpecialty)} لكنه مش متاح حالياً.\nالتخصصات المتاحة: ${specList}`
              : `Based on your description, ${getSpecDisplayName(detectedSpecialty)} would be appropriate but is not available.\nAvailable: ${specList}`
          );
        }
      } else {
        // General booking query — answer with booking-context only
        const isAr = chatLangRef.current === 'ar';
        const specList = specialties.filter(s => s.isActive).map(s => isAr ? s.nameAr : s.name).join('، ');
        const systemPrompt = `You are a medical booking assistant on a clinic platform.
You help patients ONLY with booking questions: scheduling, specialties, availability, pricing, finding doctors.
STRICTLY FORBIDDEN: any medical diagnosis, treatment advice, drug information, or health guidance.
If asked for medical advice, redirect to booking a doctor.
Available specialties: ${specList || 'General Medicine'}.
Answer in ${isAr ? 'Arabic' : 'English'} in 1-2 short sentences. Focus on booking guidance only.`;
        const res = await fetch('/api/doctor-suitability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symptoms: msg, doctorName: 'booking assistant', doctorSpecialty: 'booking', _systemOverride: systemPrompt }),
        });
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) {
          const data = await res.json();
          addBotMessage(data.message || (isAr ? 'كيف يمكنني مساعدتك في الحجز؟' : 'How can I help you with booking?'));
        } else {
          addBotMessage(isAr
            ? 'يمكنني مساعدتك في: حجز موعد، إيجاد دكتور في تخصص معين، البحث عن أرخص أو أفضل دكتور، أو مواعيد متاحة اليوم.'
            : 'I can help with: booking an appointment, finding a specialist, searching for cheapest or best-rated doctors, or today\'s availability.'
          );
        }
      }
    } catch {
      addBotMessage(
        chatLangRef.current === 'ar'
          ? 'يمكنني مساعدتك في: حجز موعد، إيجاد دكتور بتخصص معين، أرخص دكتور، أفضل تقييماً، أو المتاح اليوم.'
          : 'I can help with: booking, finding a specialist, cheapest doctor, best rated, or available today.'
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
    setClinicChoices([]);
    setVisitTypeChoices([]);
    setPendingDoctorOption(null);
    setPendingClinicId('');
    setSelectedPatientId('');
    setPatientSearch('');
  };

  const showQuickPrompts = messages.length === 0;

  const patientGreeting = isPatientUser
    ? (language === 'ar' ? `أهلاً ${user?.nameAr || user?.name || ''}! ` : `Hello ${user?.name || ''}! `)
    : '';

  const doctorContext = contextDoctor
    ? (language === 'ar'
        ? `تريد الحجز مع ${contextDoctor.nameAr || contextDoctor.name}${contextDoctorSpecialty ? ` (${contextDoctorSpecialty.nameAr})` : ''}. `
        : `You're booking with ${contextDoctor.name}${contextDoctorSpecialty ? ` (${contextDoctorSpecialty.name})` : ''}. `)
    : '';

  const clinicContext = contextClinic
    ? (language === 'ar'
        ? `تريد الحجز في ${contextClinic.nameAr || contextClinic.name}. `
        : `You're booking at ${contextClinic.name}. `)
    : '';

  const embeddedWelcome = language === 'ar'
    ? `${patientGreeting}${doctorContext}${clinicContext}وصّفلي الأعراض أو قولي التخصص المطلوب وهساعدك تحجز الموعد.`
    : `${patientGreeting}${doctorContext}${clinicContext}Describe the symptoms or tell me the specialty you need, and I'll help book the appointment.`;

  const floatingWelcome = language === 'ar'
    ? `${patientGreeting}${doctorContext}${clinicContext}أنا مساعد الحجز الذكي. قولي إيه اللي محتاجه وهساعدك تحجز موعد.`
    : `${patientGreeting}${doctorContext}${clinicContext}I'm the smart booking assistant. Tell me what you need and I'll help you book an appointment.`;

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
            placeholder={language === 'ar' ? 'ابحث بالاسم أو رقم القيد...' : 'Search by name or ID...'}
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

          {clinicChoices.length > 0 && (
            <div className="pl-9 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {chatLang === 'ar' ? 'اختر المكان:' : 'Choose location:'}
              </p>
              <div className="flex flex-col gap-1.5">
                {clinicChoices.map((c) => (
                  <Button
                    key={c.id}
                    variant="outline"
                    size="sm"
                    className={`h-auto py-2 px-3 text-xs justify-start gap-2 ${c.isHomeVisit ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50' : ''}`}
                    onClick={() => handleClinicSelect(c.id)}
                    data-testid={`button-clinic-choice-${c.id}`}
                  >
                    <span className="text-base">{c.isHomeVisit ? '🏠' : '🏥'}</span>
                    <div className="text-left rtl:text-right">
                      <span className="font-medium block">{chatLang === 'ar' ? c.nameAr : c.name}</span>
                      {c.address && <span className="text-muted-foreground">{c.address}</span>}
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {visitTypeChoices.length > 0 && (
            <div className="pl-9 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {chatLang === 'ar' ? 'اختر نوع الكشف:' : 'Choose visit type:'}
              </p>
              <div className="flex flex-col gap-1.5">
                {visitTypeChoices.map((vt) => (
                  <Button
                    key={vt.id}
                    variant="outline"
                    size="sm"
                    className={`h-auto py-2 px-3 text-xs justify-start gap-2 ${vt.isUrgent ? 'border-destructive/40 text-destructive' : ''}`}
                    onClick={() => handleVisitTypeSelect(vt.id)}
                    data-testid={`button-visit-type-choice-${vt.id}`}
                  >
                    <span className="text-base">{vt.isUrgent ? '🚨' : '📋'}</span>
                    <div className="text-left rtl:text-right">
                      <span className="font-medium block">{chatLang === 'ar' ? vt.nameAr : vt.name}</span>
                      <span className="text-muted-foreground">{vt.price} ج.م · {vt.durationMinutes} {chatLang === 'ar' ? 'دقيقة' : 'min'}</span>
                    </div>
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
          className="fixed bottom-6 z-50 h-auto px-4 py-3 rounded-full shadow-lg hover:shadow-xl transition-all gap-2"
          style={language === 'ar' ? { left: '1.5rem' } : { right: '1.5rem' }}
          data-testid="button-open-ai-assistant"
        >
          <Bot className="h-5 w-5" />
          <span className="text-sm font-semibold">
            {language === 'ar' ? 'مساعد الحجز الذكي' : 'AI Booking Assistant'}
          </span>
        </Button>
      )}

      {isOpen && (
        <Card
          className="fixed bottom-6 z-50 w-[380px] h-[560px] flex flex-col shadow-2xl border-2 overflow-hidden"
          style={language === 'ar' ? { left: '1.5rem' } : { right: '1.5rem' }}
          data-testid="ai-assistant-panel"
        >
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
