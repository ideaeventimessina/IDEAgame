import { useState } from 'react';
import { useLocation } from 'wouter';
import { useI18n, LOCALES } from '@/i18n';
import { MockBanner } from '@/components/MockBanner';
import { Hexagon } from '@/components/Hexagon';
import { Check } from 'lucide-react';

const LABELS: Record<string, { native: string; en: string }> = {
  it: { native: 'Italiano', en: 'Italian' },
  en: { native: 'English', en: 'English' },
  es: { native: 'Español', en: 'Spanish' },
  fr: { native: 'Français', en: 'French' },
};

export default function LanguageSelect() {
  const { locale, setLocale } = useI18n();
  const [, navigate] = useLocation();
  const [remember, setRemember] = useState(true);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <MockBanner note="onboarding lingua — non persistito su user.locale" />
      <div className="text-center">
        <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Step 1 of 3</div>
        <div className="mt-3 text-display text-2xl font-black sm:text-4xl lg:text-5xl">Scegli la lingua / Choose your language</div>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-8">
        {LOCALES.map(({ code }) => {
          const active = locale === code;
          return (
            <Hexagon
              key={code}
              size={130}
              color={active ? '#F5B642' : '#2a2444'}
              glow={active}
              onClick={() => setLocale(code)}
              className="transition-transform hover:scale-105 md:!w-[180px] md:!h-[180px]"
            >
              <div className="flex flex-col items-center gap-1">
                <div className="text-display text-2xl font-black uppercase">{code}</div>
                <div className="text-xs text-muted-foreground">{LABELS[code]?.native}</div>
                {active && <Check className="mt-1 h-5 w-5 text-primary" />}
              </div>
            </Hexagon>
          );
        })}
      </div>

      <label className="mt-12 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
        Remember on this device
      </label>

      <button
        onClick={() => navigate('/tenant')}
        className="mt-6 rounded-full bg-primary px-10 py-3 text-base font-bold text-primary-foreground shadow-[0_0_40px_rgba(245,182,66,0.35)] hover-elevate"
      >
        Continua
      </button>
    </div>
  );
}
