import { createStore } from './createStore';
import { userStore } from './userStore';
import { homeVisitScheduleStore } from './homeVisitScheduleStore';
import { clinicStore } from './clinicStore';
import { doctorClinicStore } from './doctorClinicStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type HVRequestStatus =
  | 'pending'
  | 'sent_to_doctor'
  | 'approved'
  | 'rejected'
  | 'completed';

export interface DispatchEntry {
  doctorId: string;
  sentAt: string;
  respondedAt?: string;
  response?: 'approved' | 'rejected';
}

export interface HomeVisitRequest {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  governorate: string;
  governorateAr: string;
  address: string;
  latitude?: number;
  longitude?: number;
  preferredDay: string;   // YYYY-MM-DD
  preferredTime: string;  // HH:MM
  notes?: string;
  status: HVRequestStatus;
  currentDoctorId?: string;
  assignedDoctorId?: string;
  doctorQueue: string[];
  dispatchHistory: DispatchEntry[];
  createdAt: string;
  updatedAt: string;
}

// ─── Egyptian Governorates ────────────────────────────────────────────────────

export { EGYPT_GOVERNORATES as GOVERNORATES } from '@/lib/governorates';

// ─── Haversine Distance ────────────────────────────────────────────────────────

function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Dispatch Algorithm ────────────────────────────────────────────────────────

export function buildDoctorQueue(
  governorate: string,
  preferredDay: string,
  patientLat?: number,
  patientLng?: number
): string[] {
  const dayOfWeek = new Date(preferredDay + 'T12:00:00').getDay();

  const eligible = userStore
    .filter(u => u.role === 'doctor' && u.isActive && u.homeVisitEnabled)
    .filter(doc => {
      // Must serve the governorate (area match)
      const areas = (doc.homeVisitAreas || []).map(a => a.toLowerCase());
      const gov = governorate.toLowerCase();
      const areaMatch = areas.some(a =>
        a.includes(gov) || gov.includes(a) ||
        // also match sub-areas: Nasr City / Heliopolis are in Cairo
        CAIRO_SUB_AREAS.some(sub =>
          (sub.area.toLowerCase() === a || sub.area.toLowerCase().includes(a)) &&
          sub.governorate.toLowerCase() === gov
        )
      ) || areas.includes(gov);
      // Also check city-level match (clinic city = governorate)
      const clinicLinks = doctorClinicStore.filter(l => l.doctorId === doc.id && l.isActive);
      const clinicIds = clinicLinks.length > 0 ? clinicLinks.map(l => l.clinicId) : [doc.clinicId];
      const cityMatch = clinicIds.some(cid => {
        const clinic = clinicStore.get(c => c.id === cid);
        return clinic?.city?.toLowerCase() === gov || clinic?.city?.toLowerCase().includes(gov.slice(0, 4));
      });
      return areaMatch || cityMatch;
    })
    .filter(doc => {
      // Must have schedule on that day of week
      const hasHvDay = homeVisitScheduleStore.filter(
        s => s.doctorId === doc.id && s.dayOfWeek === dayOfWeek && s.isActive
      ).length > 0;
      return hasHvDay;
    });

  // Sort: by GPS distance if available, else by area match count
  const scored = eligible.map(doc => {
    let distKm = Infinity;
    if (patientLat !== undefined && patientLng !== undefined) {
      const clinicLinks = doctorClinicStore.filter(l => l.doctorId === doc.id && l.isActive);
      const clinicIds = clinicLinks.length > 0 ? clinicLinks.map(l => l.clinicId) : [doc.clinicId];
      for (const cid of clinicIds) {
        const clinic = clinicStore.get(c => c.id === cid);
        if (clinic?.latitude && clinic?.longitude) {
          const d = haversineKm(patientLat, patientLng, clinic.latitude, clinic.longitude);
          if (d < distKm) distKm = d;
        }
      }
      // Fallback: use homeVisitRadiusKm as a relevance factor
      if (distKm === Infinity) distKm = 50 - (doc.homeVisitRadiusKm || 10);
    } else {
      // Rank by radius descending (larger radius = more likely to serve)
      distKm = 100 - (doc.homeVisitRadiusKm || 10);
    }
    return { doctorId: doc.id, distKm };
  });

  scored.sort((a, b) => a.distKm - b.distKm);
  return scored.map(s => s.doctorId);
}

