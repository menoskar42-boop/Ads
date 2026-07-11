import React from 'react';
import { Routes, Route, Navigate, Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, CalendarPlus, LogOut, Home } from 'lucide-react';
import logoImg from '@assets/Untitled_design_1772868317886.png';
import PatientPortal from '@/pages/PatientPortal';
import BookingWizard from '@/components/BookingWizard';
import AIBookingAssistant from '@/components/AIBookingAssistant';

const PatientLayout: React.FC = () => {
  const { t, language, setLanguage, isRTL } = useLanguage();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialDoctorId = searchParams.get('doctor') || undefined;
  const userName = language === 'ar' ? user?.nameAr : user?.name;
  // patientId: use user.patientId (in-memory) or user.id when role=patient (Supabase)
  const patientId = user?.patientId || (user?.role === 'patient' ? user.id : undefined);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Clinical Flow" className="h-9 w-9 rounded-lg object-cover" />
            <span className="font-semibold text-foreground hidden sm:inline">{t('app.title')}</span>
          </div>
          <nav className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="gap-1"
            >
              <Link to="/">
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">{language === 'ar' ? 'الرئيسية' : 'Home'}</span>
              </Link>
            </Button>
            <Button
              variant={location.pathname === '/patient/appointments' ? 'secondary' : 'ghost'}
              size="sm"
              asChild
              className="gap-1"
            >
              <Link to="/patient/appointments">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">{t('patient.allAppointments')}</span>
              </Link>
            </Button>
            <Button
              variant={location.pathname === '/patient/book' ? 'secondary' : 'ghost'}
              size="sm"
              asChild
              className="gap-1"
            >
              <Link to="/patient/book">
                <CalendarPlus className="h-4 w-4" />
                <span className="hidden sm:inline">{t('patient.bookAppointment')}</span>
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}>
              {language === 'en' ? 'AR' : 'EN'}
            </Button>
            <Badge variant="outline" className="hidden sm:flex">{userName}</Badge>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1 container mx-auto p-4 sm:p-6 max-w-4xl">
        <Routes>
          <Route path="/" element={<Navigate to="/patient/appointments" replace />} />
          <Route path="/appointments" element={<PatientPortal />} />
          <Route path="/book" element={<BookingWizard patientId={patientId} initialDoctorId={initialDoctorId} />} />
          <Route path="*" element={<Navigate to="/patient/appointments" replace />} />
        </Routes>
      </main>
      <AIBookingAssistant />
    </div>
  );
};

export default PatientLayout;
