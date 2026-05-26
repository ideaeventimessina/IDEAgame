import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n";
import { AuthProvider } from "@/auth/roles";
import { BackToCockpit } from "@/components/BackToCockpit";
import NotFound from "@/pages/not-found";
import Hub from "@/pages/Hub";
import GameStage from "@/pages/GameStage";
import Lobby from "@/pages/Lobby";
import Scoreboard from "@/pages/Scoreboard";
import Player from "@/pages/Player";
import Splash from "@/pages/Splash";
import LanguageSelect from "@/pages/LanguageSelect";
import TenantSelect from "@/pages/TenantSelect";
import LoginPage from "@/pages/Login";
import EventSetup from "@/pages/EventSetup";
import LiveControl from "@/pages/LiveControl";
import Demo from "@/pages/Demo";
import GameCoppie from "@/pages/GameCoppie";
import GameQuizzone from "@/pages/GameQuizzone";
import GamePercorso from "@/pages/GamePercorso";
import SerataCompleta from "@/pages/SerataCompleta";
import AdminPercorsoRisate from "@/admin/PercorsoRisate";
import JonnyCreator from "@/admin/JonnyCreator";
import AdminAdultOnly from "@/admin/AdultOnly";
import GameAdultOnly from "@/pages/GameAdultOnly";
import AdminBallo from "@/admin/Ballo";
import GameBallo from "@/pages/GameBallo";
import AdminWordBack from "@/admin/WordBack";
import GameWordBack from "@/pages/GameWordBack";
import AdminKaraoke from "@/admin/KaraokeBattle";
import AdminEvents from "@/admin/Events";
import GameKaraoke from "@/pages/GameKaraoke";
import AdminFreestyle from "@/admin/FreestyleBattle";
import GameFreestyle from "@/pages/GameFreestyle";
import AdminSaraMusica from "@/admin/SaraMusica";
import GameSaraMusica from "@/pages/GameSaraMusica";
import Permissions from "@/pages/Permissions";
import AdminSystem from "@/admin/System";
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
import AdminCardSets from "@/admin/CardSets";
import AdminQuizPacks from "@/admin/QuizPacks";
import AdminAudioSettings from "@/admin/AudioSettings";
import AdminAudit from "@/admin/Audit";
import AdminJonnyPoses from "@/admin/JonnyPoses";
import HomeGame from "@/pages/HomeGame";
import HomeJoin from "@/pages/HomeJoin";
import HomeSetupPage from "@/pages/HomeSetupPage";
import HomeLobbyPage from "@/pages/HomeLobbyPage";
import JoinPage from "@/pages/JoinPage";
import Cockpit from "@/pages/Cockpit";
import { Guard } from "@/admin/Guard";
import { AudioUnlockFab } from "@/components/AudioUnlockFab";
import { JonnyProvider } from "@/contexts/JonnyContext";
import { AudioProvider } from "@/contexts/AudioContext";
import { AudioOrchestratorProvider } from "@/contexts/AudioOrchestrator";
import { PresenterModeProvider } from "@/contexts/PresenterModeContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Presenter from "@/pages/Presenter";
import PresenterLive from "@/pages/PresenterLive";
import ProjectorStandby from "@/pages/ProjectorStandby";
import DevTest from "@/pages/DevTest";
import HomeV2 from "@/pages/HomeV2";
import HomeV3 from "@/pages/HomeV3";
import HomeV4 from "@/pages/HomeV4";
import HomeV5 from "@/pages/HomeV5";
import ModeSelect from "@/pages/ModeSelect";
import HomeRoom from "@/pages/HomeRoom";

const queryClient = new QueryClient();

