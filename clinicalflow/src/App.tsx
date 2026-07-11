import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import Login from "@/pages/Login";
import SuperAdminLogin from "@/pages/SuperAdminLogin";
import PatientLayout from "@/components/PatientLayout";
import MainLayout from "@/components/MainLayout";
import SuperAdmin from "@/pages/SuperAdmin";
import QueueScreen from "@/pages/QueueScreen";
import DoctorProfilePage from "@/pages/DoctorProfilePage";
import ClinicPublicPage from "@/pages/ClinicPublicPage";
import LandingPage from "@/pages/LandingPage";
import RegisterPage from "@/pages/RegisterPage";
import SearchPage from "@/pages/SearchPage";
import FeedbackForm from "@/pages/FeedbackForm";
import NotFound from "@/pages/NotFound";
import DoctorClinicalSuite from "@/pages/DoctorClinicalSuite";
import SubscriptionPlans from "@/pages/SubscriptionPlans";
import PatientCard from "@/pages/PatientCard";
import DemoSetup from "@/pages/DemoSetup";

const queryClient = new QueryClient();

const ProtectedRoutes = () => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated)             return <Navigate to="/login" replace />;
  if (user?.role === 'super_admin') return <Navigate to="/super-admin" replace />;
  if (user?.role === 'patient')     return <PatientLayout />;
  return <MainLayout />;
};

const AppRoutes = () => {
  const { isAuthenticated, user } = useAuth();

  const defaultRedirect = !isAuthenticated
    ? '/login'
    : user?.role === 'super_admin' ? '/super-admin'
    : user?.role === 'patient'     ? '/patient/appointments'
    : '/dashboard';

  return (
    <Routes>
      <Route
        path="/"
        element={
          isAuthenticated && user?.role !== 'patient'
            ? <Navigate to={defaultRedirect} replace />
            : <LandingPage />
        }
      />
      <Route path="/search"   element={<SearchPage />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to={defaultRedirect} replace /> : <RegisterPage />} />
      <Route path="/login"    element={isAuthenticated ? <Navigate to={defaultRedirect} replace /> : <Login />} />
      <Route
        path="/cf-admin-access"
        element={
          isAuthenticated && user?.role === 'super_admin'
            ? <Navigate to="/super-admin" replace />
            : <SuperAdminLogin />
        }
      />
      <Route path="/doctor/:doctorId"                element={<DoctorProfilePage />} />
      <Route path="/clinic/:clinicId"                element={<ClinicPublicPage />} />
      <Route path="/feedback/:clinicId/:patientId"   element={<FeedbackForm />} />
      <Route path="/queue-screen"                    element={<QueueScreen />} />
      <Route
        path="/super-admin"
        element={
          isAuthenticated && user?.role === 'super_admin'
            ? <SuperAdmin />
            : <Navigate to="/cf-admin-access" replace />
        }
      />
      <Route path="/pricing"           element={<SubscriptionPlans />} />
      <Route path="/my-card"           element={<PatientCard />} />
      <Route path="/clinical/:visitId" element={<DoctorClinicalSuite />} />
      <Route path="/demo-setup"        element={<DemoSetup />} />
      <Route path="/patient/*" element={<ProtectedRoutes />} />
      <Route path="/*"         element={<ProtectedRoutes />} />
      <Route path="*"          element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
