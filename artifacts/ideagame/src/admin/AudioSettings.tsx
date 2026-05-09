import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { Volume2, VolumeX, Music, Zap, RotateCcw, Play, Square } from 'lucide-react';
import { useAudioSettings } from '@/contexts/AudioContext';
import { AudioManager } from '@/audio/AudioManager';

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-36 shrink-0 text-sm font-semibold text-muted-foreground">{label}</span>
      <input
        type="range" min={0} max={100} step={1}
        value={Math.round(value * 100)}
        onChange={e => onChange(Number(e.target.value) / 100)}
        className="flex-1 accent-primary h-2 rounded-full cursor-pointer"
      />
      <span className="w-10 text-right text-sm font-mono tabular-nums">{Math.round(value * 100)}%</span>
    </div>
  );
}

function Toggle({ label, description, enabled, onToggle }: { label: string; description: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <div>
        <div className="text-sm font-bold">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <button onClick={onToggle}
        className={`relative h-7 w-12 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}

export default function AudioSettingsPage() {
  const { settings, setMasterVolume, setMusicVolume, setSfxVolume, toggleMusic, toggleSfx, toggleMute, resetDefaults } = useAudioSettings();
  const [testPlaying, setTestPlaying] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  async function testSound(type: string, label: string) {
    setTestMsg(`Test: ${label}…`);
    setTestPlaying(true);
    await AudioManager.playStinger('global', type);
    setTimeout(() => { setTestPlaying(false); setTestMsg(''); }, 3000);
  }

  function testLoop(slug: string, type: string, label: string) {
    setTestMsg(`Loop test: ${label}`);
    setTestPlaying(true);
    void AudioManager.playLoop(slug, type);
    setTimeout(() => { AudioManager.stopLoop(); setTestPlaying(false); setTestMsg(''); }, 5000);
  }

  return (
    <AdminLayout title="Audio Engine">
      <div className="mx-auto max-w-2xl space-y-8">

        {/* Mute globale */}
        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-display text-xl font-black flex items-center gap-2">
              {settings.muted ? <VolumeX className="h-5 w-5 text-destructive" /> : <Volume2 className="h-5 w-5 text-primary" />}
              Controllo Master
            </h2>
            <button onClick={toggleMute}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${settings.muted ? 'bg-destructive/20 text-destructive border border-destructive/30' : 'bg-card border border-border hover:bg-accent'}`}>
              {settings.muted ? <><VolumeX className="h-4 w-4" /> Audio muto</> : <><Volume2 className="h-4 w-4" /> Audio attivo</>}
            </button>
          </div>

          <div className="space-y-4">
            <Slider label="Volume Master" value={settings.masterVolume} onChange={setMasterVolume} />
            <Slider label="Volume Musica" value={settings.musicVolume} onChange={setMusicVolume} />
            <Slider label="Volume Effetti" value={settings.sfxVolume} onChange={setSfxVolume} />
          </div>
        </section>

        {/* Toggle on/off */}
        <section className="space-y-3">
          <h2 className="text-display text-lg font-black flex items-center gap-2">
            <Music className="h-4 w-4 text-primary" /> Canali
          </h2>
          <Toggle
            label="Musica di sottofondo"
            description="Loop ambientali per ogni gioco"
            enabled={settings.musicEnabled}
            onToggle={toggleMusic}
          />
          <Toggle
            label="Effetti sonori"
            description="Stinger per match, risposte, countdown"
            enabled={settings.sfxEnabled}
            onToggle={toggleSfx}
          />
        </section>

        {/* Test sound */}
        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-display text-lg font-black flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" /> Test Audio
          </h2>
          {testMsg && (
            <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-bold text-primary">
              {testMsg}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { label: 'Applausi', slug: 'global', type: 'applause', loop: false },
              { label: 'Suspense', slug: 'global', type: 'suspense', loop: false },
              { label: 'Vincitore', slug: 'global', type: 'winner_stinger', loop: false },
              { label: 'Corretto ✓', slug: 'global', type: 'correct_stinger', loop: false },
              { label: 'Sbagliato ✗', slug: 'global', type: 'wrong_stinger', loop: false },
              { label: 'Whoosh →', slug: 'global', type: 'transition_whoosh', loop: false },
              { label: 'Hub loop', slug: 'hub', type: 'lobby_loop', loop: true },
              { label: 'Quizzone loop', slug: 'quizzone', type: 'round_loop', loop: true },
              { label: 'Ballo loop', slug: 'sfida-ballo', type: 'round_loop', loop: true },
            ].map(({ label, slug, type, loop }) => (
              <button key={`${slug}-${type}`} disabled={testPlaying}
                onClick={() => loop ? testLoop(slug, type, label) : void testSound(type, label)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold hover:bg-accent disabled:opacity-50 transition-colors">
                <Play className="h-3 w-3" /> {label}
              </button>
            ))}
          </div>
          <button disabled={!testPlaying} onClick={() => { AudioManager.stopAll(); setTestPlaying(false); setTestMsg(''); }}
            className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-bold text-destructive disabled:opacity-30 hover:bg-destructive/20 transition-colors">
            <Square className="h-3.5 w-3.5" /> Stop tutto
          </button>
        </section>

        {/* File placeholder info */}
        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 space-y-2">
          <div className="text-sm font-bold text-amber-400">Struttura file audio</div>
          <div className="font-mono text-xs text-muted-foreground leading-relaxed">
            /public/audio/jonny-world/<br />
            &nbsp;&nbsp;global/ &nbsp;&nbsp;→ applause.mp3, correct_stinger.mp3, …<br />
            &nbsp;&nbsp;hub/ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ lobby_loop.mp3<br />
            &nbsp;&nbsp;quizzone/ → round_loop.mp3, tension_loop.mp3, …<br />
            &nbsp;&nbsp;gioco-coppie/ → lobby_loop.mp3, …<br />
            &nbsp;&nbsp;… (una cartella per gioco)
          </div>
          <div className="text-xs text-muted-foreground">
            Se un file manca, il gioco continua senza audio. Carica i file .mp3 nelle rispettive cartelle.
          </div>
        </section>

        {/* Reset */}
        <div className="flex justify-end">
          <button onClick={resetDefaults}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-bold hover:bg-accent transition-colors">
            <RotateCcw className="h-3.5 w-3.5" /> Ripristina default
          </button>
        </div>

      </div>
    </AdminLayout>
  );
}
