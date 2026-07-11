import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const DEMO_USERS: Record<string, object> = {
  admin: {
    id: 'u-1',
    name: 'Dr. Sara Mahmoud',
    nameAr: 'د. سارة محمود',
    email: 'admin@nilemedical.com',
    role: 'admin',
    clinicId: 'clinic-1',
  },
  doctor: {
    id: 'u-2',
    name: 'Dr. Ahmed Hassan',
    nameAr: 'د. أحمد حسن',
    email: 'ahmed.hassan@nilemedical.com',
    role: 'doctor',
    specialtyId: 'sp-1',
    clinicId: 'clinic-1',
  },
  reception: {
    id: 'u-6',
    name: 'Mariam Samir',
    nameAr: 'مريم سمير',
    email: 'reception@nilemedical.com',
    role: 'reception',
    clinicId: 'clinic-1',
  },
  patient: {
    id: 'pt-demo-1',
    name: 'Mohamed Ali Hassan',
    nameAr: 'محمد علي حسن',
    email: 'mohamed.ali@example.com',
    role: 'patient',
    patientId: 'pt-demo-1',
    clinicId: 'clinic-1',
  },
  super_admin: {
    id: 'super-admin-1',
    name: 'Super Admin',
    nameAr: 'المدير العام',
    email: 'superadmin@clinicflow.app',
    role: 'super_admin',
    clinicId: '',
  },
};

const MOCK_STAFF_USERS = [
  { id: 'u-1', name: 'Dr. Sara Mahmoud', nameAr: 'د. سارة محمود', email: 'admin@nilemedical.com', role: 'admin', clinicId: 'clinic-1', isActive: true, createdAt: '2024-01-01' },
  { id: 'u-2', name: 'Dr. Ahmed Hassan', nameAr: 'د. أحمد حسن', email: 'ahmed.hassan@nilemedical.com', role: 'doctor', specialtyId: 'sp-1', clinicId: 'clinic-1', isActive: true, createdAt: '2024-01-15', homeVisitEnabled: true, homeVisitPrice: 400, homeVisitDurationMinutes: 45, homeVisitDailyLimit: 4, homeVisitRadiusKm: 15, homeVisitAreas: ['مدينة نصر', 'مصر الجديدة', 'المعادي', 'الزمالك'] },
  { id: 'u-3', name: 'Dr. Nour Ibrahim', nameAr: 'د. نور إبراهيم', email: 'nour.ibrahim@nilemedical.com', role: 'doctor', specialtyId: 'sp-2', clinicId: 'clinic-1', isActive: true, createdAt: '2024-01-20' },
  { id: 'u-4', name: 'Dr. Omar Farouk', nameAr: 'د. عمر فاروق', email: 'omar.farouk@nilemedical.com', role: 'doctor', specialtyId: 'sp-3', clinicId: 'clinic-1', isActive: true, createdAt: '2024-02-01' },
  { id: 'u-5', name: 'Dr. Iman Mostafa', nameAr: 'د. إيمان مصطفى', email: 'iman.mostafa@nilemedical.com', role: 'doctor', specialtyId: 'sp-4', clinicId: 'clinic-1', isActive: true, createdAt: '2024-02-10' },
  { id: 'u-6', name: 'Mariam Samir', nameAr: 'مريم سمير', email: 'reception@nilemedical.com', role: 'reception', clinicId: 'clinic-1', isActive: true, createdAt: '2024-02-01' },
  { id: 'u-10', name: 'Dr. Hana Mansour', nameAr: 'د. هناء منصور', email: 'admin@cairohealth.com', role: 'admin', clinicId: 'clinic-2', isActive: true, createdAt: '2024-03-15' },
  { id: 'u-11', name: 'Dr. Karim Nabil', nameAr: 'د. كريم نبيل', email: 'karim.nabil@cairohealth.com', role: 'doctor', specialtyId: 'sp-1', clinicId: 'clinic-2', isActive: true, createdAt: '2024-03-20' },
  { id: 'u-12', name: 'Nour Khaled', nameAr: 'نور خالد', email: 'reception@cairohealth.com', role: 'reception', clinicId: 'clinic-2', isActive: true, createdAt: '2024-04-01' },
  { id: 'u-20', name: 'Dr. Tarek Samy', nameAr: 'د. طارق سامي', email: 'admin@alexcare.com', role: 'admin', clinicId: 'clinic-3', isActive: true, createdAt: '2024-06-01' },
  { id: 'u-21', name: 'Dr. Mona Fawzy', nameAr: 'د. منى فوزي', email: 'mona.fawzy@alexcare.com', role: 'doctor', specialtyId: 'sp-2', clinicId: 'clinic-3', isActive: true, createdAt: '2024-06-05' },
  { id: 'u-22', name: 'Reem Hassan', nameAr: 'ريم حسن', email: 'reception@alexcare.com', role: 'reception', clinicId: 'clinic-3', isActive: true, createdAt: '2024-06-10' },
];

