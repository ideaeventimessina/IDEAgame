import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/roles';
import { useI18n, LOCALES } from '@/i18n';
import { USERS } from '@/data/mock';
import { Lock, Mail, Sparkles } from 'lucide-react';

export default function Login() {
  const [, navigate] = useLocation();
  const { setRole, setCurrentUserId } = useAuth();
  const { locale, setLocale } = useI18n();
  const [email, setEmail] = useState('entertainer@mango.events');
  const [password, setPassword] = useState('demo');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = USERS.find(u => u.email === email) ?? USERS[0]!;
    setCurrentUserId(u.id);
    setRole(u.role);
    if (u.role === 'entertainer' || u.role === 'game_manager') navigate('/');
    else navigate('/admin');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="hex-logo mx-auto grid h-16 w-16 place-items-center bg-gradient-to-br from-primary to-accent">
            <span className="text-display text-2xl font-black text-primary-foreground">I</span>
          </div>
          <div className="mt-4 text-display text-3xl font-black">Bentornato</div>
          <div className="mt-1 text-sm text-muted-foreground">Accedi per gestire il tuo evento</div>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-6">
          <label className="block">
            <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Email</div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="w-full bg-transparent outline-none" />
            </div>
          </label>
          <label className="block">
            <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Password</div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-3">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" className="w-full bg-transparent outline-none" />
            </div>
          </label>
          <button type="submit" className="w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground hover-elevate">Accedi</button>
          <button type="button" className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-semibold hover-elevate">
            <Sparkles className="h-4 w-4" /> Invia magic link
          </button>
          <div className="text-center text-xs text-muted-foreground">
            Demo: usa una qualsiasi email da <code className="text-primary">USERS</code>, password <code className="text-primary">demo</code>
          </div>
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
