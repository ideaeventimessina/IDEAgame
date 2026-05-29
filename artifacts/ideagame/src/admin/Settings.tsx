import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import { AdminLayout } from './AdminLayout';
import { useI18n, LOCALES } from '@/i18n';
import { Loader2, Save, RotateCcw, AlertTriangle } from 'lucide-react';
import {
  useListSystemSettings, useUpsertSystemSetting, getListSystemSettingsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useJonny } from '@/contexts/JonnyContext';
import { JonnyAvatar } from '@/components/JonnyAvatar';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

type SettingsValue = {
  brandColor: string;
  defaultLocale: string;
  projectionMode: boolean;
  offlineFirst: boolean;
  // Game Engine
  voteTimer: number;
  revealTimer: number;
  transitionSpeed: 'slow' | 'normal' | 'fast';
  soundVolume: number;
  musicVolume: number;
  // Dance
  balloSensitivity: number;
  // Jonny
  jonnyEnabled: boolean;
  jonnyMode: 'live' | 'home';
  jonnyVoiceEnabled: boolean;
  jonnyVoiceVolume: number;
  jonnyReactionFreq: 'low' | 'medium' | 'high';
  jonnyCanInterrupt: boolean;
};

const DEFAULTS: SettingsValue = {
  brandColor: '#F5B642',
  defaultLocale: 'it',
  projectionMode: true,
  offlineFirst: true,
  voteTimer: 10,
  revealTimer: 5,
  transitionSpeed: 'normal',
  soundVolume: 80,
  musicVolume: 60,
  balloSensitivity: 1.0,
  jonnyEnabled: false,
  jonnyMode: 'live',
  jonnyVoiceEnabled: false,
  jonnyVoiceVolume: 80,
  jonnyReactionFreq: 'medium',
  jonnyCanInterrupt: false,
};

// ── Sub-components ─────────────────────────────────────────────────────────

function SectionHeader({ emoji, title, color, children }: { emoji: string; title: string; color: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4"
        style={{ background: `linear-gradient(135deg, ${color}12, rgba(20,15,40,0.6))` }}>
        <div className="text-3xl">{emoji}</div>
        <div className="flex-1">
          <div className="text-display font-black text-sm tracking-widest uppercase" style={{ color }}>{title}</div>
        </div>
      </div>
      <div className="border-t border-border/40 px-5 py-4 space-y-5">
        {children}
      </div>
    </div>
  );
}

function SettingRow({ label, desc, where, children }: { label: string; desc: string; where?: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="font-black text-sm text-white">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</div>
        {where && (
          <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide"
            style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}>
            {where}
          </div>
        )}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, color = '#F5B642' }: { checked: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative h-7 w-12 rounded-full transition-all duration-200 focus:outline-none"
      style={{ background: checked ? color : 'rgba(255,255,255,0.12)' }}
      aria-checked={checked}
      role="switch"
    >
      <div className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200"
        style={{ transform: checked ? 'translateX(22px)' : 'translateX(4px)' }} />
    </button>
  );
}

function VolumeSlider({ value, onChange, color = '#F5B642' }: { value: number; onChange: (v: number) => void; color?: string }) {
  return (
    <div className="flex items-center gap-3 w-full">
      <span className="text-xs text-muted-foreground w-4">0</span>
      <input type="range" min={0} max={100} step={1} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: color }} />
      <span className="text-xs text-muted-foreground w-4">100</span>
      <span className="tabular-nums text-sm font-black w-8 text-right" style={{ color }}>{value}</span>
    </div>
  );
}

const BALLO_PRESETS = [
  { label: 'Soft',   value: 0.7, emoji: '🌸', desc: 'Pochi movimenti bastano' },
  { label: 'Normal', value: 1.0, emoji: '✅', desc: 'Calibrazione standard' },
  { label: 'Party',  value: 1.3, emoji: '🎉', desc: 'Serve più energia' },
  { label: 'Chaos',  value: 1.6, emoji: '🔥', desc: 'Movimenti estremi richiesti' },
] as const;

const SPEED_OPTIONS: { value: 'slow' | 'normal' | 'fast'; label: string; emoji: string }[] = [
  { value: 'slow',   label: 'Lento',   emoji: '🐢' },
  { value: 'normal', label: 'Normale', emoji: '✅' },
  { value: 'fast',   label: 'Veloce',  emoji: '⚡' },
];

const REACTION_OPTIONS: { value: 'low' | 'medium' | 'high'; label: string }[] = [
  { value: 'low',    label: 'Bassa' },
  { value: 'medium', label: 'Media' },
  { value: 'high',   label: 'Alta' },
];

