/**
 * /live-join?s=CODE — Unified device role selector.
 * Anyone with a session code (tvCode or presenterCode) lands here
 * and picks their role: TV (proiettore), Presenter (mobile), or Regia (auth required).
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/roles';
import { Loader2, Tv2, Mic2, Radio } from 'lucide-react';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch<T = unknown>(path: string): Promise<T> {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include' });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as T;
}

interface LiveSession {
  id: string; title: string; status: string;
  currentGameSlug: string | null; currentPhase: string;
  tvCode: string; presenterCode: string;
}

function getCode() {
  return new URLSearchParams(window.location.search).get('s') ?? '';
}

const PURPLE = '#A855F7';
const BLUE   = '#60A5FA';
const GREEN  = '#34D399';

export default function LiveJoin() {
  const code = getCode();
  const [, navigate]  = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!code) { setError('Codice mancante. Usa il link fornito dall\'organizzatore.'); setLoading(false); return; }
    apiFetch<LiveSession>(`/live-sessions/by-code/${code}`)
      .then(setSession)
      .catch(() => setError('Sessione non trovata o codice non valido.'))
      .finally(() => setLoading(false));
  }, [code]);

  const goTV = () => {
    if (!session) return;
    navigate(`/live-tv?s=${session.tvCode}`);
  };

  const goPresenter = () => {
    if (!session) return;
    navigate(`/live-presenter?s=${session.presenterCode}`);
  };

  const goRegia = () => {
    if (!session) return;
    if (!authLoading && !user) {
      navigate(`/login?redirect=${encodeURIComponent(`/live-control?session=${session.id}`)}`);
      return;
    }
    navigate(`/live-control?session=${session.id}`);
  };

  const STATUS_COLOR: Record<string, string> = {
    draft: '#6B7280', active: '#34D399', paused: '#F59E0B', ended: '#EF4444',
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#09050f',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Outfit','Space Grotesk',sans-serif",
      color: '#fff',
      padding: '24px 20px',
    }}>
      {/* ambient glow */}
      <div style={{ position: 'fixed', inset: 0, background: `radial-gradient(ellipse 60% 35% at 50% 0%, ${PURPLE}0a 0%, transparent 60%)`, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>

        {/* Logo / brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Radio size={22} style={{ color: PURPLE }} />
          <span style={{ fontWeight: 900, letterSpacing: '0.12em', fontSize: '0.88rem', color: PURPLE }}>LIVE MODE</span>
        </div>

        {/* Session card */}
        {loading ? (
          <Loader2 size={32} className="animate-spin" style={{ color: PURPLE }} />
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '24px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 16 }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>❌</div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Codice non valido</div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>{error}</div>
          </div>
        ) : session ? (
          <>
            {/* Session info */}
            <div style={{ width: '100%', textAlign: 'center', padding: '18px 24px', background: `${PURPLE}0a`, border: `1px solid ${PURPLE}30`, borderRadius: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[session.status] ?? '#6B7280', boxShadow: `0 0 8px ${STATUS_COLOR[session.status] ?? '#6B7280'}` }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', color: STATUS_COLOR[session.status] ?? '#6B7280' }}>{session.status.toUpperCase()}</span>
              </div>
              <div style={{ fontWeight: 900, fontSize: '1.2rem', marginBottom: 4 }}>{session.title}</div>
              <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.38)' }}>
                {session.currentGameSlug ? `🎮 ${session.currentGameSlug}` : '🎤 standby'}
              </div>
            </div>

            {/* Title */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 900, fontSize: '1.05rem', color: 'rgba(255,255,255,0.85)' }}>Scegli il tuo ruolo</div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                Ogni dispositivo sceglie come partecipare allo show
              </div>
            </div>

            {/* Role cards */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* TV */}
              <RoleCard
                emoji={<Tv2 size={28} />}
                title="TV — Proiettore"
                desc="Schermo grande in sala. Mostra lo show al pubblico."
                color={BLUE}
                onClick={goTV}
              />

              {/* Presenter */}
              <RoleCard
                emoji={<Mic2 size={28} />}
                title="Presentatore"
                desc="Controllo show dal telefono. Avvia giochi, gestisci round."
                color={GREEN}
                onClick={goPresenter}
              />

              {/* Regia */}
              <RoleCard
                emoji={<Radio size={28} />}
                title="Regia"
                desc="Pannello completo. Richiede accesso admin."
                color={PURPLE}
                badge={!authLoading && !user ? '🔐 Login' : undefined}
                onClick={goRegia}
              />

            </div>
          </>
        ) : null}

        {/* Back */}
        {!loading && (
          <button
            onClick={() => navigate('/mode-select')}
            style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', marginTop: 4 }}
          >
            ← Menu principale
          </button>
        )}

      </div>
    </div>
  );
}

function RoleCard({
  emoji, title, desc, color, badge, onClick,
}: {
  emoji: React.ReactNode;
  title: string;
  desc: string;
  color: string;
  badge?: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '18px 20px',
        background: hovered ? `${color}18` : `${color}0a`,
        border: `1.5px solid ${hovered ? color : `${color}40`}`,
        borderRadius: 16,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.18s',
        boxShadow: hovered ? `0 0 30px ${color}22` : 'none',
        color: '#fff',
        fontFamily: "'Outfit',sans-serif",
      }}
    >
      <div style={{ color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: `${color}15`, border: `1px solid ${color}30` }}>
        {emoji}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 900, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          {title}
          {badge && (
            <span style={{ fontSize: '0.68rem', fontWeight: 800, color, background: `${color}20`, border: `1px solid ${color}40`, borderRadius: 100, padding: '1px 8px' }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.42)', marginTop: 2, lineHeight: 1.4 }}>{desc}</div>
      </div>
      <div style={{ color: `${color}80`, fontSize: '1.1rem', flexShrink: 0 }}>›</div>
    </button>
  );
}
