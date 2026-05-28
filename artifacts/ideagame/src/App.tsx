import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n";
import { AuthProvider } from "@/auth/roles";
import { BackToCockpit } from "@/components/BackToCockpit";
import NotFound from "@/pages/not-found";
import { Guard } from "@/admin/Guard";
import { AudioUnlockFab } from "@/components/AudioUnlockFab";
import { JonnyProvider } from "@/contexts/JonnyContext";
import { AudioProvider } from "@/contexts/AudioContext";
import { AudioOrchestratorProvider } from "@/contexts/AudioOrchestrator";
import { PresenterModeProvider } from "@/contexts/PresenterModeContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IS_PS4 } from "@/hooks/useLowPower";

// Apply PS4 classes immediately (before any render) so CSS vars take effect
if (IS_PS4 && typeof document !== 'undefined') {
  document.documentElement.classList.add('ps4-browser');
  document.body.classList.add('ps4-mode');
}

// ── Static imports: tiny shell pages needed immediately ───────────────────────
import Hub from "@/pages/Hub";
import HomeV4 from "@/pages/HomeV4";
import ModeSelect from "@/pages/ModeSelect";
import Splash from "@/pages/Splash";
import LanguageSelect from "@/pages/LanguageSelect";
import TenantSelect from "@/pages/TenantSelect";
import LoginPage from "@/pages/Login";
import Cockpit from "@/pages/Cockpit";
import ProjectorStandby from "@/pages/ProjectorStandby";

// ── Lazy imports: heavy pages loaded on demand ────────────────────────────────
// Home Mode (the PS4 critical path)
const HomeGame       = lazy(() => import("@/pages/HomeGame"));
const HomeJoin       = lazy(() => import("@/pages/HomeJoin"));
const HomeSetupPage  = lazy(() => import("@/pages/HomeSetupPage"));
const HomeLobbyPage  = lazy(() => import("@/pages/HomeLobbyPage"));
const JoinPage       = lazy(() => import("@/pages/JoinPage"));

// Game boards (event/party mode)
const GameStage      = lazy(() => import("@/pages/GameStage"));
const Lobby          = lazy(() => import("@/pages/Lobby"));
const Scoreboard     = lazy(() => import("@/pages/Scoreboard"));
const Player         = lazy(() => import("@/pages/Player"));
const Permissions    = lazy(() => import("@/pages/Permissions"));
const GameCoppie     = lazy(() => import("@/pages/GameCoppie"));
const GameQuizzone   = lazy(() => import("@/pages/GameQuizzone"));
const GamePercorso   = lazy(() => import("@/pages/GamePercorso"));
const SerataCompleta = lazy(() => import("@/pages/SerataCompleta"));
const GameAdultOnly  = lazy(() => import("@/pages/GameAdultOnly"));
const GameBallo      = lazy(() => import("@/pages/GameBallo"));
const GameWordBack   = lazy(() => import("@/pages/GameWordBack"));
const GameKaraoke    = lazy(() => import("@/pages/GameKaraoke"));
const GameFreestyle  = lazy(() => import("@/pages/GameFreestyle"));
const GameSaraMusica = lazy(() => import("@/pages/GameSaraMusica"));

// Misc
const LiveControl    = lazy(() => import("@/pages/LiveControl"));
const EventSetup     = lazy(() => import("@/pages/EventSetup"));
const Demo           = lazy(() => import("@/pages/Demo"));
const DevTest        = lazy(() => import("@/pages/DevTest"));
const Presenter      = lazy(() => import("@/pages/Presenter"));
const PresenterLive  = lazy(() => import("@/pages/PresenterLive"));

// Admin (never needed on PS4 / player devices)
const AdminDashboard      = lazy(() => import("@/admin/Dashboard"));
const AdminGames          = lazy(() => import("@/admin/Games"));
const AdminQuizzes        = lazy(() => import("@/admin/Quizzes"));
const AdminMedia          = lazy(() => import("@/admin/Media"));
const AdminTeams          = lazy(() => import("@/admin/Teams"));
const AdminTenants        = lazy(() => import("@/admin/Tenants"));
const AdminBilling        = lazy(() => import("@/admin/Billing"));
const AdminUsers          = lazy(() => import("@/admin/Users"));
const AdminTranslations   = lazy(() => import("@/admin/Translations"));
const AdminSettings       = lazy(() => import("@/admin/Settings"));
const AdminSystem         = lazy(() => import("@/admin/System"));
const AdminCardSets       = lazy(() => import("@/admin/CardSets"));
const AdminQuizPacks      = lazy(() => import("@/admin/QuizPacks"));
const AdminPercorsoRisate = lazy(() => import("@/admin/PercorsoRisate"));
const JonnyCreator        = lazy(() => import("@/admin/JonnyCreator"));
const AdminAdultOnly      = lazy(() => import("@/admin/AdultOnly"));
const AdminBallo          = lazy(() => import("@/admin/Ballo"));
const AdminWordBack       = lazy(() => import("@/admin/WordBack"));
const AdminEvents         = lazy(() => import("@/admin/Events"));
const AdminKaraoke        = lazy(() => import("@/admin/KaraokeBattle"));
const AdminFreestyle      = lazy(() => import("@/admin/FreestyleBattle"));
const AdminSaraMusica     = lazy(() => import("@/admin/SaraMusica"));
const AdminAudioSettings  = lazy(() => import("@/admin/AudioSettings"));
const AdminAudit          = lazy(() => import("@/admin/Audit"));
const AdminJonnyPoses     = lazy(() => import("@/admin/JonnyPoses"));
const AdminContentPacks   = lazy(() => import("@/admin/ContentPacks"));

// ── Page loading fallback ─────────────────────────────────────────────────────
function PageFallback() {
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#030010', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: 14,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎮</div>
        <div>Caricamento…</div>
      </div>
    </div>
  );
}

const queryClient = new QueryClient();

// ── Root redirect guard ───────────────────────────────────────────────────────
function RootRoute() {
  const params = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const isProjector = !!params.get('e');
  if (isProjector) return <Hub />;
  if (typeof window !== 'undefined') {
    window.location.replace('/home-v4');
  }
  return null;
}

function Router() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Switch>
        <Route path="/" component={RootRoute} />
        <Route path="/projector" component={ProjectorStandby} />
        <Route path="/home-v4" component={HomeV4} />
        <Route path="/dev-test" component={DevTest} />
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
        <Route path="/presenter" component={Presenter} />
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
        <Route path="/admin/content-packs"><Guard route="/admin/content-packs"><AdminContentPacks /></Guard></Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
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
              {import.meta.env.DEV && (
                <div className="fixed bottom-2 right-2 z-[9999] select-none pointer-events-none flex flex-col items-end gap-1">
                  {IS_PS4 && (
                    <div style={{ background:'rgba(245,182,66,0.18)', border:'1px solid rgba(245,182,66,0.6)', borderRadius:6, padding:'2px 8px', fontFamily:'monospace', fontSize:10, color:'#F5B642', lineHeight:1.5, fontWeight:700 }}>
                      ⬛ PS4 MODE ACTIVE
                    </div>
                  )}
                  <div style={{ background:'rgba(0,0,0,0.75)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:6, padding:'2px 8px', fontFamily:'monospace', fontSize:10, color:'rgba(255,255,255,0.5)', lineHeight:1.5 }}>
                    <div>{__COMMIT_HASH__}</div>
                    <div>{__BUILD_DATE__}</div>
                  </div>
                </div>
              )}
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
