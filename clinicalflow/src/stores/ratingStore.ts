import { Rating } from '@/types';
import { createStore } from './createStore';

const mockRatings: Rating[] = [
  { id: 'r-1', targetId: 'u-2', targetType: 'doctor', patientId: 'pt-1', stars: 5, comment: 'Dr. Ahmed is excellent — very thorough and caring.', createdAt: '2026-02-10T10:00:00Z' },
  { id: 'r-2', targetId: 'u-2', targetType: 'doctor', patientId: 'pt-2', stars: 4, comment: 'Good doctor, explains everything well.', createdAt: '2026-02-15T11:00:00Z' },
  { id: 'r-3', targetId: 'u-2', targetType: 'doctor', patientId: 'pt-3', stars: 5, comment: 'Very professional and helpful.', createdAt: '2026-02-20T09:30:00Z' },
  { id: 'r-4', targetId: 'u-3', targetType: 'doctor', patientId: 'pt-1', stars: 5, comment: 'My children love Dr. Sarah. She makes them feel at ease.', createdAt: '2026-01-20T14:00:00Z' },
  { id: 'r-5', targetId: 'u-3', targetType: 'doctor', patientId: 'pt-4', stars: 4, comment: 'Excellent pediatrician, highly recommended.', createdAt: '2026-02-05T16:00:00Z' },
  { id: 'r-6', targetId: 'u-4', targetType: 'doctor', patientId: 'pt-2', stars: 5, comment: 'Best cardiologist I have ever visited. Saved my life.', createdAt: '2026-01-15T09:00:00Z' },
  { id: 'r-7', targetId: 'u-4', targetType: 'doctor', patientId: 'pt-3', stars: 5, comment: 'Brilliant doctor. Very knowledgeable.', createdAt: '2026-02-01T11:30:00Z' },
  { id: 'r-8', targetId: 'u-4', targetType: 'doctor', patientId: 'pt-5', stars: 4, comment: 'Great experience. Very professional staff.', createdAt: '2026-02-12T08:00:00Z' },
  { id: 'r-9', targetId: 'u-5', targetType: 'doctor', patientId: 'pt-1', stars: 4, comment: 'Very knowledgeable and the clinic is modern.', createdAt: '2026-02-08T15:00:00Z' },
  { id: 'r-10', targetId: 'u-5', targetType: 'doctor', patientId: 'pt-6', stars: 5, comment: 'Dr. Chen is amazing. My skin has improved a lot.', createdAt: '2026-03-01T10:00:00Z' },
  { id: 'r-11', targetId: 'clinic-1', targetType: 'clinic', patientId: 'pt-1', stars: 5, comment: 'Nile Medical Center is top-notch. Clean, modern, and professional.', createdAt: '2026-02-25T12:00:00Z' },
  { id: 'r-12', targetId: 'clinic-1', targetType: 'clinic', patientId: 'pt-2', stars: 4, comment: 'Great clinic, short waiting times.', createdAt: '2026-02-28T09:00:00Z' },
  { id: 'r-13', targetId: 'clinic-1', targetType: 'clinic', patientId: 'pt-3', stars: 5, comment: 'Excellent service and friendly staff.', createdAt: '2026-03-02T14:00:00Z' },
  { id: 'r-14', targetId: 'clinic-1', targetType: 'clinic', patientId: 'pt-4', stars: 4, comment: 'Very good clinic, highly recommended.', createdAt: '2026-03-05T10:30:00Z' },
  { id: 'r-15', targetId: 'clinic-2', targetType: 'clinic', patientId: 'pt-7', stars: 4, comment: 'Good clinic with experienced doctors.', createdAt: '2026-02-20T11:00:00Z' },
  { id: 'r-16', targetId: 'clinic-3', targetType: 'clinic', patientId: 'pt-8', stars: 3, comment: 'Decent clinic but waiting times can be long.', createdAt: '2026-02-10T15:00:00Z' },
];

export const ratingStore = createStore<Rating>(mockRatings, 'cf_ratings');

export const getRatingsForTarget = (targetId: string, targetType: 'doctor' | 'clinic'): Rating[] =>
  ratingStore.filter(r => r.targetId === targetId && r.targetType === targetType);

export const getAverageRating = (targetId: string, targetType: 'doctor' | 'clinic'): { avg: number; count: number } => {
  const ratings = getRatingsForTarget(targetId, targetType);
  if (ratings.length === 0) return { avg: 0, count: 0 };
  const sum = ratings.reduce((acc, r) => acc + r.stars, 0);
  return { avg: Math.round((sum / ratings.length) * 10) / 10, count: ratings.length };
};

export const hasPatientRated = (patientId: string, targetId: string, targetType: 'doctor' | 'clinic'): boolean =>
  !!ratingStore.get(r => r.patientId === patientId && r.targetId === targetId && r.targetType === targetType);

export const addRating = (rating: Omit<Rating, 'id' | 'createdAt'>) => {
  ratingStore.add({ ...rating, id: `r-${Date.now()}`, createdAt: new Date().toISOString() });
};
