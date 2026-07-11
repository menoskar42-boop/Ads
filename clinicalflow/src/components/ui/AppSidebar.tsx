import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard, Users, Calendar, Stethoscope, HeartPulse,
  Receipt, BarChart3, LogOut, ChevronLeft, ChevronRight,
  UserCog, Clock, Settings, FolderKanban, Shield,
  ListOrdered, Building2, User, Tag, Home,
  FlaskConical, Package,
} from 'lucide-react';
import logoImg from '@assets/Untitled_design_1772868317886.png';

const AppSidebar: React.FC = () => {
  const { t, language, isRTL } = useLanguage();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const permissions = usePermissions();
  const collapsed = state === 'collapsed';

  const menuItems = [
    { icon: LayoutDashboard, label: 'nav.dashboard',       path: '/dashboard',      show: permissions.canViewDashboard },
    { icon: Users,           label: 'nav.patients',        path: '/patients',       show: permissions.canViewPatients },
    { icon: Calendar,        label: 'nav.appointments',    path: '/appointments',   show: permissions.canViewAppointments },
    { icon: ListOrdered,     label: 'nav.queueManagement', path: '/queue',          show: permissions.canViewQueueManagement },
    { icon: Clock,           label: 'doctors.schedule',    path: '/schedule',       show: permissions.canViewSchedule },
    { icon: Stethoscope,     label: 'nav.doctors',         path: '/doctors',        show: permissions.canViewDoctors },
    { icon: FolderKanban,    label: 'nav.specialties',     path: '/specialties',    show: permissions.canViewSpecialties },
    { icon: HeartPulse,      label: 'nav.services',        path: '/services',       show: permissions.canViewServices },
    { icon: Tag,             label: 'nav.offers',          path: '/offers',         show: permissions.canViewOffers },
    { icon: Home,            label: 'nav.homeVisits',      path: '/home-visits',    show: permissions.canViewHomeVisitDashboard },
    { icon: FlaskConical,    label: 'nav.labOrders',       path: '/lab-orders',     show: permissions.canViewBilling },
    { icon: Package,         label: 'nav.inventory',       path: '/inventory',      show: permissions.canViewBilling },
    { icon: Receipt,         label: 'nav.billing',         path: '/billing',        show: permissions.canViewBilling },
    { icon: BarChart3,       label: 'nav.reports',         path: '/reports',        show: permissions.canViewReports },
    { icon: UserCog,         label: 'nav.staffManagement', path: '/staff',          show: permissions.canViewStaffManagement },
    { icon: Shield,          label: 'nav.documentAudit',   path: '/document-audit', show: permissions.canViewDocumentAudit },
    { icon: Settings,        label: 'nav.settings',        path: '/settings',       show: permissions.canViewSettings },
  ].filter(item => item.show);

  const userName = language === 'ar' ? user?.nameAr : user?.name;
  const initials  = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':  return 'default';
      case 'doctor': return 'secondary';
      default:       return 'outline';
    }
  };

  // Translation helper with fallback
  const getLabel = (key: string) => {
    const map: Record<string, { en: string; ar: string }> = {
      'nav.dashboard':       { en: 'Dashboard',        ar: 'لوحة التحكم' },
      'nav.patients':        { en: 'Patients',         ar: 'المرضى' },
      'nav.appointments':    { en: 'Appointments',     ar: 'المواعيد' },
      'nav.queueManagement': { en: 'Queue',            ar: 'قائمة الانتظار' },
      'doctors.schedule':    { en: 'Schedule',         ar: 'الجدول' },
      'nav.doctors':         { en: 'Doctors',          ar: 'الأطباء' },
      'nav.specialties':     { en: 'Specialties',      ar: 'التخصصات' },
      'nav.services':        { en: 'Services',         ar: 'الخدمات' },
      'nav.offers':          { en: 'Offers',           ar: 'العروض' },
      'nav.homeVisits':      { en: 'Home Visits',      ar: 'الزيارات المنزلية' },
      'nav.labOrders':       { en: 'Lab Orders',       ar: 'المعامل' },
      'nav.inventory':       { en: 'Inventory',        ar: 'المخزن' },
      'nav.billing':         { en: 'Billing',          ar: 'الفواتير' },
      'nav.reports':         { en: 'Reports',          ar: 'التقارير' },
      'nav.staffManagement': { en: 'Staff',            ar: 'الموظفون' },
      'nav.documentAudit':   { en: 'Document Audit',   ar: 'سجل المستندات' },
      'nav.settings':        { en: 'Settings',         ar: 'الإعدادات' },
    };
    const entry = map[key];
    if (!entry) return t(key);
    return language === 'ar' ? entry.ar : entry.en;
  };

  return (
    <Sidebar
      collapsible="icon"
      side={isRTL ? 'right' : 'left'}
      className="border-sidebar-border"
    >
      {/* ── Logo / Title ─────────────────────────────────────────────────── */}
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={logoImg} alt="ClinicFlow" className="h-10 w-10 rounded-lg object-cover shrink-0" />
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="font-semibold text-sm text-sidebar-foreground truncate">
                {t('app.title')}
              </h1>
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location.pathname === item.path ||
                  (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
                return (
                  <SidebarMenuItem key={item.path} className="relative">
                    {isActive && (
                      <div
                        className={cn(
                          'absolute inset-y-1 w-0.5 rounded-full bg-primary z-10',
                          isRTL ? 'right-0' : 'left-0',
                        )}
                      />
                    )}
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={collapsed ? getLabel(item.label) : undefined}
                      className={cn('w-full', isRTL ? 'pr-3' : 'pl-3')}
                    >
                      <Link to={item.path} className="flex items-center gap-3">
                        <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-sidebar-foreground/60')} />
                        {!collapsed && (
                          <span className={cn('text-sm truncate', isActive ? 'font-medium text-sidebar-foreground' : 'text-sidebar-foreground/80')}>
                            {getLabel(item.label)}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <SidebarFooter className="p-3 border-t border-sidebar-border">
        {!collapsed && user && (
          <div className="flex items-center gap-2 mb-3 px-1">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{userName}</p>
              <Badge variant={getRoleBadgeVariant(user.role)} className="text-[10px] h-4 px-1 mt-0.5">
                {user.role}
              </Badge>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn('gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground', collapsed ? 'w-full justify-center px-2' : 'flex-1')}
            onClick={logout}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="text-xs">{t('nav.logout')}</span>}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-sidebar-foreground/50 hover:text-sidebar-foreground"
            onClick={toggleSidebar}
          >
            {(isRTL ? !collapsed : collapsed)
              ? <ChevronRight className="h-4 w-4" />
              : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
