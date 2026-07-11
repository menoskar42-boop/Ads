import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';

export interface Permissions {
  canViewOffers: boolean;
  canViewDashboard: boolean;
  canViewPatients: boolean;
  canViewAppointments: boolean;
  canViewDoctors: boolean;
  canViewSpecialties: boolean;
  canViewServices: boolean;
  canViewBilling: boolean;
  canViewSettings: boolean;
  canViewReports: boolean;
  canViewStaffManagement: boolean;
  canViewSchedule: boolean;
  canViewDocuments: boolean;
  canUploadDocuments: boolean;
  canManageDocumentPermissions: boolean;
  canViewDocumentAudit: boolean;
  canViewQueueManagement: boolean;
  canViewHomeVisitDashboard: boolean;
  canViewInsurance: boolean;
  canViewTasks: boolean;

  canAddPatient: boolean;
  canEditPatient: boolean;
  canAddAppointment: boolean;
  canEditAppointment: boolean;
  canCheckInAppointment: boolean;
  canAddDoctor: boolean;
  canEditDoctor: boolean;
  canEditServicePrices: boolean;
  canEditServicePercentages: boolean;
  canViewFinancialReports: boolean;
  canViewDoctorIncome: boolean;
  canExportReports: boolean;
  canManageStaff: boolean;
  canManageSchedule: boolean;
}

export const usePermissions = (): Permissions => {
  const { user } = useAuth();
  const role = user?.role as UserRole | undefined;

  return {
    canViewOffers: role === 'admin',
    canViewDashboard: role !== 'patient',
    canViewPatients: role !== 'patient',
    canViewAppointments: role !== 'patient',
    canViewDoctors: role === 'admin',
    canViewSpecialties: role === 'admin',
    canViewServices: role === 'admin' || role === 'reception',
    canViewBilling: role === 'admin' || role === 'reception',
    canViewSettings: role === 'admin',
    canViewReports: role === 'admin' || role === 'doctor',
    canViewStaffManagement: role === 'admin',
    canViewSchedule: role === 'admin' || role === 'doctor',

    canAddPatient: role === 'admin' || role === 'reception',
    canEditPatient: role === 'admin' || role === 'reception',
    canAddAppointment: role === 'admin' || role === 'reception',
    canEditAppointment: role === 'admin' || role === 'reception',
    canCheckInAppointment: role === 'admin' || role === 'reception',
    canAddDoctor: role === 'admin',
    canEditDoctor: role === 'admin',
    canEditServicePrices: role === 'admin',
    canEditServicePercentages: role === 'admin',
    canViewFinancialReports: role === 'admin',
    canViewDoctorIncome: role === 'admin' || role === 'doctor',
    canExportReports: role === 'admin',
    canManageStaff: role === 'admin',
    canManageSchedule: role === 'admin',
    canViewDocuments: role === 'admin' || role === 'doctor' || role === 'reception',
    canUploadDocuments: role === 'admin' || role === 'doctor' || role === 'reception',
    canManageDocumentPermissions: role === 'admin',
    canViewDocumentAudit: role === 'admin',
    canViewQueueManagement: role === 'admin' || role === 'reception',
    canViewHomeVisitDashboard: role === 'admin' || role === 'doctor',
    canViewInsurance: role === 'admin' || role === 'reception',
    canViewTasks: role === 'admin' || role === 'reception' || role === 'doctor',
  };
};
