// ─── Core Enums ───
export type UserRole = 'super_admin' | 'admin' | 'doctor' | 'reception' | 'patient';
export type SubscriptionPlan = 'basic' | 'pro' | 'ai';
export type PracticeType = 'solo' | 'clinic_member';

// ─── Clinic ───
export interface Clinic {
  id: string;
  name: string;
  nameAr: string;
  address: string;
  addressAr: string;
  phone: string;
  city: string;
  cityAr: string;
  subscriptionPlan: SubscriptionPlan;
  isActive: boolean;
  maxDoctors: number;
  aiEnabled: boolean;
  advancedReports: boolean;
  createdAt: string;
  // ─── Public Profile / Marketing Fields ───
  description?: string;
  descriptionAr?: string;
  coverImageUrl?: string;
  workingHours?: string;
  workingHoursAr?: string;
  latitude?: number;
  longitude?: number;
  website?: string;
  socialLinks?: SocialLinks;
  // ─── Statistics Bar (admin-set base values, auto-incremented by activity) ───
  statsFoundedYear?: number;      // year clinic was founded → years experience
  statsBasePatients?: number;     // base patient count before going live on platform
  statsBaseSurgeries?: number;    // base surgery/procedure count before going live
}

// ─── Doctor Profile (rich professional info) ───
export interface DoctorPostgrad {
  id: string;
  degree: string;
  institution: string;
  year: number;
}

export interface DoctorCertification {
  id: string;
  name: string;
  issuer: string;
  year: number;
}

export interface DoctorConference {
  id: string;
  name: string;
  year: number;
  location: string;
}

export interface DoctorPosition {
  id: string;
  title: string;
  institution: string;
  fromYear: number;
  toYear?: number;
  isCurrent: boolean;
}

export interface DoctorAchievement {
  id: string;
  title: string;
  description: string;
  year: number;
}

export interface DoctorProfile {
  id: string;
  bio: string;
  bioAr: string;
  photoUrl?: string;
  graduationYear?: number;
  graduationUniversity?: string;
  graduationUniversityAr?: string;
  postgrad: DoctorPostgrad[];
  certifications: DoctorCertification[];
  conferences: DoctorConference[];
  positions: DoctorPosition[];
  achievements: DoctorAchievement[];
  additionalInfo: string;
  additionalInfoAr: string;
  allowAdminEdit: boolean;
  allowReceptionEdit: boolean;
  socialLinks?: SocialLinks;
}

// ─── Rating ───
export interface Rating {
  id: string;
  targetId: string;
  targetType: 'doctor' | 'clinic';
  patientId: string;
  stars: number;
  comment?: string;
  createdAt: string;
}

// ─── Doctor ↔ Clinic Link (multi-clinic doctors) ───
export interface DoctorClinicLink {
  id: string;
  doctorId: string;
  clinicId: string;
  isActive: boolean;
}

// ─── Core Enums (continued) ───
export type VisitStatus = 'booked' | 'checked_in' | 'waiting' | 'in_consultation' | 'completed' | 'no_show' | 'cancelled';
export type VisitPriority = 'normal' | 'urgent' | 'emergency';
export type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'converted' | 'no_show' | 'expected' | 'in_queue' | 'with_doctor' | 'done';
export type AppointmentVisitType = 'checkup' | 'consultation';
export type InvoiceStatus = 'pending' | 'paid' | 'partially_paid' | 'refunded';
export type OrderType = 'lab' | 'radiology';
export type OrderStatus = 'requested' | 'completed';
export type PaymentMethod = 'cash' | 'card' | 'insurance' | 'bank_transfer';

// ─── User (unified) ───
export interface User {
  id: string;
  name: string;
  nameAr: string;
  email: string;
  role: UserRole;
  specialtyId?: string;
  clinicId: string;
  isActive: boolean;
  createdAt: string;
  // ─── Multi-Role Subscription Context (doctors only) ───
  practiceType?: PracticeType;        // 'solo' = own subscription | 'clinic_member' = inherits clinic plan
  subscriptionPlan?: SubscriptionPlan; // only used when practiceType === 'solo'
  planExpiresAt?: string;              // ISO date — when solo plan expires
  // ─── Home Visit Configuration (doctors only) ───
  homeVisitEnabled?: boolean;
  homeVisitPrice?: number;
  homeVisitDurationMinutes?: number;
  homeVisitDailyLimit?: number;
  homeVisitRadiusKm?: number;
  homeVisitAreas?: string[];
}

// ─── Specialty ───
export interface FormFieldOption {
  label: string;
  labelAr: string;
  value: string;
}

export interface FormField {
  key: string;
  label: string;
  labelAr: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox' | 'date';
  options?: FormFieldOption[];
  required: boolean;
}

export interface Specialty {
  id: string;
  name: string;
  nameAr: string;
  formSchema: FormField[];
  isActive: boolean;
}

