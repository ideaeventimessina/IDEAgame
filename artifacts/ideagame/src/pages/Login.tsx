import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/roles';
import { useI18n, LOCALES } from '@/i18n';
import { Lock, Mail } from 'lucide-react';

export default function Login() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const { locale, setLocale } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isDev = import.meta.env.DEV;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = await login(email, password);
      if (u.role === 'entertainer' || u.role === 'game_manager') navigate('/');
      else navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center rounded-2xl bg-white px-5 py-3 shadow-lg shadow-black/20" style={{ width: 176 }}>
            <img src="/logo.png" alt="IDEA Games" className="h-16 w-auto object-contain" />
          </div>
          <div className="mt-5 text-display text-3xl font-black">Bentornato</div>
          <div className="mt-1 text-sm text-muted-foreground">Accedi per gestire il tuo evento</div>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-6">
          <label className="block">
            <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Email</div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="w-full bg-transparent outline-none" autoComplete="email" />
            </div>
          </label>
          <label className="block">
            <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Password</div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-3">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" className="w-full bg-transparent outline-none" autoComplete="current-password" />
            </div>
          </label>
          {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground hover-elevate disabled:opacity-50">
            {busy ? 'Accesso…' : 'Accedi'}
          </button>
          {isDev && (
            <div className="rounded-lg bg-muted/30 p-3 text-center text-xs text-muted-foreground">
              <div className="font-semibold text-foreground">Account di test (password: <code className="text-primary">ideagame</code>)</div>
              <div className="mt-1 grid gap-0.5">
                <div>admin@ideagame.app — super admin</div>
                <div>owner@mango.events — tenant owner</div>
                <div>manager@mango.events — game manager</div>
                <div>host@mango.events — entertainer</div>
              </div>
            </div>
          )}
        </form>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          {LOCALES.map(({ code }) => (
            <button key={code} onClick={() => setLocale(code)} className={`rounded-full px-3 py-1 uppercase tracking-widest ${locale === code ? 'bg-primary/15 text-primary' : 'hover:text-foreground'}`}>{code}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
