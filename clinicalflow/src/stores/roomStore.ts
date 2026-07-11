import { createStore } from './createStore';

export type RoomStatus = 'available' | 'occupied' | 'cleaning' | 'out_of_service';
export type RoomType = 'examination' | 'procedure' | 'xray' | 'lab' | 'waiting' | 'office';

export interface Room {
  id: string;
  clinicId: string;
  name: string;
  nameAr: string;
  number: string;
  type: RoomType;
  typeAr: string;
  status: RoomStatus;
  currentPatientId?: string;
  currentVisitId?: string;
  occupiedSince?: string;
  color: string;
  floor?: number;
  isActive: boolean;
}

export interface RoomStatusLog {
  id: string;
  roomId: string;
  clinicId: string;
  status: RoomStatus;
  patientId?: string;
  changedAt: string;
  changedBy: string;
  durationMinutes?: number;
}

export const roomStore = createStore<Room>([], 'cf_rooms');
export const roomStatusLogStore = createStore<RoomStatusLog>([], 'cf_room_logs');

export const ROOM_STATUS_COLORS: Record<RoomStatus, { bg: string; text: string; dot: string; label: string; labelAr: string }> = {
  available:      { bg: '#f0fdf4', text: '#16a34a', dot: '#22c55e', label: 'Available', labelAr: 'متاح' },
  occupied:       { bg: '#fff1f2', text: '#be123c', dot: '#f43f5e', label: 'Occupied',  labelAr: 'مشغول' },
  cleaning:       { bg: '#fefce8', text: '#a16207', dot: '#eab308', label: 'Cleaning',  labelAr: 'تنظيف' },
  out_of_service: { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8', label: 'Out of Service', labelAr: 'خارج الخدمة' },
};

export const ROOM_TYPE_LABELS: Record<RoomType, { en: string; ar: string }> = {
  examination: { en: 'Examination', ar: 'كشف' },
  procedure:   { en: 'Procedure',   ar: 'إجراءات' },
  xray:        { en: 'X-Ray',       ar: 'أشعة' },
  lab:         { en: 'Lab',         ar: 'مختبر' },
  waiting:     { en: 'Waiting',     ar: 'انتظار' },
  office:      { en: 'Office',      ar: 'مكتب' },
};

export const SEED_ROOMS = (clinicId: string): Room[] => {
  const ts = Date.now();
  return [
    { id: `room-${clinicId}-1-${ts}`, clinicId, name: 'Examination Room 1', nameAr: 'غرفة الكشف 1', number: '101', type: 'examination', typeAr: 'كشف', status: 'available', color: '#6366f1', isActive: true },
    { id: `room-${clinicId}-2-${ts}`, clinicId, name: 'Examination Room 2', nameAr: 'غرفة الكشف 2', number: '102', type: 'examination', typeAr: 'كشف', status: 'available', color: '#8b5cf6', isActive: true },
    { id: `room-${clinicId}-3-${ts}`, clinicId, name: 'Procedure Room',     nameAr: 'غرفة الإجراءات', number: '103', type: 'procedure', typeAr: 'إجراءات', status: 'available', color: '#06b6d4', isActive: true },
    { id: `room-${clinicId}-4-${ts}`, clinicId, name: 'X-Ray Room',         nameAr: 'غرفة الأشعة',   number: '104', type: 'xray',      typeAr: 'أشعة',     status: 'available', color: '#f59e0b', isActive: true },
  ];
};