// ── Main component ────────────────────────────────────────────────────────

export default function Settings() {
  const { locale, setLocale } = useI18n();
  const qc = useQueryClient();
  const { setIsHostedByJonny, setJonnyMode: setJonnyModeCtx } = useJonny();
  const { data: rows = [], isLoading } = useListSystemSettings();
  const upsert = useUpsertSystemSetting();

  const [v, setV] = useState<SettingsValue>(DEFAULTS);
  const [savedV, setSavedV] = useState<SettingsValue>(DEFAULTS);
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = JSON.stringify(v) !== JSON.stringify(savedV);

  // Load from DB
  useEffect(() => {
    const r = rows.find(r => r.key === 'tenant.settings');
    if (r && typeof r.value === 'object' && r.value !== null) {
      const stored = r.value as Partial<SettingsValue>;
      const merged: SettingsValue = { ...DEFAULTS, ...stored };
      setV(merged);
      setSavedV(merged);
      if (stored.defaultLocale) setLocale(stored.defaultLocale as Parameters<typeof setLocale>[0]);
    }
  }, [rows]);

  // Unsaved changes warning
  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (isDirty) { e.preventDefault(); e.returnValue = ''; }
  }, [isDirty]);
  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleBeforeUnload]);

  // Live brand color preview
  const previewColor = v.brandColor;

  const patch = (p: Partial<SettingsValue>) => setV(prev => ({ ...prev, ...p }));

  const onLocaleChange = (code: string) => {
    patch({ defaultLocale: code });
    setLocale(code as Parameters<typeof setLocale>[0]);
  };

  const onSave = async () => {
    setIsSaving(true);
    try {
      await upsert.mutateAsync({ data: { key: 'tenant.settings', value: v } });
      await qc.invalidateQueries({ queryKey: getListSystemSettingsQueryKey() });
      setSavedV(v);
      setIsHostedByJonny(v.jonnyEnabled);
      setJonnyModeCtx(v.jonnyMode);
      toast.success('Impostazioni salvate', { description: 'Tutte le modifiche sono state applicate.' });
    } catch (e: unknown) {
      toast.error('Errore salvataggio', { description: e instanceof Error ? e.message : 'Errore sconosciuto' });
    } finally {
      setIsSaving(false);
    }
  };

  const onReset = () => {
    setV(DEFAULTS);
    setLocale('it');
    toast('Valori di default ripristinati', { description: 'Premi Salva per confermare.' });
  };

  // ── Shake demo ────────────────────────────────────────────────────────────
  const [shakeLevel, setShakeLevel] = useState(0);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handler = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const mag = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
      const scaled = Math.min(100, (mag / 20) * 100 * v.balloSensitivity);
      setShakeLevel(scaled);
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = setTimeout(() => setShakeLevel(0), 400);
    };
    window.addEventListener('devicemotion', handler as EventListener);
    return () => window.removeEventListener('devicemotion', handler as EventListener);
  }, [v.balloSensitivity]);

  if (isLoading) {
    return (
      <AdminLayout title="Impostazioni">
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Impostazioni">
      <div className="space-y-6 pb-28">

        {/* ── 1. SHOW DEFAULTS ─────────────────────────────────────────── */}
        <SectionHeader emoji="🎤" title="Show Defaults" color="#60A5FA">

          {/* Language */}
          <div>
            <div className="font-black text-sm text-white mb-1">Lingua dell'interfaccia</div>
            <div className="text-xs text-muted-foreground mb-3">
              Cambia lingua — etichette admin, pulsanti e testi si aggiornano subito.
            </div>
            <div className="flex flex-wrap gap-2">
              {LOCALES.map(l => (
                <button key={l.code} onClick={() => onLocaleChange(l.code)}
                  className="flex-1 min-w-[80px] rounded-xl border px-3 py-2 text-sm font-bold transition-all"
                  style={{
                    borderColor: locale === l.code ? '#60A5FA' : 'rgba(255,255,255,0.12)',
                    background:  locale === l.code ? 'rgba(96,165,250,0.12)' : 'transparent',
                    color:       locale === l.code ? '#60A5FA' : 'rgba(255,255,255,0.5)',
                  }}>
                  {l.flag} · {l.label}
                </button>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Il cambio è immediato. Se una traduzione manca, viene usato l'italiano come fallback.
            </div>
          </div>

          <SettingRow
            label="Modalità Proiezione"
            desc="Migliora contrasto e peso del testo per schermi TV/proiettore."
            where="📺 Tutte le schermate proiettore">
            <Toggle checked={v.projectionMode} onChange={c => patch({ projectionMode: c })} color="#60A5FA" />
          </SettingRow>

          <SettingRow
            label="Rete Offline-First"
            desc="Avvia il gameplay anche senza connessione internet stabile."
            where="🌐 Player + GameStation">
            <Toggle checked={v.offlineFirst} onChange={c => patch({ offlineFirst: c })} color="#60A5FA" />
          </SettingRow>

        </SectionHeader>

        {/* ── 2. GAME ENGINE ───────────────────────────────────────────── */}
        <SectionHeader emoji="⚙️" title="Game Engine" color="#34D399">

          {/* Vote timer */}
          <div>
            <SettingRow
              label="Timer voto (secondi)"
              desc="Tempo di risposta per le fasi di voto: Adult Only, Percorso, Karaoke, Ballo."
              where="🗳️ Tutte le fasi voto">
              <div className="flex items-center gap-2">
                {[5, 10, 15, 20, 30].map(s => (
                  <button key={s} onClick={() => patch({ voteTimer: s })}
                    className="rounded-xl px-3 py-1.5 text-xs font-black transition-all"
                    style={{
                      background: v.voteTimer === s ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.06)',
                      color:      v.voteTimer === s ? '#34D399' : 'rgba(255,255,255,0.4)',
                      border:     `1px solid ${v.voteTimer === s ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    }}>{s}s</button>
                ))}
              </div>
            </SettingRow>
          </div>

          {/* Reveal timer */}
          <div>
            <SettingRow
              label="Timer reveal (secondi)"
              desc="Tempo di visualizzazione della risposta corretta prima di proseguire."
              where="✅ Reveal di ogni round">
              <div className="flex items-center gap-2">
                {[3, 5, 8, 10].map(s => (
                  <button key={s} onClick={() => patch({ revealTimer: s })}
                    className="rounded-xl px-3 py-1.5 text-xs font-black transition-all"
                    style={{
                      background: v.revealTimer === s ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.06)',
                      color:      v.revealTimer === s ? '#34D399' : 'rgba(255,255,255,0.4)',
                      border:     `1px solid ${v.revealTimer === s ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    }}>{s}s</button>
                ))}
              </div>
            </SettingRow>
          </div>

          {/* Transition speed */}
          <SettingRow
            label="Velocità transizioni"
            desc="Quanto velocemente le animazioni tra fasi e round si completano."
            where="🎬 Animazioni di gioco">
            <div className="flex gap-2">
              {SPEED_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => patch({ transitionSpeed: opt.value })}
                  className="rounded-xl px-3 py-1.5 text-xs font-black transition-all"
                  style={{
                    background: v.transitionSpeed === opt.value ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.06)',
                    color:      v.transitionSpeed === opt.value ? '#34D399' : 'rgba(255,255,255,0.4)',
                    border:     `1px solid ${v.transitionSpeed === opt.value ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  }}>
                  {opt.emoji} {opt.label}
                </button>
              ))}
            </div>
          </SettingRow>

          {/* Sound volumes */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-black text-sm text-white">Volume effetti sonori</div>
                  <div className="text-xs text-muted-foreground">Buzzer, countdown, punti, vittoria.</div>
                </div>
                <div className="text-[10px] rounded-full border px-2 py-0.5 font-bold" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}>🔊 Tutti i device</div>
              </div>
              <VolumeSlider value={v.soundVolume} onChange={val => patch({ soundVolume: val })} color="#34D399" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-black text-sm text-white">Volume musica di sottofondo</div>
                  <div className="text-xs text-muted-foreground">Tracce ambient durante lobby e attesa.</div>
                </div>
                <div className="text-[10px] rounded-full border px-2 py-0.5 font-bold" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}>🎵 GameStation + Lobby</div>
              </div>
              <VolumeSlider value={v.musicVolume} onChange={val => patch({ musicVolume: val })} color="#34D399" />
            </div>
          </div>

        </SectionHeader>

        {/* ── 3. DANCE ─────────────────────────────────────────────────── */}
        <SectionHeader emoji="💃" title="Sfida di Ballo — Sensibilità" color="#A78BFA">

          <div>
            <div className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Controlla quanto facilmente i giocatori accumulano energia agitando il telefono.
              Puoi modificarla anche in tempo reale dal pannello TV durante la partita.
            </div>

            {/* Presets */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {BALLO_PRESETS.map(p => {
                const active = Math.abs(v.balloSensitivity - p.value) < 0.05;
                return (
                  <button key={p.label} onClick={() => patch({ balloSensitivity: p.value })}
                    className="rounded-xl p-3 text-left transition-all"
                    style={{
                      background: active ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)',
                      border:     `2px solid ${active ? 'rgba(167,139,250,0.6)' : 'rgba(255,255,255,0.1)'}`,
                    }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{p.emoji}</span>
                      <span className="font-black text-sm" style={{ color: active ? '#A78BFA' : 'rgba(255,255,255,0.7)' }}>{p.label}</span>
                      <span className="ml-auto text-[10px] font-bold tabular-nums" style={{ color: active ? '#A78BFA' : 'rgba(255,255,255,0.3)' }}>×{p.value}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{p.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* Fine slider */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs text-muted-foreground w-10">Soft</span>
              <input type="range" min={0.5} max={2.0} step={0.05}
                value={v.balloSensitivity}
                onChange={e => patch({ balloSensitivity: parseFloat(e.target.value) })}
                className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: '#A78BFA' }} />
              <span className="text-xs text-muted-foreground w-10 text-right">Chaos</span>
              <span className="tabular-nums text-sm font-black w-12 text-right" style={{ color: '#A78BFA' }}>×{v.balloSensitivity.toFixed(2)}</span>
            </div>

            {/* Live shake indicator */}
            <div className="rounded-xl p-3" style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)' }}>
              <div className="text-[11px] font-black text-muted-foreground mb-2 tracking-widest uppercase">📱 Preview live (agita il telefono)</div>
              <div className="w-full rounded-full h-3 overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-3 rounded-full transition-all duration-150"
                  style={{ width: `${shakeLevel}%`, background: 'linear-gradient(90deg,#A78BFA,#7C3AED)', minWidth: shakeLevel > 0 ? '8px' : 0 }} />
              </div>
              <div className="mt-1.5 text-[10px] text-muted-foreground">
                Su desktop questo indicatore risponde al sensore del dispositivo mobile.
              </div>
            </div>
          </div>
        </SectionHeader>

        {/* ── 4. JONNY AI HOST ─────────────────────────────────────────── */}
        <SectionHeader emoji="🎩" title="Jonny AI Host" color="#D4AF37">

          <SettingRow
            label="Jonny attivo"
            desc="Abilita Jonny come co-host animato sui telefoni dei giocatori (onboarding, attesa, gioco, vittoria)."
            where="📱 Telefoni giocatori">
            <div className="flex items-center gap-2">
              <JonnyAvatar mood={v.jonnyEnabled ? 'excited' : 'idle'} size={36} />
              <Toggle checked={v.jonnyEnabled} onChange={c => patch({ jonnyEnabled: c })} color="#D4AF37" />
            </div>
          </SettingRow>

          {v.jonnyEnabled && (
            <>
              <SettingRow
                label="Modalità Jonny"
                desc="Live: affianca l'animatore umano. Home: è il game master autonomo della serata."
                where="🎤 Comportamento co-host">
                <div className="flex gap-2">
                  {(['live', 'home'] as const).map(m => (
                    <button key={m} onClick={() => patch({ jonnyMode: m })}
                      className="rounded-xl px-3 py-1.5 text-xs font-black transition-all"
                      style={{
                        background: v.jonnyMode === m ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.06)',
                        color:      v.jonnyMode === m ? '#D4AF37' : 'rgba(255,255,255,0.4)',
                        border:     `1px solid ${v.jonnyMode === m ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      }}>
                      {m === 'live' ? '🎤 LIVE' : '🏠 HOME'}
                    </button>
                  ))}
                </div>
              </SettingRow>

              <SettingRow
                label="Frequenza reazioni"
                desc="Quanto spesso Jonny commenta e reagisce durante il gioco."
                where="💬 Messaggi in gioco">
                <div className="flex gap-2">
                  {REACTION_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => patch({ jonnyReactionFreq: opt.value })}
                      className="rounded-xl px-3 py-1.5 text-xs font-black transition-all"
                      style={{
                        background: v.jonnyReactionFreq === opt.value ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.06)',
                        color:      v.jonnyReactionFreq === opt.value ? '#D4AF37' : 'rgba(255,255,255,0.4)',
                        border:     `1px solid ${v.jonnyReactionFreq === opt.value ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </SettingRow>

              <SettingRow
                label="Può interrompere il gioco"
                desc="Se abilitato, Jonny può mostrare messaggi durante le fasi attive (non solo in attesa)."
                where="⚡ Fasi di gioco attive">
                <Toggle checked={v.jonnyCanInterrupt} onChange={c => patch({ jonnyCanInterrupt: c })} color="#D4AF37" />
              </SettingRow>

              <SettingRow
                label="Voce di Jonny"
                desc="Abilita sintesi vocale (placeholder — non ancora collegato al modello AI)."
                where="🔊 Altoparlante giocatori">
                <Toggle checked={v.jonnyVoiceEnabled} onChange={c => patch({ jonnyVoiceEnabled: c })} color="#D4AF37" />
              </SettingRow>

              {v.jonnyVoiceEnabled && (
                <div>
                  <div className="font-black text-sm text-white mb-2">Volume voce Jonny</div>
                  <VolumeSlider value={v.jonnyVoiceVolume} onChange={val => patch({ jonnyVoiceVolume: val })} color="#D4AF37" />
                </div>
              )}

              <div className="rounded-xl px-3 py-2 text-[11px] text-muted-foreground"
                style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}>
                Attivabile via URL: <code className="font-mono" style={{ color: '#D4AF37' }}>?jonny=1</code>
                {' '}· L'AI automation è in roadmap — attualmente Jonny usa reazioni predefinite.
              </div>
            </>
          )}
        </SectionHeader>

        {/* ── 5. BRAND COLOR ───────────────────────────────────────────── */}
        <SectionHeader emoji="🎨" title="Brand Color" color={previewColor}>

          <div className="space-y-4">
            <div className="text-xs text-muted-foreground leading-relaxed">
              Il colore primario è usato su pulsanti CTA, toggle attivi, badge e tab selezionate in tutta l'interfaccia admin.
            </div>

            <div className="flex items-center gap-4">
              <input type="color" value={v.brandColor}
                onChange={e => patch({ brandColor: e.target.value })}
                className="h-12 w-20 rounded-xl cursor-pointer border-0 bg-transparent p-0.5" />
              <input value={v.brandColor}
                onChange={e => patch({ brandColor: e.target.value })}
                className="flex-1 rounded-xl border border-border bg-background/40 px-4 py-2 font-mono text-sm outline-none focus:border-primary"
                placeholder="#F5B642" />
              <button onClick={() => patch({ brandColor: DEFAULTS.brandColor })}
                className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                Default
              </button>
            </div>

            {/* Live preview */}
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">Anteprima live</div>
              <div className="flex items-center gap-3 flex-wrap">
                <button className="rounded-xl px-4 py-2 text-sm font-black text-black"
                  style={{ background: previewColor }}>
                  Salva evento
                </button>
                <div className="flex items-center gap-2">
                  <div className="relative h-7 w-12 rounded-full" style={{ background: previewColor }}>
                    <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-white shadow-md" />
                  </div>
                  <span className="text-xs" style={{ color: previewColor }}>Attivo</span>
                </div>
                <div className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: `${previewColor}22`, color: previewColor, border: `1px solid ${previewColor}44` }}>
                  Badge
                </div>
                <div className="rounded-xl px-3 py-1.5 text-xs font-bold border-b-2"
                  style={{ color: previewColor, borderColor: previewColor }}>
                  Tab attiva
                </div>
              </div>
            </div>
          </div>
        </SectionHeader>

      </div>

      {/* ── Sticky footer ─────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border"
        style={{ background: 'rgba(10,8,20,0.95)', backdropFilter: 'blur(16px)' }}>
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-4 px-6 py-4">

          {/* Dirty indicator */}
          <div className="flex items-center gap-2">
            {isDirty ? (
              <>
                <AlertTriangle className="h-4 w-4" style={{ color: '#F59E0B' }} />
                <span className="text-sm font-bold" style={{ color: '#F59E0B' }}>Modifiche non salvate</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Tutte le modifiche salvate.</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={onReset}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40">
              <RotateCcw className="h-4 w-4" />
              Reset default
            </button>
            <button onClick={onSave}
              disabled={isSaving || !isDirty}
              className="inline-flex items-center gap-2 rounded-xl px-6 py-2 text-sm font-black text-black transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
              style={{ background: isDirty ? 'linear-gradient(135deg,#F5B642,#D97706)' : 'rgba(255,255,255,0.15)', boxShadow: isDirty ? '0 0 20px rgba(245,182,66,0.4)' : 'none' }}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? 'Salvataggio…' : 'Salva impostazioni'}
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