// Sub-areas of Cairo governorate (for matching)
const CAIRO_SUB_AREAS = [
  { area: 'Nasr City', governorate: 'Cairo' },
  { area: 'Heliopolis', governorate: 'Cairo' },
  { area: 'Maadi', governorate: 'Cairo' },
  { area: 'Zamalek', governorate: 'Cairo' },
  { area: 'Ain Shams', governorate: 'Cairo' },
  { area: 'Shubra', governorate: 'Cairo' },
  { area: 'Matariya', governorate: 'Cairo' },
  { area: 'Rehab City', governorate: 'Cairo' },
  { area: 'New Cairo', governorate: 'Cairo' },
  { area: 'Fifth Settlement', governorate: 'Cairo' },
  { area: 'Katameya', governorate: 'Cairo' },
];

// ─── Seed Data ─────────────────────────────────────────────────────────────────

const now = new Date();
const today = now.toISOString().split('T')[0];
const tomorrow = new Date(now);
tomorrow.setDate(now.getDate() + 1);
const tomorrowStr = tomorrow.toISOString().split('T')[0];

const seed: HomeVisitRequest[] = [
  {
    id: 'hvr-1',
    patientId: 'u-p1',
    patientName: 'Mohamed Ali',
    patientPhone: '01012345678',
    governorate: 'Cairo',
    governorateAr: 'القاهرة',
    address: '14 Omar Ibn El-Khattab St, Nasr City',
    preferredDay: tomorrowStr,
    preferredTime: '10:00',
    status: 'sent_to_doctor',
    currentDoctorId: 'u-2',
    doctorQueue: ['u-2', 'u-hv1'],
    dispatchHistory: [
      { doctorId: 'u-2', sentAt: new Date(now.getTime() - 2 * 60000).toISOString() },
    ],
    createdAt: new Date(now.getTime() - 5 * 60000).toISOString(),
    updatedAt: new Date(now.getTime() - 2 * 60000).toISOString(),
  },
  {
    id: 'hvr-2',
    patientId: 'u-p2',
    patientName: 'Fatma Hassan',
    patientPhone: '01098765432',
    governorate: 'Cairo',
    governorateAr: 'القاهرة',
    address: '22 Makram Ebeid, Nasr City',
    preferredDay: today,
    preferredTime: '18:00',
    notes: 'Child, 7 years old. Fever and sore throat.',
    status: 'approved',
    currentDoctorId: 'u-hv1',
    assignedDoctorId: 'u-hv1',
    doctorQueue: ['u-hv1', 'u-2'],
    dispatchHistory: [
      {
        doctorId: 'u-hv1',
        sentAt: new Date(now.getTime() - 30 * 60000).toISOString(),
        respondedAt: new Date(now.getTime() - 25 * 60000).toISOString(),
        response: 'approved',
      },
    ],
    createdAt: new Date(now.getTime() - 35 * 60000).toISOString(),
    updatedAt: new Date(now.getTime() - 25 * 60000).toISOString(),
  },
  {
    id: 'hvr-3',
    patientId: 'u-p3',
    patientName: 'Amira Nasser',
    patientPhone: '01123456789',
    governorate: 'Cairo',
    governorateAr: 'القاهرة',
    address: '5 Nozha St, Heliopolis',
    preferredDay: tomorrowStr,
    preferredTime: '19:00',
    notes: 'Blood pressure check needed.',
    status: 'rejected',
    doctorQueue: ['u-2', 'u-hv1'],
    dispatchHistory: [
      {
        doctorId: 'u-2',
        sentAt: new Date(now.getTime() - 3 * 60 * 60000).toISOString(),
        respondedAt: new Date(now.getTime() - 2.8 * 60 * 60000).toISOString(),
        response: 'rejected',
      },
      {
        doctorId: 'u-hv1',
        sentAt: new Date(now.getTime() - 2.7 * 60 * 60000).toISOString(),
        respondedAt: new Date(now.getTime() - 2.5 * 60 * 60000).toISOString(),
        response: 'rejected',
      },
    ],
    createdAt: new Date(now.getTime() - 3.5 * 60 * 60000).toISOString(),
    updatedAt: new Date(now.getTime() - 2.5 * 60 * 60000).toISOString(),
  },
];

