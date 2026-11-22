import { lazy, Suspense, useState, useEffect, type ComponentType } from 'react';
import { maybeSendWelcome } from '@/lib/push-notifications';
import { Switch, Route, useLocation, type RouteComponentProps } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Layout } from '@/components/layout/Layout';
import { SEOHead } from '@/components/SEOHead';
import Home from '@/pages/Home';

type PageModule = { default: ComponentType<RouteComponentProps> };

function lazyPage(load: () => Promise<PageModule>): ComponentType<RouteComponentProps> {
  const Page = lazy(load);
  return function LazyPage(props: RouteComponentProps) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground" role="status">
            جارٍ تحميل الصفحة...
          </div>
        }
      >
        <Page {...props} />
      </Suspense>
    );
  };
}

const Bible = lazyPage(() => import('@/pages/Bible'));
const Plans = lazyPage(() => import('@/pages/Plans'));
const Emotions = lazyPage(() => import('@/pages/Emotions'));
const Kids = lazyPage(() => import('@/pages/Kids'));
const Service = lazyPage(() => import('@/pages/Service'));
const Family = lazyPage(() => import('@/pages/Family'));
const Highlights = lazyPage(() => import('@/pages/Highlights'));
const Premium = lazyPage(() => import('@/pages/Premium'));
const Search = lazyPage(() => import('@/pages/Search'));
const About = lazyPage(() => import('@/pages/About'));
const Privacy = lazyPage(() => import('@/pages/Privacy'));
const Contact = lazyPage(() => import('@/pages/Contact'));
const MinistryAuth = lazyPage(() => import('@/pages/MinistryAuth'));
const Groups = lazyPage(() => import('@/pages/Groups'));
const GroupCreate = lazyPage(() => import('@/pages/GroupCreate'));
const GroupJoin = lazyPage(() => import('@/pages/GroupJoin'));
const GroupInvite = lazyPage(() => import('@/pages/GroupInvite'));
const GroupView = lazyPage(() => import('@/pages/GroupView'));
const GroupMembers = lazyPage(() => import('@/pages/GroupMembers'));
const GroupChat = lazyPage(() => import('@/pages/GroupChat'));
const Churches = lazyPage(() => import('@/pages/Churches'));
const ChurchView = lazyPage(() => import('@/pages/ChurchView'));
const ChurchRequest = lazyPage(() => import('@/pages/ChurchRequest'));
const AdminDashboard = lazyPage(() => import('@/pages/AdminDashboard'));
const Terms = lazyPage(() => import('@/pages/Terms'));
const Challenge = lazyPage(() => import('@/pages/Challenge'));
const TopicPage = lazyPage(() => import('@/pages/TopicPage'));
const VideoPage = lazyPage(() => import('@/pages/VideoPage'));
const Orthodox = lazyPage(() => import('@/pages/Orthodox'));
const OrthodoxAgpeya = lazyPage(() => import('@/pages/OrthodoxAgpeya'));
const OrthodoxAgpeyaHour = lazyPage(() => import('@/pages/OrthodoxAgpeyaHour'));
const OrthodoxSynaxarium = lazyPage(() => import('@/pages/OrthodoxSynaxarium'));
const OrthodoxSynaxariumDay = lazyPage(() => import('@/pages/OrthodoxSynaxariumDay'));
const LiturgyControl = lazyPage(() => import('@/pages/LiturgyControl'));
const LiturgyDisplay = lazyPage(() => import('@/pages/LiturgyDisplay'));
const Kholagy = lazyPage(() => import('@/pages/Kholagy'));
const KholagyPro = lazyPage(() => import('@/pages/KholagyPro'));
const ExitIntelligence = lazyPage(() => import('@/pages/ExitIntelligence'));
const SharePage = lazyPage(() => import('@/pages/SharePage'));
const NotFound = lazyPage(() => import('@/pages/not-found'));
const Sitemap = lazyPage(() => import('@/pages/Sitemap'));
const DailyVersePage = lazyPage(() => import('@/pages/DailyVersePage'));

// صفحات بدون Layout (ملء الشاشة)
const FULL_SCREEN_ROUTES = ['/liturgy-display'];