const MOCK_PATIENTS = [
  { id: 'pt-demo-1', name: 'Mohamed Ali Hassan', nameAr: 'محمد علي حسن', phone: '01012345678', email: 'mohamed.ali@example.com', dateOfBirth: '1990-05-15', gender: 'male', clinicId: 'clinic-1', createdAt: '2024-01-10', referralCode: 'REF001' },
  { id: 'pt-demo-2', name: 'Fatma Ahmed Sayed', nameAr: 'فاطمة أحمد سيد', phone: '01198765432', email: 'fatma.ahmed@example.com', dateOfBirth: '1985-11-22', gender: 'female', clinicId: 'clinic-1', createdAt: '2024-01-15' },
  { id: 'pt-demo-3', name: 'Khaled Ibrahim Mostafa', nameAr: 'خالد إبراهيم مصطفى', phone: '01567890123', email: 'khaled.ibrahim@example.com', dateOfBirth: '1978-03-08', gender: 'male', clinicId: 'clinic-1', createdAt: '2024-01-20' },
  { id: 'pt-demo-4', name: 'Nadia Hassan Omar', nameAr: 'نادية حسن عمر', phone: '01234567890', email: 'nadia.hassan@example.com', dateOfBirth: '1995-07-30', gender: 'female', clinicId: 'clinic-1', createdAt: '2024-02-01' },
  { id: 'pt-demo-5', name: 'Youssef Adel Kamel', nameAr: 'يوسف عادل كامل', phone: '01109876543', email: 'youssef.adel@example.com', dateOfBirth: '2000-12-01', gender: 'male', clinicId: 'clinic-1', createdAt: '2024-02-10' },
  { id: 'pt-demo-6', name: 'Sara Tarek Mahmoud', nameAr: 'سارة طارق محمود', phone: '01665432109', email: 'sara.tarek@example.com', dateOfBirth: '1992-09-14', gender: 'female', clinicId: 'clinic-1', createdAt: '2024-02-20' },
  { id: 'pt-demo-7', name: 'Ahmed Farouk Nabil', nameAr: 'أحمد فاروق نبيل', phone: '01022334455', email: 'ahmed.farouk@example.com', dateOfBirth: '1988-04-25', gender: 'male', clinicId: 'clinic-1', createdAt: '2024-03-01' },
  { id: 'pt-demo-8', name: 'Heba Mohamed Rashad', nameAr: 'هبة محمد رشاد', phone: '01187654321', email: 'heba.rashad@example.com', dateOfBirth: '1982-06-18', gender: 'female', clinicId: 'clinic-1', createdAt: '2024-03-10' },
];

const today = new Date();
const fmt = (d: Date) => d.toISOString().split('T')[0];
const yesterday = fmt(new Date(today.getTime() - 86400000));
const todayStr = fmt(today);
const tomorrow = fmt(new Date(today.getTime() + 86400000));
const in2days = fmt(new Date(today.getTime() + 2 * 86400000));