// ─── Store ────────────────────────────────────────────────────────────────────

export const homeVisitRequestStore = createStore<HomeVisitRequest>(seed, 'cf_home_visit_requests');

// ─── CRUD Actions ─────────────────────────────────────────────────────────────

export function createHomeVisitRequest(
  data: Omit<HomeVisitRequest, 'id' | 'status' | 'doctorQueue' | 'dispatchHistory' | 'createdAt' | 'updatedAt' | 'currentDoctorId' | 'assignedDoctorId'>
): HomeVisitRequest {
  const queue = buildDoctorQueue(
    data.governorate,
    data.preferredDay,
    data.latitude,
    data.longitude
  );
  const nowIso = new Date().toISOString();
  const firstDoctor = queue[0];
  const request: HomeVisitRequest = {
    ...data,
    id: `hvr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    status: firstDoctor ? 'sent_to_doctor' : 'pending',
    currentDoctorId: firstDoctor,
    doctorQueue: queue,
    dispatchHistory: firstDoctor
      ? [{ doctorId: firstDoctor, sentAt: nowIso }]
      : [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  return homeVisitRequestStore.add(request);
}

export function approveRequest(requestId: string, doctorId: string) {
  const nowIso = new Date().toISOString();
  homeVisitRequestStore.update(
    r => r.id === requestId,
    (r): HomeVisitRequest => ({
      ...r,
      status: 'approved',
      assignedDoctorId: doctorId,
      dispatchHistory: r.dispatchHistory.map(e =>
        e.doctorId === doctorId && !e.respondedAt
          ? { ...e, respondedAt: nowIso, response: 'approved' as const }
          : e
      ),
      updatedAt: nowIso,
    })
  );
}

export function rejectRequest(requestId: string, doctorId: string) {
  const nowIso = new Date().toISOString();
  const req = homeVisitRequestStore.get(r => r.id === requestId);
  if (!req) return;

  const updatedHistory = req.dispatchHistory.map(e =>
    e.doctorId === doctorId && !e.respondedAt
      ? { ...e, respondedAt: nowIso, response: 'rejected' as const }
      : e
  );

  const currentIndex = req.doctorQueue.indexOf(doctorId);
  const nextDoctorId = req.doctorQueue[currentIndex + 1];

  if (nextDoctorId) {
    homeVisitRequestStore.update(r => r.id === requestId, {
      status: 'sent_to_doctor',
      currentDoctorId: nextDoctorId,
      dispatchHistory: [
        ...updatedHistory,
        { doctorId: nextDoctorId, sentAt: nowIso },
      ],
      updatedAt: nowIso,
    });
  } else {
    homeVisitRequestStore.update(r => r.id === requestId, {
      status: 'rejected',
      currentDoctorId: undefined,
      dispatchHistory: updatedHistory,
      updatedAt: nowIso,
    });
  }
}

export function completeRequest(requestId: string) {
  homeVisitRequestStore.update(r => r.id === requestId, {
    status: 'completed',
    updatedAt: new Date().toISOString(),
  });
}

export function getRequestsForDoctor(doctorId: string): HomeVisitRequest[] {
  return homeVisitRequestStore.filter(
    r => r.currentDoctorId === doctorId ||
         r.assignedDoctorId === doctorId ||
         r.dispatchHistory.some(e => e.doctorId === doctorId)
  );
}

export function getPendingForDoctor(doctorId: string): HomeVisitRequest[] {
  return homeVisitRequestStore.filter(
    r => r.status === 'sent_to_doctor' && r.currentDoctorId === doctorId
  );
}
