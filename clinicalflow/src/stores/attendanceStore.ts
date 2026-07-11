import { createStore } from './createStore';

export type AttendanceAction = 'check_in' | 'check_out';

export interface AttendanceRecord {
  id: string;
  clinicId: string;
  userId: string;
  userName: string;
  userNameAr: string;
  userRole: string;
  action: AttendanceAction;
  latitude?: number;
  longitude?: number;
  accuracy?: number;       // meters
  distanceFromClinic?: number; // meters
  isWithinRange: boolean;
  timestamp: string;
  note?: string;
}

export interface ClinicLocation {
  clinicId: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;    // allowed check-in radius (e.g. 200m)
}

export const attendanceStore = createStore<AttendanceRecord>([], 'cf_attendance');
export const clinicLocationStore = createStore<ClinicLocation>([], 'cf_clinic_location');
