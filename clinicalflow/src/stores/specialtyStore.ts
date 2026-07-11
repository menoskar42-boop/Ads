import { Specialty, Service, FormField } from '@/types';
import { createStore } from './createStore';

// ── شema مشترك لكل التخصصات ─────────────────────────────────────────────────
const BASE_SCHEMA: FormField[] = [
  { key: 'chief_complaint', label: 'Chief Complaint',  labelAr: 'الشكوى الرئيسية', type: 'textarea', required: true  },
  { key: 'diagnosis',       label: 'Diagnosis',        labelAr: 'التشخيص',          type: 'textarea', required: true  },
  { key: 'prescription',    label: 'Prescription',     labelAr: 'الوصفة الطبية',    type: 'textarea', required: false },
];

const BP_FIELD:   FormField = { key: 'blood_pressure', label: 'Blood Pressure',    labelAr: 'ضغط الدم',             type: 'text',   required: false };
const TEMP_FIELD: FormField = { key: 'temperature',    label: 'Temperature (°C)',  labelAr: 'درجة الحرارة',         type: 'number', required: false };
const WEIGHT_FIELD: FormField = { key: 'weight',       label: 'Weight (kg)',       labelAr: 'الوزن (كغ)',            type: 'number', required: false };

// ── 47 تخصص طبي مصري ─────────────────────────────────────────────────────────
const mockSpecialties: Specialty[] = [
  // ─── 1 ───
  { id: 'sp-1',  name: 'General Medicine',            nameAr: 'طب عام',                        isActive: false, formSchema: [BASE_SCHEMA[0], BP_FIELD, TEMP_FIELD, BASE_SCHEMA[1], BASE_SCHEMA[2]] },
  // ─── 2 ───
  { id: 'sp-2',  name: 'Pediatrics',                  nameAr: 'طب الأطفال',                    isActive: false, formSchema: [BASE_SCHEMA[0], WEIGHT_FIELD, { key: 'height', label: 'Height (cm)', labelAr: 'الطول (سم)', type: 'number', required: false }, BASE_SCHEMA[1], BASE_SCHEMA[2]] },
  // ─── 3 ───
  { id: 'sp-3',  name: 'Cardiology',                  nameAr: 'أمراض القلب والأوعية الدموية', isActive: false, formSchema: [BASE_SCHEMA[0], BP_FIELD, { key: 'heart_rate', label: 'Heart Rate (bpm)', labelAr: 'معدل ضربات القلب', type: 'number', required: false }, BASE_SCHEMA[1], BASE_SCHEMA[2]] },
  // ─── 4 ───
  { id: 'sp-4',  name: 'Dermatology',                 nameAr: 'الأمراض الجلدية والتناسلية',   isActive: false, formSchema: [BASE_SCHEMA[0], { key: 'affected_area', label: 'Affected Area', labelAr: 'المنطقة المصابة', type: 'text', required: false }, BASE_SCHEMA[1], BASE_SCHEMA[2]] },
  // ─── 5 ───
  { id: 'sp-5',  name: 'Orthopedics',                 nameAr: 'جراحة العظام والمفاصل',        isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 6 ───
  { id: 'sp-6',  name: 'Ophthalmology',               nameAr: 'طب وجراحة العيون',             isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 7 ───
  { id: 'sp-7',  name: 'ENT',                         nameAr: 'أنف وأذن وحنجرة',              isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 8 ───
  { id: 'sp-8',  name: 'Obstetrics & Gynecology',     nameAr: 'أمراض النساء والتوليد',        isActive: false, formSchema: [BASE_SCHEMA[0], { key: 'lmp', label: 'Last Menstrual Period', labelAr: 'آخر دورة شهرية', type: 'text', required: false }, BASE_SCHEMA[1], BASE_SCHEMA[2]] },
  // ─── 9 ───
  { id: 'sp-9',  name: 'Urology',                     nameAr: 'المسالك البولية والتناسلية',   isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 10 ───
  { id: 'sp-10', name: 'Neurology',                   nameAr: 'أمراض المخ والأعصاب',          isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 11 ───
  { id: 'sp-11', name: 'Neurosurgery',                nameAr: 'جراحة المخ والأعصاب',          isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 12 ───
  { id: 'sp-12', name: 'General Surgery',             nameAr: 'الجراحة العامة',               isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 13 ───
  { id: 'sp-13', name: 'Plastic Surgery',             nameAr: 'الجراحة التجميلية وإعادة التأهيل', isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 14 ───
  { id: 'sp-14', name: 'Gastroenterology',            nameAr: 'أمراض الجهاز الهضمي والكبد',  isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 15 ───
  { id: 'sp-15', name: 'Hepatology',                  nameAr: 'أمراض الكبد والجهاز الهضمي',  isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 16 ───
  { id: 'sp-16', name: 'Pulmonology',                 nameAr: 'أمراض الصدر والجهاز التنفسي', isActive: false, formSchema: [BASE_SCHEMA[0], { key: 'oxygen_saturation', label: 'O2 Saturation (%)', labelAr: 'نسبة الأكسجين', type: 'number', required: false }, BASE_SCHEMA[1], BASE_SCHEMA[2]] },
  // ─── 17 ───
  { id: 'sp-17', name: 'Endocrinology',               nameAr: 'أمراض الغدد الصماء والسكر',   isActive: false, formSchema: [BASE_SCHEMA[0], { key: 'blood_sugar', label: 'Blood Sugar (mg/dL)', labelAr: 'سكر الدم', type: 'number', required: false }, BASE_SCHEMA[1], BASE_SCHEMA[2]] },
  // ─── 18 ───
  { id: 'sp-18', name: 'Nephrology',                  nameAr: 'أمراض الكلى',                  isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 19 ───
  { id: 'sp-19', name: 'Hematology',                  nameAr: 'أمراض الدم',                   isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 20 ───
  { id: 'sp-20', name: 'Oncology',                    nameAr: 'أورام',                         isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 21 ───
  { id: 'sp-21', name: 'Radiation Oncology',          nameAr: 'الأورام والعلاج الإشعاعي',    isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 22 ───
  { id: 'sp-22', name: 'Rheumatology',                nameAr: 'أمراض الروماتيزم',             isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 23 ───
  { id: 'sp-23', name: 'Immunology & Allergy',        nameAr: 'المناعة والحساسية',            isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 24 ───
  { id: 'sp-24', name: 'Psychiatry',                  nameAr: 'الطب النفسي',                  isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 25 ───
  { id: 'sp-25', name: 'Dentistry',                   nameAr: 'طب وجراحة الأسنان',           isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 26 ───
  { id: 'sp-26', name: 'Orthodontics',                nameAr: 'تقويم الأسنان',                isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 27 ───
  { id: 'sp-27', name: 'Vascular Surgery',            nameAr: 'جراحة الأوعية الدموية',       isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 28 ───
  { id: 'sp-28', name: 'Cardiothoracic Surgery',      nameAr: 'جراحة القلب والصدر',           isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 29 ───
  { id: 'sp-29', name: 'Colorectal Surgery',          nameAr: 'جراحة القولون والمستقيم',      isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 30 ───
  { id: 'sp-30', name: 'Neonatology',                 nameAr: 'طب حديثي الولادة',             isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 31 ───
  { id: 'sp-31', name: 'Pediatric Surgery',           nameAr: 'جراحة الأطفال',               isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 32 ───
  { id: 'sp-32', name: 'Physical Medicine & Rehabilitation', nameAr: 'الطب الطبيعي والتأهيل', isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 33 ───
  { id: 'sp-33', name: 'Sports Medicine',             nameAr: 'طب الرياضة والإصابات',        isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 34 ───
  { id: 'sp-34', name: 'Anesthesiology',              nameAr: 'التخدير والرعاية المركزة',     isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 35 ───
  { id: 'sp-35', name: 'Radiology',                   nameAr: 'الأشعة التشخيصية',            isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 36 ───
  { id: 'sp-36', name: 'Pathology',                   nameAr: 'أمراض الدم والتحاليل الطبية', isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 37 ───
  { id: 'sp-37', name: 'Microbiology',                nameAr: 'الميكروبيولوجيا والمناعة',    isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 38 ───
  { id: 'sp-38', name: 'Geriatrics',                  nameAr: 'طب المسنين',                   isActive: false, formSchema: [BASE_SCHEMA[0], BP_FIELD, TEMP_FIELD, BASE_SCHEMA[1], BASE_SCHEMA[2]] },
  // ─── 39 ───
  { id: 'sp-39', name: 'Emergency Medicine',          nameAr: 'طب الطوارئ',                   isActive: false, formSchema: [BASE_SCHEMA[0], BP_FIELD, TEMP_FIELD, { key: 'pulse', label: 'Pulse', labelAr: 'النبض', type: 'number', required: false }, BASE_SCHEMA[1], BASE_SCHEMA[2]] },
  // ─── 40 ───
  { id: 'sp-40', name: 'Family Medicine',             nameAr: 'طب الأسرة والمجتمع',          isActive: false, formSchema: [BASE_SCHEMA[0], BP_FIELD, WEIGHT_FIELD, BASE_SCHEMA[1], BASE_SCHEMA[2]] },
  // ─── 41 ───
  { id: 'sp-41', name: 'Internal Medicine',           nameAr: 'الباطنة والأمراض الداخلية',   isActive: false, formSchema: [BASE_SCHEMA[0], BP_FIELD, TEMP_FIELD, BASE_SCHEMA[1], BASE_SCHEMA[2]] },
  // ─── 42 ───
  { id: 'sp-42', name: 'Nutrition & Dietetics',       nameAr: 'التغذية العلاجية والسمنة',    isActive: false, formSchema: [BASE_SCHEMA[0], WEIGHT_FIELD, { key: 'height', label: 'Height (cm)', labelAr: 'الطول (سم)', type: 'number', required: false }, { key: 'bmi', label: 'BMI', labelAr: 'مؤشر كتلة الجسم', type: 'number', required: false }, BASE_SCHEMA[1], BASE_SCHEMA[2]] },
  // ─── 43 ───
  { id: 'sp-43', name: 'Andrology',                   nameAr: 'أمراض الذكورة والعقم',        isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 44 ───
  { id: 'sp-44', name: 'IVF & Reproductive Medicine', nameAr: 'أطفال الأنابيب والحقن المجهري', isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 45 ───
  { id: 'sp-45', name: 'Oral & Maxillofacial Surgery', nameAr: 'جراحة الوجه والفكين',        isActive: false, formSchema: [...BASE_SCHEMA] },
  // ─── 46 ───
  { id: 'sp-46', name: 'Pain Management',             nameAr: 'علاج الألم',                   isActive: false, formSchema: [BASE_SCHEMA[0], { key: 'pain_scale', label: 'Pain Scale (1-10)', labelAr: 'شدة الألم (١-١٠)', type: 'number', required: false }, BASE_SCHEMA[1], BASE_SCHEMA[2]] },
  // ─── 47 ───
  { id: 'sp-47', name: 'Clinical Psychology',         nameAr: 'الصحة النفسية والإدمان',      isActive: false, formSchema: [...BASE_SCHEMA] },
];

// ── Services (الأربعة الأولى محافظة على IDs القديمة) ─────────────────────────
const mockServices: Service[] = [
  { id: 'svc-1',  name: 'General Consultation',           nameAr: 'استشارة عامة',              specialtyId: 'sp-1',  price: 150, doctorPercentage: 60, isActive: true },
  { id: 'svc-2',  name: 'Blood Test',                     nameAr: 'تحليل دم',                  specialtyId: 'sp-1',  price: 75,  doctorPercentage: 40, isActive: true },
  { id: 'svc-3',  name: 'Pediatric Consultation',         nameAr: 'استشارة أطفال',             specialtyId: 'sp-2',  price: 150, doctorPercentage: 60, isActive: true },
  { id: 'svc-4',  name: 'Vaccination',                    nameAr: 'تطعيم',                      specialtyId: 'sp-2',  price: 50,  doctorPercentage: 35, isActive: true },
  { id: 'svc-5',  name: 'ECG',                            nameAr: 'تخطيط القلب',               specialtyId: 'sp-3',  price: 120, doctorPercentage: 50, isActive: true },
  { id: 'svc-6',  name: 'Cardiac Consultation',           nameAr: 'استشارة قلب',               specialtyId: 'sp-3',  price: 200, doctorPercentage: 55, isActive: true },
  { id: 'svc-7',  name: 'Skin Consultation',              nameAr: 'استشارة جلدية',             specialtyId: 'sp-4',  price: 180, doctorPercentage: 60, isActive: true },
  { id: 'svc-8',  name: 'Orthopedic Consultation',        nameAr: 'استشارة عظام',              specialtyId: 'sp-5',  price: 200, doctorPercentage: 60, isActive: true },
  { id: 'svc-9',  name: 'Eye Examination',                nameAr: 'فحص عيون',                  specialtyId: 'sp-6',  price: 180, doctorPercentage: 60, isActive: true },
  { id: 'svc-10', name: 'ENT Consultation',               nameAr: 'استشارة أنف وأذن',         specialtyId: 'sp-7',  price: 180, doctorPercentage: 60, isActive: true },
  { id: 'svc-11', name: 'Gynecology Consultation',        nameAr: 'استشارة نساء',              specialtyId: 'sp-8',  price: 200, doctorPercentage: 60, isActive: true },
  { id: 'svc-12', name: 'Urology Consultation',           nameAr: 'استشارة مسالك بولية',      specialtyId: 'sp-9',  price: 200, doctorPercentage: 60, isActive: true },
  { id: 'svc-13', name: 'Neurology Consultation',         nameAr: 'استشارة مخ وأعصاب',        specialtyId: 'sp-10', price: 250, doctorPercentage: 65, isActive: true },
  { id: 'svc-14', name: 'GI Consultation',                nameAr: 'استشارة جهاز هضمي',        specialtyId: 'sp-14', price: 200, doctorPercentage: 60, isActive: true },
  { id: 'svc-15', name: 'Chest Consultation',             nameAr: 'استشارة صدرية',             specialtyId: 'sp-16', price: 200, doctorPercentage: 60, isActive: true },
  { id: 'svc-16', name: 'Endocrine Consultation',         nameAr: 'استشارة غدد وسكر',         specialtyId: 'sp-17', price: 200, doctorPercentage: 60, isActive: true },
  { id: 'svc-17', name: 'Psychiatry Consultation',        nameAr: 'استشارة نفسية',             specialtyId: 'sp-24', price: 250, doctorPercentage: 70, isActive: true },
  { id: 'svc-18', name: 'Dental Consultation',            nameAr: 'كشف أسنان',                 specialtyId: 'sp-25', price: 150, doctorPercentage: 60, isActive: true },
  { id: 'svc-19', name: 'Internal Medicine Consultation', nameAr: 'استشارة باطنة',             specialtyId: 'sp-41', price: 200, doctorPercentage: 60, isActive: true },
  { id: 'svc-20', name: 'Nutrition Consultation',         nameAr: 'استشارة تغذية',             specialtyId: 'sp-42', price: 180, doctorPercentage: 65, isActive: true },
];

export const specialtyStore = createStore<Specialty>(mockSpecialties, 'cf_specialties');
export const serviceStore   = createStore<Service>(mockServices,      'cf_services');

export const getActiveSpecialties   = () => specialtyStore.filter(s => s.isActive);
export const getSpecialtyById       = (id: string) => specialtyStore.get(s => s.id === id);
export const getServicesBySpecialty = (specialtyId: string) => serviceStore.filter(s => s.specialtyId === specialtyId && s.isActive);
