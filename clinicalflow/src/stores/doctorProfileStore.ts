import { DoctorProfile } from '@/types';
import { createStore } from './createStore';

const mockProfiles: DoctorProfile[] = [
  {
    id: 'u-2',
    bio: 'Dr. Ahmed Hassan is a board-certified General Medicine physician with over 15 years of clinical experience at leading Cairo hospitals. He is committed to comprehensive, patient-centered care and preventive medicine.',
    bioAr: 'د. أحمد حسن طبيب معتمد في الطب العام مع أكثر من 15 عامًا من الخبرة السريرية في كبرى مستشفيات القاهرة. يلتزم بتقديم رعاية شاملة تتمحور حول المريض والطب الوقائي.',
    photoUrl: undefined,
    graduationYear: 2006,
    graduationUniversity: 'Cairo University Faculty of Medicine',
    graduationUniversityAr: 'كلية الطب - جامعة القاهرة',
    postgrad: [
      { id: 'pg-1', degree: 'Master of Internal Medicine', institution: 'Ain Shams University', year: 2010 },
      { id: 'pg-2', degree: 'Diploma in Family Medicine', institution: 'Arab Board of Health Specializations', year: 2012 },
    ],
    certifications: [
      { id: 'cert-1', name: 'Egyptian Medical Syndicate Board Certification', issuer: 'Egyptian Medical Syndicate', year: 2009 },
      { id: 'cert-2', name: 'Advanced Cardiac Life Support (ACLS)', issuer: 'American Heart Association', year: 2020 },
      { id: 'cert-3', name: 'Basic Life Support (BLS)', issuer: 'American Heart Association', year: 2022 },
    ],
    conferences: [
      { id: 'conf-1', name: 'Egyptian Internal Medicine Conference', year: 2022, location: 'Cairo, Egypt' },
      { id: 'conf-2', name: 'Arab Medical Congress', year: 2021, location: 'Dubai, UAE' },
      { id: 'conf-3', name: 'International Primary Care Conference', year: 2019, location: 'Vienna, Austria' },
    ],
    positions: [
      { id: 'pos-1', title: 'Senior Physician', institution: 'Nile Medical Center', fromYear: 2018, isCurrent: true },
      { id: 'pos-2', title: 'Resident Physician', institution: 'Kasr Al-Ainy Hospital', fromYear: 2007, toYear: 2011, isCurrent: false },
    ],
    achievements: [
      { id: 'ach-1', title: 'Research: Hypertension Management in Egyptian Patients', description: 'Published in the Egyptian Journal of Internal Medicine, 2019. Study of 500 patients across three Cairo hospitals.', year: 2019 },
      { id: 'ach-2', title: 'Excellence Award — Nile Medical Center', description: 'Recognized for outstanding patient satisfaction scores and clinical outcomes.', year: 2022 },
    ],
    additionalInfo: 'Dr. Hassan speaks Arabic and English. He has a special interest in preventive cardiology, diabetes management, and chronic disease care.',
    additionalInfoAr: 'يتحدث د. حسن العربية والإنجليزية. لديه اهتمام خاص بطب القلب الوقائي وإدارة السكري ورعاية الأمراض المزمنة.',
    allowAdminEdit: true,
    allowReceptionEdit: false,
    socialLinks: {
      facebook: 'https://facebook.com/dr.ahmedhassanmd',
      instagram: 'https://instagram.com/dr.ahmedhassan',
      linkedin: 'https://linkedin.com/in/dr-ahmed-hassan',
    },
  },
  {
    id: 'u-3',
    bio: 'Dr. Sarah Mitchell is a pediatric specialist dedicated to child health and development. She trained at top European and Egyptian medical centers and is passionate about making children comfortable during their visits.',
    bioAr: 'د. سارة ميتشل متخصصة في طب الأطفال مكرسة لصحة الطفل ونموه. تدربت في أفضل المراكز الطبية الأوروبية والمصرية وهي شغوفة بجعل الأطفال مرتاحين أثناء زياراتهم.',
    photoUrl: undefined,
    graduationYear: 2009,
    graduationUniversity: 'Alexandria University Faculty of Medicine',
    graduationUniversityAr: 'كلية الطب - جامعة الإسكندرية',
    postgrad: [
      { id: 'pg-3', degree: 'Fellowship in Pediatrics', institution: 'Royal College of Physicians, London', year: 2014 },
    ],
    certifications: [
      { id: 'cert-4', name: 'Egyptian Pediatric Society Certification', issuer: 'Egyptian Pediatric Society', year: 2013 },
      { id: 'cert-5', name: 'Pediatric Advanced Life Support (PALS)', issuer: 'American Academy of Pediatrics', year: 2021 },
    ],
    conferences: [
      { id: 'conf-4', name: 'International Pediatric Congress', year: 2023, location: 'Amsterdam, Netherlands' },
      { id: 'conf-5', name: 'Egyptian Pediatric Conference', year: 2022, location: 'Cairo, Egypt' },
    ],
    positions: [
      { id: 'pos-3', title: 'Consultant Pediatrician', institution: 'Nile Medical Center', fromYear: 2019, isCurrent: true },
      { id: 'pos-4', title: 'Pediatric Fellow', institution: "Great Ormond Street Hospital, London", fromYear: 2013, toYear: 2016, isCurrent: false },
    ],
    achievements: [
      { id: 'ach-3', title: 'Pediatric Vaccination Drive Lead', description: 'Led a community vaccination initiative reaching over 2,000 children in underserved Cairo neighborhoods.', year: 2021 },
    ],
    additionalInfo: 'Dr. Mitchell speaks Arabic and English. Special interests include neonatal care, developmental pediatrics, and childhood nutrition.',
    additionalInfoAr: 'تتحدث د. ميتشل العربية والإنجليزية. اهتمامات خاصة تشمل رعاية حديثي الولادة وطب الأطفال التنموي وتغذية الأطفال.',
    allowAdminEdit: true,
    allowReceptionEdit: true,
    socialLinks: {
      instagram: 'https://instagram.com/drsarahmitchell',
      linkedin: 'https://linkedin.com/in/dr-sarah-mitchell',
      youtube: 'https://youtube.com/@drsarahpediatrics',
    },
  },
  {
    id: 'u-4',
    bio: 'Dr. Omar Farouk is a consultant cardiologist with specialized training in interventional cardiology and echocardiography. He has performed over 1,000 cardiac catheterization procedures.',
    bioAr: 'د. عمر فاروق استشاري قلبية متخصص في قسطرة القلب وتخطيط صدى القلب. أجرى أكثر من 1000 إجراء قسطرة قلبية.',
    photoUrl: undefined,
    graduationYear: 2005,
    graduationUniversity: 'Cairo University Faculty of Medicine',
    graduationUniversityAr: 'كلية الطب - جامعة القاهرة',
    postgrad: [
      { id: 'pg-4', degree: 'MD in Cardiology', institution: 'Cairo University', year: 2012 },
      { id: 'pg-5', degree: 'Fellowship in Interventional Cardiology', institution: 'Cleveland Clinic, USA', year: 2015 },
    ],
    certifications: [
      { id: 'cert-6', name: 'Egyptian Board of Cardiology', issuer: 'Egyptian Cardiac Society', year: 2013 },
      { id: 'cert-7', name: 'Board Certification in Echocardiography', issuer: 'American Society of Echocardiography', year: 2016 },
    ],
    conferences: [
      { id: 'conf-6', name: 'European Society of Cardiology Congress', year: 2022, location: 'Barcelona, Spain' },
      { id: 'conf-7', name: 'American College of Cardiology', year: 2021, location: 'Atlanta, USA' },
      { id: 'conf-8', name: 'Egyptian Cardiac Society Annual Conference', year: 2023, location: 'Cairo, Egypt' },
    ],
    positions: [
      { id: 'pos-5', title: 'Head of Cardiology', institution: 'Nile Medical Center', fromYear: 2020, isCurrent: true },
      { id: 'pos-6', title: 'Interventional Cardiologist', institution: 'Cairo Heart Institute', fromYear: 2015, toYear: 2020, isCurrent: false },
    ],
    achievements: [
      { id: 'ach-4', title: 'First TAVR Procedure in the Clinic', description: 'Performed the first transcatheter aortic valve replacement at Nile Medical Center, 2021.', year: 2021 },
      { id: 'ach-5', title: 'Research: Coronary Artery Disease Risk Factors in Egypt', description: 'Multi-center study published in the Egyptian Heart Journal, 2020.', year: 2020 },
    ],
    additionalInfo: 'Dr. Farouk is fluent in Arabic and English. He has a special interest in heart failure management and preventive cardiology.',
    additionalInfoAr: 'د. فاروق متحدث طلق بالعربية والإنجليزية. لديه اهتمام خاص بإدارة فشل القلب وطب القلب الوقائي.',
    allowAdminEdit: false,
    allowReceptionEdit: false,
    socialLinks: {
      linkedin: 'https://linkedin.com/in/dr-omar-farouk',
      twitter: 'https://twitter.com/dromarfarouk',
    },
  },
  {
    id: 'u-5',
    bio: 'Dr. Lisa Chen is a board-certified dermatologist specializing in cosmetic dermatology, skin cancer screening, and complex skin conditions. She brings international training and a compassionate approach to every patient.',
    bioAr: 'د. ليزا تشين طبيبة جلدية معتمدة متخصصة في الجلدية التجميلية وفحص سرطان الجلد وحالات الجلد المعقدة.',
    photoUrl: undefined,
    graduationYear: 2011,
    graduationUniversity: 'Ain Shams University Faculty of Medicine',
    graduationUniversityAr: 'كلية الطب - جامعة عين شمس',
    postgrad: [
      { id: 'pg-6', degree: 'Master in Dermatology', institution: 'Ain Shams University', year: 2016 },
      { id: 'pg-7', degree: 'Cosmetic Dermatology Fellowship', institution: 'French Society of Dermatology', year: 2018 },
    ],
    certifications: [
      { id: 'cert-8', name: 'Egyptian Dermatological Society Certification', issuer: 'Egyptian Dermatological Society', year: 2015 },
      { id: 'cert-9', name: 'Laser Safety Officer Certification', issuer: 'Laser Institute of America', year: 2019 },
    ],
    conferences: [
      { id: 'conf-9', name: 'World Congress of Dermatology', year: 2023, location: 'Singapore' },
      { id: 'conf-10', name: 'Arab Dermatology Conference', year: 2022, location: 'Dubai, UAE' },
    ],
    positions: [
      { id: 'pos-7', title: 'Consultant Dermatologist', institution: 'Nile Medical Center', fromYear: 2019, isCurrent: true },
    ],
    achievements: [
      { id: 'ach-6', title: 'Launch of Skin Cancer Screening Program', description: 'Established free annual skin cancer screening for 500+ patients at Nile Medical Center.', year: 2022 },
    ],
    additionalInfo: 'Dr. Chen speaks Arabic, English, and French. Special interests include laser therapy, acne management, and anti-aging treatments.',
    additionalInfoAr: 'تتحدث د. تشين العربية والإنجليزية والفرنسية. اهتمامات خاصة تشمل علاج الليزر وإدارة حب الشباب وعلاجات مكافحة الشيخوخة.',
    allowAdminEdit: true,
    allowReceptionEdit: false,
    socialLinks: {
      facebook: 'https://facebook.com/drlisachenmd',
      instagram: 'https://instagram.com/drlisachen',
      tiktok: 'https://tiktok.com/@drlisaskincare',
    },
  },
];

export const doctorProfileStore = createStore<DoctorProfile>(mockProfiles, 'cf_doctor_profiles');

export const getDoctorProfile = (doctorId: string): DoctorProfile | undefined =>
  doctorProfileStore.get(p => p.id === doctorId);

export const upsertDoctorProfile = (profile: DoctorProfile) => {
  const existing = doctorProfileStore.get(p => p.id === profile.id);
  if (existing) {
    doctorProfileStore.update(p => p.id === profile.id, profile);
  } else {
    doctorProfileStore.add(profile);
  }
};