// ─── Patient ───
export interface Patient {
  id: string;
  name: string;
  nameAr: string;
  phone: string;
  email?: string;
  dateOfBirth: string;
  gender: 'male' | 'female';
  nationalId?: string;
  clinicId?: string;
  referralCode?: string;   // unique code this patient can share, e.g. "PAT-4821"
  referredBy?: string;     // referral_code used at registration
  insuranceCompanyId?: string;
  insuranceNumber?: string;
  insuranceExpiry?: string; // ISO date YYYY-MM-DD
  isVip?: boolean;
  createdAt: string;
}

// ─── Service ───
export interface Service {
  id: string;
  clinicId?: string;
  name: string;
  nameAr: string;
  specialtyId: string;
  price: number;
  doctorPercentage: number; // clinic gets (100 - doctorPercentage)
  isActive: boolean;
}

// ─── Visit Type ───
export interface VisitType {
  id: string;
  clinicId: string;
  name: string;
  nameAr: string;
  price: number;
  durationMinutes: number;
  isUrgent: boolean;
  isEnabled: boolean;
  sortOrder: number; // lower = higher queue priority (urgent types use -1)
}

// ─── Appointment (booking) ───
export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  specialtyId: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  isUrgent?: boolean;
  clinicId: string;
  notes?: string;
  createdAt: string;
  visitTypeId?: string;
  reminderSentConfirmation?: boolean;
  reminderSent24h?: boolean;
  reminderSent2h?: boolean;
  // ─── Home Visit ───
  isHomeVisit?: boolean;
  homeAddress?: string;
  homeArea?: string;
  homeCity?: string;
  homeLocationPin?: string;
  // ─── Booking Source ───
  source?: 'whatsapp' | 'reception' | 'online';
  // ─── Smart Queue Engine ───
  isEmergency?: boolean;
  paymentConfirmed?: boolean;
  checkedInAt?: string;
  visitTypeCategory?: AppointmentVisitType;
  // ─── Queue Optimization (STEP 1) ───
  startedAt?: string;
  finishedAt?: string;
  estimatedDuration?: number;  // minutes, predicted before calling
  actualDuration?: number;     // minutes, computed after Done
  expectedStartAt?: string;    // ISO, predicted queue start time
  noShowScore?: number;        // 0-100 risk score
  // ─── Scheduling Strategy ───
  queuePosition?: number;      // position within the booking slot/interval
}

// ─── Visit (1:1 with Invoice) ───
export interface Visit {
  id: string;
  appointmentId?: string;
  patientId: string;
  doctorId: string;
  specialtyId: string;
  status: VisitStatus;
  invoiceId: string;
  date: string;
  time: string;
  isUrgent?: boolean;
  priority?: VisitPriority;
  arrivalTime?: string;
  visitStartTime?: string;
  visitEndTime?: string;
  clinicId: string;
  notes?: string;
  createdAt: string;
  visitTypeId?: string;
  // ─── Home Visit ───
  isHomeVisit?: boolean;
  homeAddress?: string;
  homeArea?: string;
  homeCity?: string;
}

// ─── Invoice ───
export interface Invoice {
  id: string;
  visitId: string;
  patientId: string;
  status: InvoiceStatus;
  totalAmount: number; // computed
  paidAmount: number;  // computed
  discountType: 'none' | 'percentage' | 'fixed';
  discountValue: number; // percentage (0-100) or fixed dollar amount
  isActive: boolean;
  createdAt: string;
}

// ─── InvoiceItem ───
export interface InvoiceItem {
  id: string;
  invoiceId: string;
  serviceId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;    // quantity × unitPrice
  doctorShare: number;   // totalPrice × (doctorPercentage / 100)
  // clinicShare = totalPrice - doctorShare (computed, not stored)
}

// ─── Payment ───
export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  receivedBy: string;
  isActive: boolean;
  createdAt: string;
}

// ─── SpecialtyRecord (dynamic form data) ───
export interface SpecialtyRecord {
  id: string;
  patientId: string;
  visitId: string;
  specialtyId: string;
  doctorId: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

// ─── Order ───
export interface Order {
  id: string;
  visitId: string;
  patientId: string;
  type: OrderType;
  title: string;
  titleAr: string;
  status: OrderStatus;
  requestedBy: string;
  notes?: string;
  createdAt: string;
}

// ─── Attachment ───
export interface Attachment {
  id: string;
  orderId?: string;
  patientId: string;
  visitId?: string;
  fileName: string;
  mimeType: string;
  fileUrl: string;
  uploadedBy: string;
  createdAt: string;
}

// ─── MedicalNote ───
export type MedicalNoteCategory = 'general' | 'diagnosis' | 'prescription' | 'allergy' | 'chronic_condition' | 'surgical_history' | 'follow_up';

export interface NoteAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileUrl: string; // object URL or data URL
  size: number;    // bytes
}

export interface MedicalNote {
  id: string;
  patientId: string;
  visitId?: string;
  doctorId: string;
  category: MedicalNoteCategory;
  title: string;
  content: string;
  attachments: NoteAttachment[];
  createdAt: string;
  updatedAt: string;
}

// ─── SOAPNote (AI Scribe) ───
export type SOAPNoteTemplate = 'soap' | 'treatment_note' | 'referral_letter' | 'patient_summary';
export type SOAPNoteStatus = 'draft' | 'final';

