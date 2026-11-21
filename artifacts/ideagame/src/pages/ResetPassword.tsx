/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Password dimenticata / nuova password.
   - /reset-password            → chiede l'email e fa partire il link (POST /api/auth/password/forgot)
   - /reset-password?token=...  → sceglie la nuova password (POST /api/auth/password/reset) */

import { useState } from 'react';
import { Link } from 'wouter';
import { Lock, Mail } from 'lucide-react';

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok, data };
}

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [conferma, setConferma] = useState('');
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);

  const chiediLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrore(null); setBusy(true);
    try {
      const { ok, data } = await postJson('/api/auth/password/forgot', { email });
      if (!ok) setErrore(String(data['error'] ?? 'Richiesta non riuscita.'));
      else setFatto(String(data['messaggio'] ?? 'Controlla la tua email.'));
    } catch { setErrore('Rete non raggiungibile, riprova.'); }
    finally { setBusy(false); }
  };

  const salva = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrore(null);
    if (password !== conferma) { setErrore('Le due password non coincidono.'); return; }
    setBusy(true);
    try {
      const { ok, data } = await postJson('/api/auth/password/reset', { token, password });
      if (!ok) setErrore(String(data['error'] ?? 'Link non valido o scaduto.'));
      else setFatto('Password aggiornata. Ora puoi accedere con quella nuova.');
    } catch { setErrore('Rete non raggiungibile, riprova.'); }
    finally { setBusy(false); }
  };

  const campo = 'flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-3';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="text-display text-3xl font-black">{token ? 'Nuova password' : 'Password dimenticata'}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {token ? 'Scegline una di almeno 10 caratteri.' : 'Ti mandiamo un link per sceglierne una nuova.'}
          </div>
        </div>

        {fatto ? (
          <div className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
            <div className="text-sm">{fatto}</div>
            <Link href="/login" className="inline-block rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">Vai all'accesso</Link>
          </div>
        ) : (
          <form onSubmit={token ? salva : chiediLink} className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-6">
            {token ? (
              <>
                <label className="block">
                  <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Nuova password</div>
                  <div className={campo}><Lock className="h-4 w-4 text-muted-foreground" />
                    <input value={password} onChange={e => setPassword(e.target.value)} type="password" minLength={10} required className="w-full bg-transparent outline-none" autoComplete="new-password" />
                  </div>
                </label>
                <label className="block">
                  <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Ripeti la password</div>
                  <div className={campo}><Lock className="h-4 w-4 text-muted-foreground" />
                    <input value={conferma} onChange={e => setConferma(e.target.value)} type="password" minLength={10} required className="w-full bg-transparent outline-none" autoComplete="new-password" />
                  </div>
                </label>
              </>
            ) : (
              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Email</div>
                <div className={campo}><Mail className="h-4 w-4 text-muted-foreground" />
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" required className="w-full bg-transparent outline-none" autoComplete="email" />
                </div>
              </label>
            )}
            {errore && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{errore}</div>}
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground hover-elevate disabled:opacity-50">
              {busy ? 'Un attimo…' : token ? 'Salva la nuova password' : 'Mandami il link'}
            </button>
            <div className="text-center text-xs text-muted-foreground"><Link href="/login" className="hover:text-foreground">Torna all'accesso</Link></div>
          </form>
        )}
      </div>
    </div>
  );
}
