import { createStore } from './createStore';

export type MessageType = 'reminder' | 'followup' | 'confirmation' | 'no_show' | 'custom';
export type MessageStatus = 'draft' | 'sent' | 'failed';

export interface PatientMessage {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  doctorId?: string;
  appointmentId?: string;
  messageType: MessageType;
  content: string;
  status: MessageStatus;
  language: 'ar' | 'en';
  createdAt: string;
  sentAt?: string;
}

export interface MessageTemplate {
  id: string;
  clinicId: string;
  name: string;
  nameAr: string;
  messageType: MessageType;
  contentAr: string;
  contentEn: string;
  isDefault: boolean;
}

export const messageStore = createStore<PatientMessage>([], 'cf_patient_messages');
export const messageTemplateStore = createStore<MessageTemplate>([], 'cf_message_templates');
