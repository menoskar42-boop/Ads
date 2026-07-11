import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useModules } from '@/hooks/useModules';
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
  ListOrdered, Building2, User, Tag, Home, Activity, Landmark,
  FlaskConical, Package, ShieldPlus, ClipboardList, DoorOpen, Bot, CreditCard,
  MessageSquare, BookOpen, Bell, MapPin, Pill, Users2, BarChart2, ShieldAlert, GitBranch, Webhook, PhoneCall, ScanLine, Megaphone, BrainCircuit, TrendingUp,
} from 'lucide-react';
import logoImg from '@assets/Untitled_design_1772868317886.png';

const AppSidebar: React.FC = () => {
  const { t, language, isRTL } = useLanguage();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const permissions = usePermissions();
  const { modules } = useModules(user?.clinicId);
  const collapsed = state === 'collapsed';

  const role = user?.role;
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isDoctor = role === 'doctor';

  type NavItem = { icon: React.ElementType; label: string; path: string; show?: boolean };

  // Doctor: minimal focused set (7 items max)
  const doctorItems: NavItem[] = [
    { icon: LayoutDashboard, label: 'nav.dashboard',      path: '/dashboard',       show: permissions.canViewDashboard },
    { icon: Users,           label: 'nav.patients',       path: '/patients',        show: permissions.canViewPatients },
    { icon: Calendar,        label: 'nav.appointments',   path: '/appointments',    show: permissions.canViewAppointments },
    { icon: Clock,           label: 'doctors.schedule',   path: '/schedule',        show: permissions.canViewSchedule },
    { icon: Pill,            label: 'nav.drugDatabase',   path: '/drug-database',   show: true },
    { icon: BookOpen,        label: 'nav.medicalLibrary', path: '/medical-library', show: true },
    { icon: Settings,        label: 'nav.settings',       path: '/settings',        show: permissions.canViewSettings },
  ].filter(i => i.show !== false);

  // Single unified queue entry (replaces 3 separate queue items)
  const queueItem: NavItem = { icon: ListOrdered, label: 'nav.queueManagement', path: '/queue', show: permissions.canViewQueueManagement };

  // Admin/Reception: organised into 4 grouped sections
  const navGroups = isDoctor ? [] : [
    {
      labelEn: 'Operations',
      labelAr: 'العمليات',
      items: [
        { icon: LayoutDashboard, label: 'nav.dashboard',    path: '/dashboard',    show: permissions.canViewDashboard },
        { icon: Users,           label: 'nav.patients',     path: '/patients',     show: permissions.canViewPatients },
        { icon: Calendar,        label: 'nav.appointments', path: '/appointments', show: permissions.canViewAppointments },
        queueItem,
        { icon: Receipt,         label: 'nav.billing',      path: '/billing',      show: permissions.canViewBilling },
        { icon: CreditCard,      label: 'nav.installments', path: '/installments', show: permissions.canViewBilling },
      ].filter(i => i.show),
    },
    {
      labelEn: 'Management',
      labelAr: 'الإدارة',
      items: [
        { icon: Stethoscope,  label: 'nav.doctors',         path: '/doctors',      show: permissions.canViewDoctors },
        { icon: Clock,        label: 'doctors.schedule',    path: '/schedule',     show: permissions.canViewSchedule },
        { icon: Megaphone,    label: 'nav.campaigns',       path: '/campaigns',     show: permissions.canViewPatients },
        { icon: TrendingUp,   label: 'nav.growthEngine',    path: '/growth-engine', show: permissions.canViewPatients && isAdmin },
        { icon: FolderKanban, label: 'nav.specialties',     path: '/specialties',  show: permissions.canViewSpecialties },
        { icon: HeartPulse,   label: 'nav.services',        path: '/services',     show: permissions.canViewServices },
        { icon: Tag,          label: 'nav.offers',          path: '/offers',       show: permissions.canViewOffers },
        { icon: Home,         label: 'nav.homeVisits',      path: '/home-visits',  show: permissions.canViewHomeVisitDashboard },
        { icon: UserCog,      label: 'nav.staffManagement', path: '/staff',        show: permissions.canViewStaffManagement },
        { icon: Users2,       label: 'nav.hrPayroll',       path: '/hr',           show: role === 'admin' },
        { icon: DoorOpen,     label: 'nav.rooms',           path: '/rooms',        show: permissions.canViewDashboard && isAdmin },
      ].filter(i => i.show),
    },
    {
      labelEn: 'Analytics',
      labelAr: 'التحليلات',
      items: [
        { icon: BrainCircuit, label: 'nav.revenueIntel',   path: '/revenue-intel',   show: (permissions.canViewFinancialReports || permissions.canViewBilling) && modules.finance },
        { icon: Landmark,     label: 'nav.finance',         path: '/finance',         show: (permissions.canViewFinancialReports || permissions.canViewBilling) && modules.finance },
        { icon: BarChart3,    label: 'nav.reports',         path: '/reports',         show: permissions.canViewReports && modules.reports },
        { icon: BarChart2,    label: 'nav.analytics',       path: '/analytics',       show: permissions.canViewReports && modules.reports },
        { icon: Activity,     label: 'nav.financialAudit',  path: '/financial-audit', show: isAdmin },
        { icon: ShieldAlert,  label: 'nav.auditLog',        path: '/audit-log',       show: permissions.canViewDocumentAudit },
      ].filter(i => i.show),
    },
    {
      labelEn: 'More',
      labelAr: 'المزيد',
      items: [
        { icon: FlaskConical,  label: 'nav.labOrders',      path: '/lab-orders',     show: permissions.canViewBilling },
        { icon: Package,       label: 'nav.inventory',      path: '/inventory',      show: permissions.canViewBilling && modules.inventory },
        { icon: ShieldPlus,    label: 'nav.insurance',      path: '/insurance',      show: permissions.canViewInsurance && modules.insurance },
        { icon: ClipboardList, label: 'nav.tasks',          path: '/tasks',          show: permissions.canViewTasks },
        { icon: MessageSquare, label: 'nav.communication',  path: '/communication',  show: permissions.canViewPatients },
        { icon: Bell,          label: 'nav.reminders',      path: '/reminders',      show: permissions.canViewBilling },
        { icon: BookOpen,      label: 'nav.medicalLibrary', path: '/medical-library',show: permissions.canViewReports },
        { icon: Pill,          label: 'nav.drugDatabase',   path: '/drug-database',  show: permissions.canViewBilling },
        { icon: MapPin,        label: 'nav.attendance',     path: '/attendance',     show: permissions.canViewDashboard },
        { icon: Shield,        label: 'nav.documentAudit',  path: '/document-audit', show: permissions.canViewDocumentAudit },
        { icon: PhoneCall,     label: 'nav.callCenter',     path: '/call-center',    show: permissions.canViewAppointments },
        { icon: GitBranch,     label: 'nav.branches',       path: '/branches',       show: isAdmin },
        { icon: Webhook,       label: 'nav.apiDocs',        path: '/api-docs',       show: isAdmin },
        { icon: Bot,           label: 'nav.chatbot',        path: '/chatbot',        show: role === 'admin' },
        { icon: CreditCard,    label: 'nav.subscription',   path: '/subscription',   show: isAdmin },
        { icon: Settings,      label: 'nav.settings',       path: '/settings',       show: permissions.canViewSettings },
      ].filter(i => i.show),
    },
  ].filter(g => g.items.length > 0);

  // Flat list used for active-state detection in collapsed mode
  const menuItems = isDoctor ? doctorItems : navGroups.flatMap(g => g.items);

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
      'nav.smartQueue':      { en: 'Smart Queue',     ar: 'الطابور الذكي' },
      'nav.checkinScan':     { en: 'QR Check-in',    ar: 'تسجيل QR' },
      'nav.campaigns':       { en: 'Campaigns',      ar: 'الحملات' },
      'nav.revenueIntel':    { en: 'Revenue Intel',  ar: 'ذكاء الإيرادات' },
      'nav.finance':         { en: 'Finance',         ar: 'المالية' },
      'doctors.schedule':    { en: 'Schedule',         ar: 'الجدول' },
      'nav.doctors':         { en: 'Doctors',          ar: 'الأطباء' },
      'nav.specialties':     { en: 'Specialties',      ar: 'التخصصات' },
      'nav.services':        { en: 'Services',         ar: 'الخدمات' },
      'nav.offers':          { en: 'Offers',           ar: 'العروض' },
      'nav.homeVisits':      { en: 'Home Visits',      ar: 'الزيارات المنزلية' },
      'nav.labOrders':       { en: 'Lab Orders',       ar: 'المعامل' },
      'nav.inventory':       { en: 'Inventory',        ar: 'المخزن' },
      'nav.insurance':       { en: 'Insurance',        ar: 'التأمين' },
      'nav.tasks':           { en: 'Tasks',            ar: 'المهام' },
      'nav.billing':         { en: 'Billing',          ar: 'الفواتير' },
      'nav.reports':         { en: 'Reports',          ar: 'التقارير' },
      'nav.analytics':       { en: 'BI Analytics',     ar: 'التحليلات الذكية' },
      'nav.auditLog':        { en: 'Audit Log',        ar: 'سجل المراجعة' },
      'nav.financialAudit':  { en: 'Financial Monitor', ar: 'مراقبة مالية' },
      'nav.communication':   { en: 'Communication',    ar: 'التواصل' },
      'nav.reminders':       { en: 'Reminders',        ar: 'التذكيرات' },
      'nav.medicalLibrary':  { en: 'Medical Library',  ar: 'المكتبة الطبية' },
      'nav.attendance':      { en: 'Attendance',       ar: 'الحضور والانصراف' },
      'nav.staffManagement': { en: 'Staff',            ar: 'الموظفون' },
      'nav.documentAudit':   { en: 'Document Audit',   ar: 'سجل المستندات' },
      'nav.drugDatabase':    { en: 'Drug Database',    ar: 'قاعدة الأدوية' },
      'nav.hrPayroll':       { en: 'HR & Payroll',     ar: 'الموارد البشرية' },
      'nav.branches':        { en: 'Branches',         ar: 'الفروع' },
      'nav.apiDocs':         { en: 'API & Integrations', ar: 'API والتكاملات' },
      'nav.callCenter':      { en: 'Call Center',       ar: 'مركز الحجز' },
      'nav.growthEngine':    { en: 'Growth Engine',     ar: 'محرك النمو' },
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
        {(() => {
          const renderItem = (item: NavItem) => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
            return (
              <SidebarMenuItem key={item.path} className="relative">
                {isActive && (
                  <div className={cn('absolute inset-y-1 w-0.5 rounded-full bg-primary z-10', isRTL ? 'right-0' : 'left-0')} />
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
          };

          if (isDoctor) {
            return (
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>{doctorItems.map(renderItem)}</SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          return navGroups.map(group => (
            <SidebarGroup key={group.labelEn}>
              {!collapsed && (
                <div className="px-3 pt-3 pb-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 select-none">
                    {language === 'ar' ? group.labelAr : group.labelEn}
                  </span>
                </div>
              )}
              <SidebarGroupContent>
                <SidebarMenu>{group.items.map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ));
        })()}
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