// ── Root redirect guard ───────────────────────────────────────────────────────
// Public entry: "/" must ALWAYS land on /home-v4.
// Uses window.location.replace (hard, synchronous) so the redirect fires
// before any auth/query state resolves — no async useEffect race condition,
// no browser history entry left at "/" that Safari could restore.
// The ONLY exception is the projector/public-event mode (?e=JOIN_CODE).
function RootRoute() {
  const params = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const isProjector = !!params.get('e');
  if (isProjector) return <Hub />;
  // Hard redirect — synchronous, bypasses wouter & auth state entirely.
  if (typeof window !== 'undefined') {
    window.location.replace('/home-v4');
  }
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRoute} />
      <Route path="/projector" component={ProjectorStandby} />
      {/* LEGACY — prototype routes, unreachable from active UI, pending deletion */}
      <Route path="/dev-test" component={DevTest} />
      <Route path="/home-v2" component={HomeV2} />
      <Route path="/home-v3" component={HomeV3} />
      <Route path="/home-v4" component={HomeV4} />
      <Route path="/home-v5" component={HomeV5} />
      <Route path="/home-room" component={HomeRoom} />
      {/* END LEGACY */}
      <Route path="/mode-select" component={ModeSelect} />
      <Route path="/cockpit" component={Cockpit} />
      <Route path="/splash" component={Splash} />
      <Route path="/language" component={LanguageSelect} />
      <Route path="/tenant" component={TenantSelect} />
      <Route path="/login" component={LoginPage} />
      <Route path="/event-setup" component={EventSetup} />
      <Route path="/control" component={LiveControl} />
      <Route path="/demo" component={Demo} />
      <Route path="/coppie" component={GameCoppie} />
      <Route path="/quizzone" component={GameQuizzone} />
      <Route path="/percorso-risate" component={GamePercorso} />
      <Route path="/serata-completa" component={SerataCompleta} />
      <Route path="/adult-only" component={GameAdultOnly} />
      <Route path="/sfida-ballo" component={GameBallo} />
      <Route path="/parola-alle-spalle" component={GameWordBack} />
      <Route path="/karaoke-battle" component={GameKaraoke} />
      <Route path="/freestyle-battle" component={GameFreestyle} />
      <Route path="/saramusica" component={GameSaraMusica} />
      <Route path="/game/:slug" component={GameStage} />
      <Route path="/lobby" component={Lobby} />
      <Route path="/scoreboard" component={Scoreboard} />
      <Route path="/play" component={Player} />
      <Route path="/play/permissions" component={Permissions} />
      <Route path="/home-setup" component={HomeSetupPage} />
      <Route path="/home-lobby/:code" component={HomeLobbyPage} />
      <Route path="/join/:code" component={JoinPage} />
      <Route path="/home" component={HomeGame} />
      <Route path="/home/join" component={HomeJoin} />
      <Route path="/presenter-live" component={PresenterLive} />
      <Route path="/presenter" component={PresenterLive} />
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
      <Route path="/admin/system"><Guard route="/admin/system"><AdminSystem /></Guard></Route>
      <Route path="/admin/card-sets"><Guard route="/admin/card-sets"><AdminCardSets /></Guard></Route>
      <Route path="/admin/quiz-packs"><Guard route="/admin/quiz-packs"><AdminQuizPacks /></Guard></Route>
      <Route path="/admin/percorso-risate"><Guard route="/admin/percorso-risate"><AdminPercorsoRisate /></Guard></Route>
      <Route path="/admin/jonny-creator"><Guard route="/admin/jonny-creator"><JonnyCreator /></Guard></Route>
      <Route path="/admin/adult-only"><Guard route="/admin/adult-only"><AdminAdultOnly /></Guard></Route>
      <Route path="/admin/sfida-ballo"><Guard route="/admin/sfida-ballo"><AdminBallo /></Guard></Route>
      <Route path="/admin/parola-alle-spalle"><Guard route="/admin/parola-alle-spalle"><AdminWordBack /></Guard></Route>
      <Route path="/admin/events"><Guard route="/admin/events"><AdminEvents /></Guard></Route>
      <Route path="/admin/karaoke-battle"><Guard route="/admin/karaoke-battle"><AdminKaraoke /></Guard></Route>
      <Route path="/admin/freestyle-battle"><Guard route="/admin/freestyle-battle"><AdminFreestyle /></Guard></Route>
      <Route path="/admin/saramusica"><Guard route="/admin/saramusica"><AdminSaraMusica /></Guard></Route>
      <Route path="/admin/audio"><Guard route="/admin/audio"><AdminAudioSettings /></Guard></Route>
      <Route path="/admin/audit"><Guard route="/admin/audit"><AdminAudit /></Guard></Route>
      <Route path="/admin/jonny-poses"><Guard route="/admin/jonny-poses"><AdminJonnyPoses /></Guard></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <PresenterModeProvider>
          <JonnyProvider>
            <AudioProvider>
            <AudioOrchestratorProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
                <BackToCockpit />
                <AudioUnlockFab />
              </WouterRouter>
              {/* Debug version badge */}
              <div className="fixed bottom-2 right-2 z-[9999] select-none pointer-events-none">
                <div style={{ background:'rgba(0,0,0,0.75)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:6, padding:'2px 8px', fontFamily:'monospace', fontSize:10, color:'rgba(255,255,255,0.5)', lineHeight:1.5 }}>
                  <div>{__COMMIT_HASH__}</div>
                  <div>{__BUILD_DATE__}</div>
                </div>
              </div>
              <Toaster />
            </TooltipProvider>
            </AudioOrchestratorProvider>
            </AudioProvider>
          </JonnyProvider>
          </PresenterModeProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
