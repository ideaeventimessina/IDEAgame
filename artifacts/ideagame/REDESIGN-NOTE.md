# Redesign fedele ai mockup — NOTE di progresso

Metodo: skill `mockup-replica`. Le tavole del pacchetto (`/private/tmp/idea_pkg/IDEA-EVENTI/01-ideagame/05..12`)
sono mockup DIPINTI (imagegen, 1536×1024). Ogni tavola contiene più viste: vanno ritagliate
una per una (`design/refs/`) e confrontate per ZONE, non a schermo intero (la soglia 6% non è
raggiungibile sulle zone con texture dipinta — vedi skill, sezione "Mockup dipinti o generati con AI").

Strumenti: `~/.claude/skills/mockup-replica/scripts/{measure,crop,compare,layout,health}.mjs`.
Server di lavoro: `vite` su :5190 (node_modules symlinkato dalla main checkout; nessun lockfile toccato).
Confronti salvati in `.replica/` (gitignored). Reference + regioni in `design/` (committati).

## Shell condivise create (riusate da tutte le viste 05)
- `src/components/ShellHeader.tsx` — barra alta: badge vista + logo Johhy/IDEAGAME + azioni (tap ≥40).
- `src/components/ShowStage.tsx` — palco studio scuro (bagliori oro/viola in CSS, nessun asset).
- `src/components/StageFit.tsx` — palco a dimensioni fisse scalato a riempire il viewport
  (metodo "schermata fissa"): niente reflow/rewrap, composizione identica al mockup a ogni risoluzione.
- `public/brand/logo-glasses.png` — logo occhiali Johhy ritagliato dalla tavola (asset dipinto).

## Stato per slice

### [FATTO] 05-01 HOME landing — `src/pages/HomeV4.tsx`
Prima: vecchia hero "Jonny's World" (tutt'altro). Ora: palco fisso 752×500 fedele al mockup.
- Johhy (asset originale `jonny-master-nobg.png`), titolo 2 righe, CTA oro "Entra con un codice"
  + CTA viola "Organizza una serata" + 2 mini "Riprendi serata"/"Scopri i giochi".
- Reflow telefono dedicato (stack verticale, safe-area, tap ≥48).
- Navigazione preservata: Entra→/home/join, Organizza→/mode-select, Riprendi→/home-setup, Scopri→/demo.
- Typecheck: exit 0.
- Compare per zone (blur 4, g7) — % residua = fondo dipinto vs CSS (atteso):
  badge 52% · logo 54% · actions 28% · johhy 51% (x-12 y-24) · title 38% · cta_gold 35% ·
  cta_violet 25% · mini_sx 36% · mini_dx 32%. (Le CTA erano 95-99% prima dell'allineamento.)
- Health: nessuno scroll orizzontale, nessuna immagine rotta, viewport ok. Gli unici ✗ sono
  chiamate backend (`/api/auth/me`, `/api/home/music-config`, socket.io) che falliscono perché
  nel worktree NON gira il backend — identiche su ogni rotta (verificato su `/login`). Ambientali.

### [FATTO] 05-02 MODALITÀ — `src/pages/ModeSelect.tsx`
Prima: 4 card verticali (Home/Live/Gestione/Lockdown) su grande bg. Ora: palco fisso fedele —
2 card grandi (Gioca a casa / Eventi e locali) + divider "ALTRE MODALITÀ" + 3 card piccole
(Lockdown / Burraco / Casinò). Reflow telefono (1 colonna). Routing e **flusso login Live preservati**
(useAuth + redirect /login per ruoli non abilitati). Casa→/home-setup, Eventi→LIVE_DEST(login),
Lockdown→/home-setup?mode=lockdown, Burraco→/gestione/burraco, Casinò→/gestione/casino.
Typecheck exit 0. Compare per zone (blur4, g2): subtitle 54% · casa 50% · eventi 42% · divider 18% ·
lockdown 40% · burraco 31% · casino 24% (residuo = scena dipinta vs gradiente tinta, atteso).

### [FATTO] 05-03 / 05-04 CREA SERATA + SCEGLI GIOCHI — `src/pages/HomeSetupPage.tsx`
Prima: form unico (nome + giochi). Ora: wizard 3 passi fedele ai mockup —
step1 "Impostazioni della serata" (Nome serata / Conduttore / Pubblico) con Johhy e stepper,
step2 "Seleziona i giochi" (griglia 4×2, Adult Only bloccato con 18+ per Famiglia, barra selezione +
Continua), step3 "Dispositivi e audio" → Crea stanza. Logica di sessione PRESERVATA
(POST /api/home/sessions + live-sessions, navigate alla lobby, idempotenza invariata).
Nuovi campi UI: Nome serata (→ titolo Live) e Pubblico (Famiglia filtra Adult). `?step=N` per anteprima.
Typecheck exit 0. Compare per zone — step1: stepper 24% · righe 16-33% · continua ~83%(posizione,
atteso) ; step2: title 38% · grid 35% (x-12 y20) · bottombar 22%. Residuo = scena dipinta vs gradiente.

## DA FARE (in ordine di priorità del caller)
1. Tavola 06 (lobby/ruota + dispositivi)
3. Tavola 07/10 (telefono ingresso+quiz, stati)
4. Tavola 08/09 (monitor giochi display)
5. Tavola 12 admin come 1 TEMPLATE applicato
