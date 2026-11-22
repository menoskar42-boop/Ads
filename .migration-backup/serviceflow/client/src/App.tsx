import { Switch, Route, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StickyScrollbars } from "@/components/StickyScrollbars";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import PhoneLinesEdit from "@/pages/phone-lines-edit";
import CfmApp from "@/cfm/App";
import { BASE } from "@/lib/base-path";

function Router() {
  return (
    // base = مسار الجذر لما التطبيق يتقدّم تحت مسار (oscardevs.com/serviceflow).
    // من غيره wouter بيقارن المسارات بجذر الموقع، فـ/serviceflow/login ما بيطابقش
    // /login والتطبيق بيوقع على NotFound.
    <WouterRouter base={BASE}>
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/phone-lines" component={PhoneLinesEdit} />
      {/* برنامج الكوابل (Cable-Fault-Manager) المدمج — قسم مستقل تحت /cfm */}
      <Route path="/cfm" nest component={CfmApp} />
      <Route path="/" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <StickyScrollbars />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
