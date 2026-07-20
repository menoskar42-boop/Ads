import { useState, useEffect } from 'react';
import { maybeSendWelcome } from '@/lib/push-notifications';
import { Switch, Route, useLocation } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Layout } from '@/components/layout/Layout';
import { SEOHead } from '@/components/SEOHead';
import Home from '@/pages/Home';
import Bible from '@/pages/Bible';
import Plans from '@/pages/Plans';
import Emotions from '@/pages/Emotions';
import Kids from '@/pages/Kids';
import Service from '@/pages/Service';
import Family from '@/pages/Family';
import Highlights from '@/pages/Highlights';
import Premium from '@/pages/Premium';
import Search from '@/pages/Search';
import About from '@/pages/About';
import Privacy from '@/pages/Privacy';
import Contact from '@/pages/Contact';
import MinistryAuth from '@/pages/MinistryAuth';
import Groups from '@/pages/Groups';
import GroupCreate from '@/pages/GroupCreate';
import GroupJoin from '@/pages/GroupJoin';
import GroupInvite from '@/pages/GroupInvite';
import GroupView from '@/pages/GroupView';
import GroupMembers from '@/pages/GroupMembers';
import GroupChat from '@/pages/GroupChat';
import Churches from '@/pages/Churches';
import ChurchView from '@/pages/ChurchView';
import ChurchRequest from '@/pages/ChurchRequest';
import AdminDashboard from '@/pages/AdminDashboard';
import Terms from '@/pages/Terms';
import Challenge from '@/pages/Challenge';
import TopicPage from '@/pages/TopicPage';
import VideoPage from '@/pages/VideoPage';
import Orthodox from '@/pages/Orthodox';
import OrthodoxAgpeya from '@/pages/OrthodoxAgpeya';
import OrthodoxAgpeyaHour from '@/pages/OrthodoxAgpeyaHour';
import OrthodoxSynaxarium from '@/pages/OrthodoxSynaxarium';
import OrthodoxSynaxariumDay from '@/pages/OrthodoxSynaxariumDay';
import LiturgyControl from '@/pages/LiturgyControl';
import LiturgyDisplay from '@/pages/LiturgyDisplay';
import Kholagy from '@/pages/Kholagy';
import KholagyPro from '@/pages/KholagyPro';
import ExitIntelligence from '@/pages/ExitIntelligence';
import SharePage from '@/pages/SharePage';
import NotFound from '@/pages/not-found';
import Sitemap from '@/pages/Sitemap';
import DailyVersePage from '@/pages/DailyVersePage';

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
