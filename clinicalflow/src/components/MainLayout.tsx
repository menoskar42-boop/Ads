import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useInactivityLogout } from '@/hooks/useInactivityLogout';
const PLAN_LABELS: Record<string, { en: string; ar: string; color: string }> = {
  basic: { en: 'Basic', ar: 'أساسي', color: 'bg-muted text-muted-foreground' },
  pro:   { en: 'Pro',   ar: 'احترافي', color: 'bg-chart-1/10 text-chart-1' },
  ai:    { en: 'AI',    ar: 'ذكاء اصطناعي', color: 'bg-primary/10 text-primary' },
};
import AppSidebar from '@/components/AppSidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Building2, GitBranch } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';
import {
  getBranchesForClinic,
  getActiveBranchId,
  setActiveBranchId,
  seedDemoBranches,
  Branch,
} from '@/stores/branchStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Dashboard from '@/pages/Dashboard';
import Patients from '@/pages/Patients';
import Appointments from '@/pages/Appointments';
import Doctors from '@/pages/Doctors';
import Services from '@/pages/Services';
import Billing from '@/pages/Billing';
import Reports from '@/pages/Reports';
import BIDashboard from '@/pages/BIDashboard';
import AuditLog from '@/pages/AuditLog';
import StaffManagement from '@/pages/StaffManagement';
import SpecialtyManagement from '@/pages/SpecialtyManagement';
import DoctorSchedule from '@/pages/DoctorSchedule';
import PatientProfile from '@/pages/PatientProfile';
import Settings from '@/pages/Settings';
import DocumentAudit from '@/pages/DocumentAudit';
import QueueScreen from '@/pages/QueueScreen';
import QueueManagement from '@/pages/QueueManagement';
import SmartQueue from '@/pages/SmartQueue';
import FinanceDashboard from '@/pages/FinanceDashboard';
import OffersManagement from '@/pages/OffersManagement';
import HomeVisitDashboard from '@/pages/HomeVisitDashboard';
import DoctorProfilePage from '@/pages/DoctorProfilePage';
import ClinicPublicPage from '@/pages/ClinicPublicPage';
import LabOrders from '@/pages/LabOrders';
import FinancialAuditDashboard from '@/pages/FinancialAuditDashboard';
import Inventory from '@/pages/Inventory';
import Insurance from '@/pages/Insurance';
import Tasks from '@/pages/Tasks';
import PatientCommunication from '@/pages/PatientCommunication';
import MedicalLibrary from '@/pages/MedicalLibrary';
import Reminders from '@/pages/Reminders';
import Attendance from '@/pages/Attendance';
import DrugDatabase from '@/pages/DrugDatabase';
import HRPayroll from '@/pages/HRPayroll';
import DoctorClinicalSuite from '@/pages/DoctorClinicalSuite';
import RoomManagement from '@/pages/RoomManagement';
import ChatbotManager from '@/pages/ChatbotManager';
import SubscriptionPlans from '@/pages/SubscriptionPlans';
import BranchManagement from '@/pages/BranchManagement';
import ApiDocs from '@/pages/ApiDocs';
import CallCenter from '@/pages/CallCenter';
import GrowthEngine from '@/pages/GrowthEngine';
import CheckInScan from '@/pages/CheckInScan';
import CampaignManager from '@/pages/CampaignManager';
import RevenueIntelligence from '@/pages/RevenueIntelligence';
import Installments from '@/pages/Installments';
import ModuleGuard from '@/components/ModuleGuard';
import NotFound from '@/pages/NotFound';
import AIBookingAssistant from '@/components/AIBookingAssistant';
import NetworkStatusBanner from '@/components/NetworkStatusBanner';
import { getToken } from '@/utils/authToken';

const API = '/api';
const AI_BOOKING_PAGES = ['/dashboard', '/patients', '/appointments'];

interface ClinicHeader {
  name: string;
  nameAr: string;
  subscriptionPlan: string;
}

