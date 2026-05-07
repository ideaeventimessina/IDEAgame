import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n";
import { AuthProvider } from "@/auth/roles";
import { DemoSwitcher } from "@/components/DemoSwitcher";
import NotFound from "@/pages/not-found";
import Hub from "@/pages/Hub";
import GameStage from "@/pages/GameStage";
import Lobby from "@/pages/Lobby";
import Scoreboard from "@/pages/Scoreboard";
import Player from "@/pages/Player";
import AdminDashboard from "@/admin/Dashboard";
import AdminGames from "@/admin/Games";
import AdminQuizzes from "@/admin/Quizzes";
import AdminMedia from "@/admin/Media";
import AdminTeams from "@/admin/Teams";
import AdminTenants from "@/admin/Tenants";
import AdminBilling from "@/admin/Billing";
import AdminUsers from "@/admin/Users";
import AdminTranslations from "@/admin/Translations";
import AdminSettings from "@/admin/Settings";
import { Guard } from "@/admin/Guard";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Hub} />
      <Route path="/game/:slug" component={GameStage} />
      <Route path="/lobby" component={Lobby} />
      <Route path="/scoreboard" component={Scoreboard} />
      <Route path="/play" component={Player} />
      <Route path="/admin"><Guard route="/admin"><AdminDashboard /></Guard></Route>
      <Route path="/admin/games"><Guard route="/admin/games"><AdminGames /></Guard></Route>
      <Route path="/admin/quizzes"><Guard route="/admin/quizzes"><AdminQuizzes /></Guard></Route>
      <Route path="/admin/media"><Guard route="/admin/media"><AdminMedia /></Guard></Route>
      <Route path="/admin/teams"><Guard route="/admin/teams"><AdminTeams /></Guard></Route>
      <Route path="/admin/tenants"><Guard route="/admin/tenants"><AdminTenants /></Guard></Route>
      <Route path="/admin/billing"><Guard route="/admin/billing"><AdminBilling /></Guard></Route>
      <Route path="/admin/users"><Guard route="/admin/users"><AdminUsers /></Guard></Route>
      <Route path="/admin/translations"><Guard route="/admin/translations"><AdminTranslations /></Guard></Route>
      <Route path="/admin/settings"><Guard route="/admin/settings"><AdminSettings /></Guard></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
              <DemoSwitcher />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
