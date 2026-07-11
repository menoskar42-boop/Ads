import { createStore } from './createStore';

export interface ClinicalProtocol {
  id: string;
  clinicId: string;
  condition: string;
  conditionAr: string;
  specialty: string;
  content: string;          // AI-generated or manually written
  language: 'ar' | 'en';
  isAiGenerated: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MedicalSearchResult {
  id: string;
  query: string;
  specialty: string;
  results: Array<{
    title: string;
    titleAr: string;
    content: string;
    contentAr: string;
    category: string;
  }>;
  searchedAt: string;
}

export const protocolStore = createStore<ClinicalProtocol>([], 'cf_protocols');