function Router() {
  return (
    <Switch>
      <Route path="/liturgy-display/:slot" component={LiturgyDisplay} />
      <Route path="/liturgy-display" component={LiturgyDisplay} />
      <Route path="/liturgy-control/:slot" component={LiturgyControl} />
      <Route path="/liturgy-control" component={LiturgyControl} />
      <Route path="/" component={Home} />
      <Route path="/bible/:book/:chapter/:view" component={Bible} />
      <Route path="/bible/:book/:chapter" component={Bible} />
      <Route path="/bible/:book" component={Bible} />
      <Route path="/bible" component={Bible} />
      <Route path="/plans" component={Plans} />
      <Route path="/emotions/:type" component={Emotions} />
      <Route path="/emotions" component={Emotions} />
      <Route path="/kids/courses" component={Kids} />
      <Route path="/kids/hymns" component={Kids} />
      <Route path="/kids/videos" component={Kids} />
      <Route path="/kids/stories" component={Kids} />
      <Route path="/kids/memorize" component={Kids} />
      <Route path="/kids/games" component={Kids} />
      <Route path="/kids/adventures" component={Kids} />
      <Route path="/kids/parents" component={Kids} />
      <Route path="/kids" component={Kids} />
      <Route path="/family" component={Family} />
      <Route path="/service" component={Service} />
      <Route path="/highlights" component={Highlights} />
      <Route path="/premium" component={Premium} />
      <Route path="/search" component={Search} />
      <Route path="/about" component={About} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/contact" component={Contact} />
      <Route path="/ministry-auth" component={MinistryAuth} />
      <Route path="/groups" component={Groups} />
      <Route path="/groups/create" component={GroupCreate} />
      <Route path="/groups/join" component={GroupJoin} />
      <Route path="/invite/:code" component={GroupInvite} />
      <Route path="/group/:groupId" component={GroupView} />
      <Route path="/group/:groupId/members" component={GroupMembers} />
      <Route path="/group/:groupId/chat" component={GroupChat} />
      <Route path="/church" component={Churches} />
      <Route path="/church/:churchId" component={ChurchView} />
      <Route path="/church-request" component={ChurchRequest} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/terms" component={Terms} />
      <Route path="/challenge" component={Challenge} />
      <Route path="/topics/:slug" component={TopicPage} />
      <Route path="/video/:id" component={VideoPage} />
      <Route path="/kholagy/:liturgyId/:chapterId" component={KholagyPro} />
      <Route path="/kholagy/:liturgyId" component={KholagyPro} />
      <Route path="/kholagy" component={KholagyPro} />
      <Route path="/orthodox/kholagy/:liturgyId/:chapterId" component={KholagyPro} />
      <Route path="/orthodox/kholagy/:liturgyId" component={KholagyPro} />
      <Route path="/orthodox/kholagy" component={KholagyPro} />
      <Route path="/orthodox/agpeya/:hour" component={OrthodoxAgpeyaHour} />
      <Route path="/orthodox/agpeya" component={OrthodoxAgpeya} />
      <Route path="/orthodox/synaxarium/:monthId/:day" component={OrthodoxSynaxariumDay} />
      <Route path="/orthodox/synaxarium" component={OrthodoxSynaxarium} />
      <Route path="/orthodox/:tab" component={Orthodox} />
      <Route path="/orthodox" component={Orthodox} />
      <Route path="/admin/exit" component={ExitIntelligence} />
      <Route path="/share/:type/:id" component={SharePage} />
      <Route path="/sitemap" component={Sitemap} />
      <Route path="/daily-verse/:date" component={DailyVersePage} />
      <Route path="/daily-verse" component={DailyVersePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [isDark, setIsDark] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [location] = useLocation();

  const isFullScreen = FULL_SCREEN_ROUTES.some(r => location.startsWith(r))
    || /^\/group\/[^/]+\/chat$/.test(location); // الشات ملء الشاشة (رأس + شريط كتابة ثابتان)

  useEffect(() => {
    try {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDark(prefersDark);
      if (prefersDark) {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {
      console.log("Theme detection error:", e);
    }
  }, []);

  // إشعار ترحيبي للمشتركين عند فتح الموقع (مرة واحدة كل 24 ساعة)
  useEffect(() => {
    maybeSendWelcome();
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SEOHead />
        <Toaster />
        <SonnerToaster position="top-center" dir="rtl" />
        {isFullScreen ? (
          <Router />
        ) : (
          <Layout isPremium={isPremium} onToggleTheme={toggleTheme} isDark={isDark}>
            <Router />
          </Layout>
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
