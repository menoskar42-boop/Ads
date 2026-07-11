import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { PLAN_LABELS } from '@/stores/clinicStore';
import AppSidebar from '@/components/AppSidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Building2 } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';
import Dashboard from '@/pages/Dashboard';
import Patients from '@/pages/Patients';
import Appointments from '@/pages/Appointments';
import Doctors from '@/pages/Doctors';
import Services from '@/pages/Services';
import Billing from '@/pages/Billing';
import Reports from '@/pages/Reports';
import StaffManagement from '@/pages/StaffManagement';
import SpecialtyManagement from '@/pages/SpecialtyManagement';
import DoctorSchedule from '@/pages/DoctorSchedule';
import PatientProfile from '@/pages/PatientProfile';
import Settings from '@/pages/Settings';
import DocumentAudit from '@/pages/DocumentAudit';
import QueueScreen from '@/pages/QueueScreen';
import QueueManagement from '@/pages/QueueManagement';
import OffersManagement from '@/pages/OffersManagement';
import HomeVisitDashboard from '@/pages/HomeVisitDashboard';
import DoctorProfilePage from '@/pages/DoctorProfilePage';
import ClinicPublicPage from '@/pages/ClinicPublicPage';
import LabOrders from '@/pages/LabOrders';
import Inventory from '@/pages/Inventory';
import NotFound from '@/pages/NotFound';
import AIBookingAssistant from '@/components/AIBookingAssistant';
import DoctorOnboarding, { isDoctorOnboardingPending } from '@/components/DoctorOnboarding';
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
  const { user } = useAuth();
  const location = useLocation();
  const showAIBooking = AI_BOOKING_PAGES.includes(location.pathname);

  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (user?.role === 'doctor' && isDoctorOnboardingPending(user.id)) {
      setShowOnboarding(true);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const clinic     = useClinicHeader(user?.clinicId);
  const planLabel  = clinic ? PLAN_LABELS[clinic.subscriptionPlan] : null;

  return (
    <SidebarProvider>
      <div className={`flex h-screen w-full overflow-hidden ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
        <AppSidebar />

        <SidebarInset className="flex flex-col flex-1 min-w-0 overflow-hidden">
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
              <Route path="/billing"              element={<Billing />} />
              <Route path="/reports"              element={<Reports />} />
              <Route path="/staff"                element={<StaffManagement />} />
              <Route path="/schedule"             element={<DoctorSchedule />} />
              <Route path="/schedule/:doctorId"   element={<DoctorSchedule />} />
              <Route path="/offers"               element={<OffersManagement />} />
              <Route path="/home-visits"          element={<HomeVisitDashboard />} />
              <Route path="/settings"             element={<Settings />} />
              <Route path="/document-audit"       element={<DocumentAudit />} />
              <Route path="/queue-screen"         element={<QueueScreen />} />
              <Route path="/queue"                element={<QueueManagement />} />
              <Route path="/lab-orders"           element={<LabOrders />} />
              <Route path="/inventory"            element={<Inventory />} />
              <Route path="/doctor/:doctorId"     element={<DoctorProfilePage />} />
              <Route path="/clinic/:clinicId"     element={<ClinicPublicPage />} />
              <Route path="*"                     element={<NotFound />} />
            </Routes>
          </main>

        </SidebarInset>
        {showAIBooking && <AIBookingAssistant />}
      </div>

      {showOnboarding && user && (
        <DoctorOnboarding user={user} onClose={() => setShowOnboarding(false)} />
      )}
    </SidebarProvider>
  );
};

export default MainLayout;