function useClinicHeader(clinicId: string | undefined | null) {
  const [clinic, setClinic] = useState<ClinicHeader | null>(null);

  useEffect(() => {
    if (!clinicId) return;
    const token = getToken();
    if (!token) return;
    fetch(`${API}/auth/clinics/${clinicId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setClinic({ name: data.name, nameAr: data.name_ar, subscriptionPlan: data.subscription_plan });
      })
      .catch(() => {});
  }, [clinicId]);

  return clinic;
}

const MainLayout: React.FC = () => {
  const { language, setLanguage, isRTL } = useLanguage();
  const { user, logout, isAuthenticated } = useAuth();
  const location = useLocation();
  useInactivityLogout(isAuthenticated, () => logout('timeout'));
  const showAIBooking = AI_BOOKING_PAGES.includes(location.pathname);

  const clinic     = useClinicHeader(user?.clinicId);
  const planLabel  = clinic ? PLAN_LABELS[clinic.subscriptionPlan] : null;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranch] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.clinicId || user.role === 'patient') return;
    seedDemoBranches(user.clinicId);
    const list = getBranchesForClinic(user.clinicId);
    setBranches(list);
    if (list.length > 1) {
      const stored = getActiveBranchId();
      setActiveBranch(stored && list.find(b => b.id === stored) ? stored : list[0].id);
    }
  }, [user?.clinicId, user?.role]);

  const handleBranchChange = (id: string) => {
    setActiveBranchId(id);
    setActiveBranch(id);
  };

  return (
    <SidebarProvider>
      <div className={`flex h-screen w-full overflow-hidden ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
        <AppSidebar />

        <SidebarInset className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <NetworkStatusBanner />
          {/* ── Top Header ── */}
          <header className="flex h-14 items-center gap-2 border-b px-4 shrink-0">
            <SidebarTrigger className="shrink-0" />
            <Separator orientation="vertical" className="h-5 shrink-0" />

            {clinic && (
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium text-foreground truncate hidden sm:block">
                  {language === 'ar' ? clinic.nameAr : clinic.name}
                </span>
                {planLabel && (
                  <Badge className={`text-xs shrink-0 hidden md:flex ${planLabel.color}`}>
                    {planLabel[language as 'en' | 'ar']}
                  </Badge>
                )}
              </div>
            )}

            {branches.length > 1 && (
              <div className="flex items-center gap-1.5 ml-2">
                <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Select value={activeBranchId ?? ''} onValueChange={handleBranchChange}>
                  <SelectTrigger className="h-7 text-xs border-dashed w-36 sm:w-44">
                    <SelectValue placeholder={language === 'ar' ? 'اختر الفرع' : 'Select branch'} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id} className="text-xs">
                        {language === 'ar' ? b.nameAr || b.name : b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex-1" />
            <NotificationBell />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            >
              {language === 'en' ? 'AR' : 'EN'}
            </Button>
          </header>

          {/* ── Page Content ── */}
          <main className="flex-1 overflow-auto p-4 sm:p-6 w-full max-w-full">
            <Routes>
              <Route path="/"                     element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard"            element={<Dashboard />} />
              <Route path="/patients"             element={<Patients />} />
              <Route path="/patients/:id"         element={<PatientProfile />} />
              <Route path="/appointments"         element={<Appointments />} />
              <Route path="/doctors"              element={<Doctors />} />
              <Route path="/specialties"          element={<SpecialtyManagement />} />
              <Route path="/services"             element={<Services />} />
              <Route path="/billing"              element={<ModuleGuard module="finance"><Billing /></ModuleGuard>} />
              <Route path="/installments"        element={<ModuleGuard module="finance"><Installments /></ModuleGuard>} />
              <Route path="/reports"              element={<ModuleGuard module="reports"><Reports /></ModuleGuard>} />
              <Route path="/analytics"            element={<ModuleGuard module="reports"><BIDashboard /></ModuleGuard>} />
              <Route path="/audit-log"            element={<AuditLog />} />
              <Route path="/financial-audit"      element={<FinancialAuditDashboard />} />
              <Route path="/staff"                element={<StaffManagement />} />
              <Route path="/schedule"             element={<DoctorSchedule />} />
              <Route path="/schedule/:doctorId"   element={<DoctorSchedule />} />
              <Route path="/offers"               element={<OffersManagement />} />
              <Route path="/home-visits"          element={<HomeVisitDashboard />} />
              <Route path="/settings"             element={<Settings />} />
              <Route path="/document-audit"       element={<DocumentAudit />} />
              <Route path="/queue-screen"         element={<QueueScreen />} />
              <Route path="/queue"                element={<QueueManagement />} />
              <Route path="/smart-queue"         element={<SmartQueue />} />
              <Route path="/finance"             element={<ModuleGuard module="finance"><FinanceDashboard /></ModuleGuard>} />
              <Route path="/lab-orders"           element={<LabOrders />} />
              <Route path="/inventory"            element={<ModuleGuard module="inventory"><Inventory /></ModuleGuard>} />
              <Route path="/insurance"            element={<ModuleGuard module="insurance"><Insurance /></ModuleGuard>} />
              <Route path="/tasks"               element={<Tasks />} />
              <Route path="/communication"       element={<PatientCommunication />} />
              <Route path="/medical-library"     element={<MedicalLibrary />} />
              <Route path="/reminders"           element={<Reminders />} />
              <Route path="/attendance"          element={<Attendance />} />
              <Route path="/drug-database"       element={<DrugDatabase />} />
              <Route path="/hr"                  element={<HRPayroll />} />
              <Route path="/rooms"               element={<RoomManagement />} />
              <Route path="/chatbot"             element={<ChatbotManager />} />
              <Route path="/subscription"        element={<SubscriptionPlans />} />
              <Route path="/branches"            element={<BranchManagement />} />
              <Route path="/api-docs"            element={<ApiDocs />} />
              <Route path="/call-center"         element={<CallCenter />} />
              <Route path="/checkin-scan"         element={<CheckInScan />} />
              <Route path="/campaigns"            element={<CampaignManager />} />
              <Route path="/growth-engine"        element={<GrowthEngine />} />
              <Route path="/revenue-intel"        element={<ModuleGuard module="finance"><RevenueIntelligence /></ModuleGuard>} />
              <Route path="/doctor/:doctorId"     element={<DoctorProfilePage />} />
              <Route path="/clinic/:clinicId"     element={<ClinicPublicPage />} />
              <Route path="*"                     element={<NotFound />} />
            </Routes>
          </main>

        </SidebarInset>
        {showAIBooking && <AIBookingAssistant />}
      </div>
    </SidebarProvider>
  );
};

export default MainLayout;