const MOCK_APPOINTMENTS = [
  { id: 'apt-1', patientId: 'pt-demo-1', doctorId: 'u-2', clinicId: 'clinic-1', date: todayStr, time: '09:00', status: 'confirmed', type: 'consultation', notes: 'فحص دوري', createdAt: new Date().toISOString(), queueNumber: 1, priority: 'normal' },
  { id: 'apt-2', patientId: 'pt-demo-2', doctorId: 'u-2', clinicId: 'clinic-1', date: todayStr, time: '09:30', status: 'checked_in', type: 'consultation', notes: 'متابعة', createdAt: new Date().toISOString(), queueNumber: 2, priority: 'normal' },
  { id: 'apt-3', patientId: 'pt-demo-3', doctorId: 'u-3', clinicId: 'clinic-1', date: todayStr, time: '10:00', status: 'pending', type: 'follow_up', notes: '', createdAt: new Date().toISOString(), queueNumber: 3, priority: 'normal' },
  { id: 'apt-4', patientId: 'pt-demo-4', doctorId: 'u-2', clinicId: 'clinic-1', date: todayStr, time: '10:30', status: 'in_room', type: 'consultation', notes: 'كشف جديد', createdAt: new Date().toISOString(), queueNumber: 4, priority: 'urgent' },
  { id: 'apt-5', patientId: 'pt-demo-5', doctorId: 'u-4', clinicId: 'clinic-1', date: todayStr, time: '11:00', status: 'pending', type: 'consultation', notes: '', createdAt: new Date().toISOString(), queueNumber: 5, priority: 'normal' },
  { id: 'apt-6', patientId: 'pt-demo-6', doctorId: 'u-2', clinicId: 'clinic-1', date: tomorrow, time: '09:00', status: 'confirmed', type: 'consultation', notes: '', createdAt: new Date().toISOString(), queueNumber: 1, priority: 'normal' },
  { id: 'apt-7', patientId: 'pt-demo-7', doctorId: 'u-3', clinicId: 'clinic-1', date: tomorrow, time: '09:30', status: 'confirmed', type: 'follow_up', notes: 'متابعة نتائج', createdAt: new Date().toISOString(), queueNumber: 2, priority: 'normal' },
  { id: 'apt-8', patientId: 'pt-demo-1', doctorId: 'u-2', clinicId: 'clinic-1', date: yesterday, time: '10:00', status: 'completed', type: 'consultation', notes: 'تم الفحص', createdAt: new Date().toISOString(), queueNumber: 1, priority: 'normal' },
  { id: 'apt-9', patientId: 'pt-demo-8', doctorId: 'u-5', clinicId: 'clinic-1', date: in2days, time: '11:00', status: 'confirmed', type: 'consultation', notes: '', createdAt: new Date().toISOString(), queueNumber: 1, priority: 'normal' },
  { id: 'apt-10', patientId: 'pt-demo-2', doctorId: 'u-2', clinicId: 'clinic-1', date: yesterday, status: 'completed', time: '09:00', type: 'consultation', notes: '', createdAt: new Date().toISOString(), queueNumber: 2, priority: 'normal' },
];

const MOCK_VISITS = [
  { id: 'v-1', appointmentId: 'apt-8', patientId: 'pt-demo-1', doctorId: 'u-2', clinicId: 'clinic-1', status: 'completed', startTime: `${yesterday}T09:05:00`, endTime: `${yesterday}T09:25:00`, notes: 'المريض يشكو من ألم في الصدر، تم إجراء الفحص اللازم', diagnosis: 'ارتفاع ضغط الدم', createdAt: new Date().toISOString() },
  { id: 'v-2', appointmentId: 'apt-10', patientId: 'pt-demo-2', doctorId: 'u-2', clinicId: 'clinic-1', status: 'completed', startTime: `${yesterday}T09:35:00`, endTime: `${yesterday}T09:50:00`, notes: 'متابعة الدواء', diagnosis: 'سكري النوع الثاني', createdAt: new Date().toISOString() },
  { id: 'v-3', appointmentId: 'apt-4', patientId: 'pt-demo-4', doctorId: 'u-2', clinicId: 'clinic-1', status: 'in_progress', startTime: `${todayStr}T10:32:00`, notes: 'في الكشف', createdAt: new Date().toISOString() },
];

