import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'en' | 'ar';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // App
    'app.title': 'ClinicFlow',

    // Auth
    'auth.login': 'Login',
    'auth.logout': 'Logout',
    'auth.username': 'Username',
    'auth.password': 'Password',
    'auth.admin': 'Admin',
    'auth.doctor': 'Doctor',
    'auth.receptionist': 'Receptionist',
    'auth.patient': 'Patient',
    'auth.welcome': 'Welcome to ClinicFlow',
    'auth.loginDescription': 'Sign in to your account',
    'auth.staffLogin': 'Staff Login',
    'auth.patientLogin': 'Patient Login',
    'auth.loginSuccess': 'Login successful!',
    'auth.loginError': 'Invalid credentials. Please try again.',

    // Patient Portal
    'patient.welcome': 'Welcome',
    'patient.dashboardDescription': 'View your appointments and book new visits',
    'patient.bookAppointment': 'Book Appointment',
    'patient.upcomingAppointments': 'Upcoming Appointments',
    'patient.upcomingDescription': 'Your scheduled appointments',
    'patient.pastVisits': 'Past Visits',
    'patient.noUpcoming': 'No upcoming appointments',
    'patient.bookNow': 'Book Now',
    'patient.cancelAppointment': 'Cancel Appointment',
    'patient.cancelConfirm': 'Are you sure you want to cancel this appointment?',
    'patient.cancelSuccess': 'Appointment cancelled successfully',
    'patient.allAppointments': 'All Appointments',

    // Profile
    'profile.completeTitle': 'Complete Your Profile',
    'profile.completeDescription': 'Please complete your profile before booking appointments',
    'profile.fullName': 'Full Name',
    'profile.fullNamePlaceholder': 'Enter your full name',
    'profile.fullNameAr': 'Full Name (Arabic)',
    'profile.fullNameArPlaceholder': 'أدخل اسمك الكامل',
    'profile.phone': 'Mobile Phone',
    'profile.phonePlaceholder': '+20 1xx xxx xxxx',
    'profile.birthDate': 'Birth Date',
    'profile.gender': 'Gender',
    'profile.complete': 'Complete Profile',
    'profile.completeSuccess': 'Profile completed successfully!',

    // Booking
    'booking.selectSpecialty': 'Select Specialty',
    'booking.specialtyDescription': 'Choose the medical specialty you need',
    'booking.selectDoctor': 'Select Doctor',
    'booking.doctorDescription': 'Choose a doctor from',
    'booking.noDoctors': 'No doctors available for this specialty',
    'booking.changeSpecialty': 'Change Specialty',
    'booking.selectDate': 'Select Date',
    'booking.dateDescription': 'Choose an available date for',
    'booking.selectTime': 'Select Time',
    'booking.timeDescription': 'Choose an available time slot on',
    'booking.noSlots': 'No available time slots for this date',
    'booking.changeDate': 'Change Date',
    'booking.confirm': 'Confirm',
    'booking.confirmTitle': 'Confirm Booking',
    'booking.confirmDescription': 'Review your appointment details',
    'booking.specialty': 'Specialty',
    'booking.confirmBooking': 'Confirm Booking',
    'booking.success': 'Appointment booked successfully!',
    'booking.slotConflict': 'This time slot is already booked. Please choose another.',
    'booking.availableLegend': 'Available slots are highlighted in green',
    'booking.selectPatient': 'Select Patient',
    'booking.patientPreselected': 'Booking for',
    'booking.forPatient': 'for',

    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.patients': 'Patients',
    'nav.appointments': 'Appointments',
    'nav.doctors': 'Doctors',
    'nav.specialties': 'Specialties',
    'nav.services': 'Services',
    'nav.offers': 'Medical Offers',
    'nav.homeVisits': 'Home Visits',
    'nav.billing': 'Billing',
    'nav.installments': 'Installments',
    'nav.reports': 'Reports',
    'nav.rooms': 'Rooms',
    'nav.chatbot': 'Chatbot',
    'nav.subscription': 'Subscription',
    'nav.settings': 'Settings',
    'nav.staffManagement': 'User Management',
    'nav.documentAudit': 'Document Audit',
    'nav.queueManagement': 'Queue Management',

    // Dashboard
    'dashboard.title': 'Dashboard',
    'dashboard.totalPatients': 'Total Patients',
    'dashboard.todayAppointments': "Today's Appointments",
    'dashboard.monthlyRevenue': 'Monthly Revenue',
    'dashboard.doctorsOnDuty': 'Doctors on Duty',
    'dashboard.quickActions': 'Quick Actions',
    'dashboard.recentAppointments': 'Recent Appointments',
    'dashboard.upcomingAppointments': 'Upcoming Appointments',

    // Patients
    'patients.title': 'Patient Management',
    'patients.add': 'Add Patient',
    'patients.edit': 'Edit Patient',
    'patients.view': 'View Patient',
    'patients.name': 'Name',
    'patients.phone': 'Phone',
    'patients.age': 'Age',
    'patients.gender': 'Gender',
    'patients.male': 'Male',
    'patients.female': 'Female',
    'patients.medicalNotes': 'Medical Notes',
    'patients.search': 'Search patients...',
    'patients.noPatients': 'No patients found',
    'patients.lastVisit': 'Last Visit',

    // Appointments
    'appointments.title': 'Appointment Management',
    'appointments.book': 'Book Appointment',
    'appointments.edit': 'Edit Appointment',
    'appointments.patient': 'Patient',
    'appointments.doctor': 'Doctor',
    'appointments.date': 'Date',
    'appointments.time': 'Time',
    'appointments.status': 'Status',
    'appointments.scheduled': 'Scheduled',
    'appointments.completed': 'Completed',
    'appointments.cancelled': 'Cancelled',
    'appointments.service': 'Service',
    'appointments.notes': 'Notes',
    'appointments.daily': 'Daily View',
    'appointments.weekly': 'Weekly View',

    // Doctors
    'doctors.title': 'Doctor Management',
    'doctors.add': 'Add Doctor',
    'doctors.edit': 'Edit Doctor',
    'doctors.name': 'Name',
    'doctors.specialization': 'Specialization',
    'doctors.workingHours': 'Working Hours',
    'doctors.schedule': 'Schedule',
    'doctors.noSchedule': 'No schedule available',
    'doctors.active': 'Active',
    'doctors.inactive': 'Inactive',
    'doctors.workingDays': 'Working Days',
    'doctors.startTime': 'Start Time',
    'doctors.endTime': 'End Time',
    'doctors.addDay': 'Add Day',
    'doctors.manageSchedule': 'Manage Doctor Schedules',
    'doctors.scheduleUpdated': 'Schedule updated',

    // Services
    'services.title': 'Services Management',
    'services.add': 'Add Service',
    'services.edit': 'Edit Service',
    'services.name': 'Service Name',
    'services.price': 'Price',
    'services.specialty': 'Specialty',

    // Billing
    'billing.title': 'Billing',
    'billing.invoice': 'Invoice',
    'billing.total': 'Total',
    'billing.paid': 'Paid',
    'billing.unpaid': 'Unpaid',
    'billing.pending': 'Pending',
    'billing.patient': 'Patient',
    'billing.date': 'Date',
    'billing.status': 'Status',
    'billing.services': 'Services',
    'billing.payNow': 'Pay Now',
    'billing.addService': 'Add Service',
    'billing.discount': 'Discount',
    'billing.subtotal': 'Subtotal',
    'billing.paymentMethod': 'Payment Method',
    'billing.cash': 'Cash',
    'billing.card': 'Card',
    'billing.insurance': 'Insurance',

    // Reports
    'reports.title': 'Reports',
    'reports.totalRevenue': 'Total Revenue',
    'reports.revenue': 'Revenue',
    'reports.totalPatients': 'Total Patients',
    'reports.totalVisits': 'Total Visits',
    'reports.byDoctor': 'By Doctor',
    'reports.bySpecialty': 'By Specialty',
    'reports.appointments': 'Appointments',

    // Settings
    'settings.title': 'Settings',
    'settings.clinicInfo': 'Clinic Information',
    'settings.save': 'Save Changes',
    'settings.saved': 'Settings saved successfully',

    // Common
    'common.back': 'Back',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.search': 'Search',
    'common.loading': 'Loading...',
    'common.noData': 'No data available',
    'common.confirm': 'Confirm',
    'common.close': 'Close',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.active': 'Active',
    'common.inactive': 'Inactive',
    'common.all': 'All',
    'common.today': 'Today',
    'common.actions': 'Actions',
    'common.status': 'Status',
    'common.name': 'Name',
    'common.phone': 'Phone',
    'common.email': 'Email',
    'common.date': 'Date',
    'common.time': 'Time',
    'common.notes': 'Notes',
    'common.required': 'Required',
    'common.optional': 'Optional',
    'common.success': 'Success',
    'common.error': 'Error',
    'common.warning': 'Warning',
    'common.info': 'Info',
  },

  ar: {
    // App
    'app.title': 'ClinicFlow',

    // Auth
    'auth.login': 'تسجيل الدخول',
    'auth.logout': 'تسجيل الخروج',
    'auth.username': 'اسم المستخدم',
    'auth.password': 'كلمة المرور',
    'auth.admin': 'مدير',
    'auth.doctor': 'طبيب',
    'auth.receptionist': 'موظف استقبال',
    'auth.patient': 'مريض',
    'auth.welcome': 'مرحباً بك في ClinicFlow',
    'auth.loginDescription': 'قم بتسجيل الدخول إلى حسابك',
    'auth.staffLogin': 'دخول الموظفين',
    'auth.patientLogin': 'دخول المرضى',
    'auth.loginSuccess': 'تم تسجيل الدخول بنجاح!',
    'auth.loginError': 'بيانات غير صحيحة. حاول مرة أخرى.',

    // Patient Portal
    'patient.welcome': 'مرحباً',
    'patient.dashboardDescription': 'اعرض مواعيدك واحجز زيارات جديدة',
    'patient.bookAppointment': 'حجز موعد',
    'patient.upcomingAppointments': 'المواعيد القادمة',
    'patient.upcomingDescription': 'مواعيدك المجدولة',
    'patient.pastVisits': 'الزيارات السابقة',
    'patient.noUpcoming': 'لا توجد مواعيد قادمة',
    'patient.bookNow': 'احجز الآن',
    'patient.cancelAppointment': 'إلغاء الموعد',
    'patient.cancelConfirm': 'هل أنت متأكد أنك تريد إلغاء هذا الموعد؟',
    'patient.cancelSuccess': 'تم إلغاء الموعد بنجاح',
    'patient.allAppointments': 'جميع المواعيد',

    // Profile
    'profile.completeTitle': 'أكمل ملفك الشخصي',
    'profile.completeDescription': 'يرجى إكمال ملفك الشخصي قبل حجز المواعيد',
    'profile.fullName': 'الاسم الكامل',
    'profile.fullNamePlaceholder': 'أدخل اسمك الكامل',
    'profile.fullNameAr': 'الاسم الكامل (عربي)',
    'profile.fullNameArPlaceholder': 'أدخل اسمك الكامل',
    'profile.phone': 'رقم الهاتف',
    'profile.phonePlaceholder': '01xxxxxxxxx',
    'profile.birthDate': 'تاريخ الميلاد',
    'profile.gender': 'الجنس',
    'profile.complete': 'إكمال الملف',
    'profile.completeSuccess': 'تم إكمال الملف الشخصي بنجاح!',

    // Booking
    'booking.selectSpecialty': 'اختر التخصص',
    'booking.specialtyDescription': 'اختر التخصص الطبي الذي تحتاجه',
    'booking.selectDoctor': 'اختر الطبيب',
    'booking.doctorDescription': 'اختر طبيباً من',
    'booking.noDoctors': 'لا يوجد أطباء متاحون لهذا التخصص',
    'booking.changeSpecialty': 'تغيير التخصص',
    'booking.selectDate': 'اختر التاريخ',
    'booking.dateDescription': 'اختر تاريخاً متاحاً لـ',
    'booking.selectTime': 'اختر الوقت',
    'booking.timeDescription': 'اختر موعداً متاحاً في',
    'booking.noSlots': 'لا توجد مواعيد متاحة لهذا التاريخ',
    'booking.changeDate': 'تغيير التاريخ',
    'booking.confirm': 'تأكيد',
    'booking.confirmTitle': 'تأكيد الحجز',
    'booking.confirmDescription': 'مراجعة تفاصيل موعدك',
    'booking.specialty': 'التخصص',
    'booking.confirmBooking': 'تأكيد الحجز',
    'booking.success': 'تم حجز الموعد بنجاح!',
    'booking.slotConflict': 'هذا الموعد محجوز بالفعل. يرجى اختيار موعد آخر.',
    'booking.availableLegend': 'المواعيد المتاحة مظللة باللون الأخضر',
    'booking.selectPatient': 'اختر المريض',
    'booking.patientPreselected': 'الحجز لـ',
    'booking.forPatient': 'لـ',

    // Navigation
    'nav.dashboard': 'لوحة التحكم',
    'nav.patients': 'المرضى',
    'nav.appointments': 'المواعيد',
    'nav.doctors': 'الأطباء',
    'nav.specialties': 'التخصصات',
    'nav.services': 'الخدمات',
    'nav.offers': 'العروض الطبية',
    'nav.homeVisits': 'الزيارات المنزلية',
    'nav.billing': 'الفواتير',
    'nav.installments': 'الأقساط',
    'nav.reports': 'التقارير',
    'nav.rooms': 'الغرف',
    'nav.chatbot': 'شات بوت',
    'nav.subscription': 'الاشتراك',
    'nav.settings': 'الإعدادات',
    'nav.staffManagement': 'إدارة المستخدمين',
    'nav.documentAudit': 'سجل الوثائق',
    'nav.queueManagement': 'إدارة طابور الانتظار',

    // Dashboard
    'dashboard.title': 'لوحة التحكم',
    'dashboard.totalPatients': 'إجمالي المرضى',
    'dashboard.todayAppointments': 'مواعيد اليوم',
    'dashboard.monthlyRevenue': 'الإيرادات الشهرية',
    'dashboard.doctorsOnDuty': 'أطباء في الخدمة',
    'dashboard.quickActions': 'إجراءات سريعة',
    'dashboard.recentAppointments': 'المواعيد الأخيرة',
    'dashboard.upcomingAppointments': 'المواعيد القادمة',

    // Patients
    'patients.title': 'إدارة المرضى',
    'patients.add': 'إضافة مريض',
    'patients.edit': 'تعديل بيانات المريض',
    'patients.view': 'عرض بيانات المريض',
    'patients.name': 'الاسم',
    'patients.phone': 'الهاتف',
    'patients.age': 'العمر',
    'patients.gender': 'الجنس',
    'patients.male': 'ذكر',
    'patients.female': 'أنثى',
    'patients.medicalNotes': 'الملاحظات الطبية',
    'patients.search': 'بحث عن المرضى...',
    'patients.noPatients': 'لا يوجد مرضى',
    'patients.lastVisit': 'آخر زيارة',

    // Appointments
    'appointments.title': 'إدارة المواعيد',
    'appointments.book': 'حجز موعد',
    'appointments.edit': 'تعديل الموعد',
    'appointments.patient': 'المريض',
    'appointments.doctor': 'الطبيب',
    'appointments.date': 'التاريخ',
    'appointments.time': 'الوقت',
    'appointments.status': 'الحالة',
    'appointments.scheduled': 'مجدول',
    'appointments.completed': 'مكتمل',
    'appointments.cancelled': 'ملغي',
    'appointments.service': 'الخدمة',
    'appointments.notes': 'الملاحظات',
    'appointments.daily': 'عرض يومي',
    'appointments.weekly': 'عرض أسبوعي',

    // Doctors
    'doctors.title': 'إدارة الأطباء',
    'doctors.add': 'إضافة طبيب',
    'doctors.edit': 'تعديل بيانات الطبيب',
    'doctors.name': 'الاسم',
    'doctors.specialization': 'التخصص',
    'doctors.workingHours': 'ساعات العمل',
    'doctors.schedule': 'الجدول الزمني',
    'doctors.noSchedule': 'لا يوجد جدول متاح',
    'doctors.active': 'نشط',
    'doctors.inactive': 'غير نشط',
    'doctors.workingDays': 'أيام العمل',
    'doctors.startTime': 'وقت البدء',
    'doctors.endTime': 'وقت الانتهاء',
    'doctors.addDay': 'إضافة يوم',
    'doctors.manageSchedule': 'إدارة جداول الأطباء',
    'doctors.scheduleUpdated': 'تم تحديث الجدول',

    // Services
    'services.title': 'إدارة الخدمات',
    'services.add': 'إضافة خدمة',
    'services.edit': 'تعديل خدمة',
    'services.name': 'اسم الخدمة',
    'services.price': 'السعر',
    'services.specialty': 'التخصص',

    // Billing
    'billing.title': 'الفواتير',
    'billing.invoice': 'فاتورة',
    'billing.total': 'الإجمالي',
    'billing.paid': 'مدفوع',
    'billing.unpaid': 'غير مدفوع',
    'billing.pending': 'معلق',
    'billing.patient': 'المريض',
    'billing.date': 'التاريخ',
    'billing.status': 'الحالة',
    'billing.services': 'الخدمات',
    'billing.payNow': 'ادفع الآن',
    'billing.addService': 'إضافة خدمة',
    'billing.discount': 'خصم',
    'billing.subtotal': 'المجموع الفرعي',
    'billing.paymentMethod': 'طريقة الدفع',
    'billing.cash': 'نقداً',
    'billing.card': 'بطاقة',
    'billing.insurance': 'تأمين',

    // Reports
    'reports.title': 'التقارير',
    'reports.totalRevenue': 'إجمالي الإيرادات',
    'reports.revenue': 'الإيرادات',
    'reports.totalPatients': 'إجمالي المرضى',
    'reports.totalVisits': 'إجمالي الزيارات',
    'reports.byDoctor': 'حسب الطبيب',
    'reports.bySpecialty': 'حسب التخصص',
    'reports.appointments': 'المواعيد',

    // Settings
    'settings.title': 'الإعدادات',
    'settings.clinicInfo': 'معلومات العيادة',
    'settings.save': 'حفظ التغييرات',
    'settings.saved': 'تم حفظ الإعدادات بنجاح',

    // Common
    'common.back': 'رجوع',
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.delete': 'حذف',
    'common.edit': 'تعديل',
    'common.add': 'إضافة',
    'common.search': 'بحث',
    'common.loading': 'جاري التحميل...',
    'common.noData': 'لا توجد بيانات',
    'common.confirm': 'تأكيد',
    'common.close': 'إغلاق',
    'common.yes': 'نعم',
    'common.no': 'لا',
    'common.active': 'نشط',
    'common.inactive': 'غير نشط',
    'common.all': 'الكل',
    'common.today': 'اليوم',
    'common.actions': 'الإجراءات',
    'common.status': 'الحالة',
    'common.name': 'الاسم',
    'common.phone': 'الهاتف',
    'common.email': 'البريد الإلكتروني',
    'common.date': 'التاريخ',
    'common.time': 'الوقت',
    'common.notes': 'الملاحظات',
    'common.required': 'مطلوب',
    'common.optional': 'اختياري',
    'common.success': 'نجاح',
    'common.error': 'خطأ',
    'common.warning': 'تحذير',
    'common.info': 'معلومة',
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem('cf_lang');
    return (stored === 'ar' || stored === 'en') ? stored : 'ar';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('cf_lang', lang);
  };

  const t = (key: string): string =>
    translations[language][key] ?? translations['en'][key] ?? key;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL: language === 'ar' }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
};
