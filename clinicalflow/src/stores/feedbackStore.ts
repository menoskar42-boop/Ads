import { createStore } from './createStore';

export interface PatientFeedback {
  id: string;
  clinicId: string;
  patientId: string;
  patientName?: string;
  doctorId?: string;
  appointmentId?: string;
  stars: number;           // 1-5
  comment?: string;
  tags: string[];          // e.g. ['friendly', 'fast', 'clean']
  wouldRecommend?: boolean;
  submittedAt: string;
}

export interface FeedbackAnalysis {
  clinicId: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  summary: string;
  summaryAr: string;
  themes: string[];
  themesAr: string[];
  suggestions: string[];
  suggestionsAr: string[];
  generatedAt: string;
}

export const feedbackStore = createStore<PatientFeedback>([], 'cf_patient_feedback');
export const feedbackAnalysisStore = createStore<FeedbackAnalysis>([], 'cf_feedback_analysis');