const MOCK_INVOICES = [
  { id: 'inv-1', visitId: 'v-1', patientId: 'pt-demo-1', status: 'paid',    totalAmount: 300, paidAmount: 300, discountType: 'none',       discountValue: 0,  isActive: true, createdAt: new Date().toISOString() },
  { id: 'inv-2', visitId: 'v-2', patientId: 'pt-demo-2', status: 'paid',    totalAmount: 225, paidAmount: 225, discountType: 'percentage', discountValue: 10, isActive: true, createdAt: new Date().toISOString() },
  { id: 'inv-3', visitId: 'v-3', patientId: 'pt-demo-4', status: 'pending', totalAmount: 400, paidAmount: 0,   discountType: 'none',       discountValue: 0,  isActive: true, createdAt: new Date().toISOString() },
];

const MOCK_PAYMENTS = [
  { id: 'pay-1', invoiceId: 'inv-1', amount: 300, method: 'cash', date: yesterday, receivedBy: 'u-6', isActive: true, createdAt: new Date().toISOString() },
  { id: 'pay-2', invoiceId: 'inv-2', amount: 225, method: 'card', date: yesterday, receivedBy: 'u-6', isActive: true, createdAt: new Date().toISOString() },
];

export default function DemoSetup() {
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role') || 'admin';
  const next = searchParams.get('next') || (role === 'patient' ? '/patient/appointments' : role === 'super_admin' ? '/super-admin' : '/dashboard');

  useEffect(() => {
    if (role === 'logout') {
      ['cf_user','cf_staff_users','cf_registered_patients','cf_patient_passwords','cf_staff_passwords','cf_appointments','cf_visits','cf_invoices','cf_invoice_items','cf_payments'].forEach(k => localStorage.removeItem(k));
      setTimeout(() => { window.location.replace(next); }, 50);
      return;
    }

    const authUser = DEMO_USERS[role];
    if (!authUser) { window.location.replace('/login'); return; }

    localStorage.setItem('cf_user', JSON.stringify(authUser));
    localStorage.setItem('cf_staff_users', JSON.stringify(MOCK_STAFF_USERS));
    localStorage.setItem('cf_registered_patients', JSON.stringify(MOCK_PATIENTS));
    localStorage.setItem('cf_patient_passwords', JSON.stringify({ 'pt-demo-1': 'demo1234' }));
    localStorage.setItem('cf_staff_passwords', JSON.stringify({
      'u-1': 'admin1234', 'u-2': 'doctor1234', 'u-6': 'recep1234',
    }));
    localStorage.setItem('cf_appointments', JSON.stringify(MOCK_APPOINTMENTS));
    localStorage.setItem('cf_visits', JSON.stringify(MOCK_VISITS));
    localStorage.setItem('cf_invoices', JSON.stringify(MOCK_INVOICES));
    localStorage.setItem('cf_payments', JSON.stringify(MOCK_PAYMENTS));

    setTimeout(() => { window.location.replace(next); }, 50);
  }, [role, next]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center space-y-3">
        <div className="text-4xl">⚙️</div>
        <p className="text-lg font-medium text-foreground">جاري إعداد الجلسة التجريبية...</p>
        <p className="text-muted-foreground text-sm">تسجيل الدخول كـ {role}</p>
      </div>
    </div>
  );
}