export interface SOAPNote {
  id: string;
  patientId: string;
  doctorId: string;
  visitId?: string;
  template: SOAPNoteTemplate;
  consultationInput: string;
  generatedContent: string;
  status: SOAPNoteStatus;
  specialty?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── VitalSign ───
export interface VitalSign {
  id: string;
  patientId: string;
  visitId?: string;
  doctorId: string;
  systolic: number;       // mmHg
  diastolic: number;      // mmHg
  heartRate: number;      // bpm
  temperature: number;    // °C
  weight: number;         // kg
  height?: number;        // cm
  oxygenSaturation?: number; // %
  notes?: string;
  recordedAt: string;
  createdAt: string;
}

// ─── DoctorSchedule ───
export interface DoctorSchedule {
  id: string;
  doctorId: string;
  dayOfWeek: number; // 0=Sunday ... 6=Saturday
  startTime: string; // "09:00"
  endTime: string;   // "14:00"
  isActive: boolean;
}

// ─── BlockedDate ───
export interface BlockedDate {
  id: string;
  doctorId: string;
  date: string;
  reason?: string;
}

// ─── Prescription ───
export type PrescriptionStatus = 'active' | 'completed' | 'cancelled';
export type MedicationFrequency = 'once_daily' | 'twice_daily' | 'three_times_daily' | 'four_times_daily' | 'as_needed' | 'weekly';

export interface PrescriptionMedication {
  id: string;
  name: string;
  nameAr: string;
  dosage: string;        // e.g. "500mg"
  frequency: MedicationFrequency;
  duration: string;      // e.g. "30 days"
  instructions?: string;
  instructionsAr?: string;
  refillsTotal: number;
  refillsUsed: number;
  nextRefillDate?: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  doctorId: string;
  visitId?: string;
  status: PrescriptionStatus;
  medications: PrescriptionMedication[];
  notes?: string;
  prescribedAt: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Medical Document ───
export type DocumentType = 'prescription' | 'lab_test' | 'radiology' | 'medical_report';
export type DocumentVisibilityMode = 'own_only' | 'specialty_all';
export type DocumentAuditAction =
  | 'view'
  | 'upload'
  | 'download'
  | 'delete'
  | 'view_patient'
  | 'view_prescription'
  | 'edit_prescription'
  | 'view_lab'
  | 'view_radiology';

export interface MedicalDocument {
  id: string;
  patientId: string;
  specialtyId: string;
  doctorId: string;
  uploadedBy: string;
  documentType: DocumentType;
  title: string;
  titleAr: string;
  fileName: string;
  mimeType: string;
  fileUrl: string;
  fileSize: number;
  notes?: string;
  uploadDate: string;
  createdAt: string;
}

export interface DocumentAuditLog {
  id: string;
  userId: string;
  patientId: string;
  documentId: string;
  action: DocumentAuditAction;
  timestamp: string;
  clinicId?: string;
  metadata?: Record<string, string>;
}

// ─── Social Links ───
export interface SocialLinks {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
  tiktok?: string;
  website?: string;
  twitter?: string;
}

// ─── Medical Offer ───
export type OfferType =
  | 'percentage_discount'
  | 'fixed_discount'
  | 'free_followup'
  | 'consultation_package'
  | 'family_package'
  | 'first_visit'
  | 'urgent_visit'
  | 'reward_points'
  | 'home_visit_discount'
  | 'home_visit_package';

export type OfferServiceType = 'consultation' | 'followup' | 'urgent' | 'all' | 'home_visit';

export interface OfferConditions {
  firstVisitOnly?: boolean;
  specificDays?: number[];
  hoursStart?: string;
  hoursEnd?: string;
}

export interface MedicalOffer {
  id: string;
  clinicId: string;
  clinicName: string;
  doctorId?: string;
  doctorName?: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  offerType: OfferType;
  serviceType: OfferServiceType;
  startDate: string;
  expiresAt: string;
  originalPrice?: number;
  discountedPrice?: number;
  discountPercent?: number;
  maxUses?: number;
  usedCount: number;
  conditions?: OfferConditions;
  isActive: boolean;
}

// ─── Registration Entry ───
export type RegistrationType = 'patient' | 'doctor' | 'clinic';

export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export interface RegistrationEntry {
  id: string;
  regNumber: string;
  type: RegistrationType;
  name: string;
  email: string;
  phone: string;
  password: string;
  referralCode: string;
  usedReferralCode?: string;
  createdAt: string;
  // Approval workflow
  status: RegistrationStatus;
  rejectionReason?: string;
  approvedAt?: string;
  // Doctor-specific
  specialtyId?: string;
  graduationYear?: number;
  // Clinic-specific
  clinicName?: string;
  address?: string;
  city?: string;
  adminName?: string;
  // Linked user/clinic after approval
  userId?: string;
  linkedClinicId?: string;
}

// ─── Helper: computed clinic share ───
export const getClinicShare = (totalPrice: number, doctorShare: number): number =>
  totalPrice - doctorShare;
