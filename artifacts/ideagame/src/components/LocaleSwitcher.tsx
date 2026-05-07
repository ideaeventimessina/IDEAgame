import { useI18n, LOCALES } from '@/i18n';

export function LocaleSwitcher({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const { locale, setLocale } = useI18n();
  const sizing = size === 'lg' ? 'text-2xl px-5 py-3' : size === 'sm' ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1.5';
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 backdrop-blur-sm p-1">
      {LOCALES.map(l => (
        <button
          key={l.code}
          onClick={() => setLocale(l.code)}
          className={`${sizing} rounded-full font-display font-semibold tracking-wider transition-colors ${
            locale === l.code
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover-elevate'
          }`}
          data-testid={`locale-${l.code}`}
        >
          {l.flag}
        </button>
      ))}
    </div>
  );
}
