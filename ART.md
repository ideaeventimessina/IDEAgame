<!-- Contratto visivo — Jonny's World / Modalità Gestione (Burraco & Casinò) -->

# ART.md — Jonny's World · Modalità Gestione

Contratto visivo per le schermate `/gestione` (Burraco + Casinò). Tutto ciò che si
costruisce deve poter essere giustificato da una riga di questo file.

## Ancora
Riferimento: **il mondo Jonny's World** già esistente nei party game (proiettore
maxi-schermo, tabelloni live, arcade caldo). Screenshot di riferimento: le TV di
Quizzone/Ballo e la ruota di scelta gioco già catturate in sessione.

**Cosa deve provare chi apre la schermata nei primi 2 secondi:**
- TV/classifiche → **«sta succedendo qualcosa, chi vince?»** (spettacolo, movimento).
- Tavolo/Dealer/Giocatore (telefono) → **«chiaro, faccio subito la mia azione»**.

## Palette (token)
- Fondo: radiale scuro per contesto — Burraco `#0f3d2e→#050d0a`, Casinò `#3d2a08→#0a0602`.
- Accento Burraco: verde `#34D399` (glow `#6EE7B7`).
- Accento Casinò: oro `#F5B642` (glow `#FFD040`).
- Testo: bianco; secondario `rgba(255,255,255,.55)`.
- Podio: oro `#FCD34D`, argento `#CBD5E1`, bronzo `#D97706`.

## Tipografia
- Famiglia unica: **Outfit** (fallback system-ui). Titoli/numeri **900**.
- Maxi-schermo: nomi ≥ `clamp(20px,2.6vw,34px)`, punteggi ≥ `clamp(26px,3.4vw,46px)`.
- Telefono: azione principale ≥ 18px, saldo/numero grande `clamp(44px,12vw,120px)`.

## Movimento (il punto debole da colmare)
- **Le righe di classifica scalano di posizione** quando cambiano i punteggi
  (framer-motion `layout`): è l'anima di un tabellone live.
- Ingresso righe **staggered** (0.05s l'una).
- **Leader** (1° posto): pulse/glow lento e continuo.
- **Numeri** (punteggi, cassa, saldo): salgono con un tween quando cambiano.
- Pulsanti: feedback al tocco (`whileTap` scale 0.96). Niente hover come unico segnale (è touch).
- Durate brevi: 0.2–0.5s. Rispetta `prefers-reduced-motion` dove sensato.

## Identità
- Ogni TV porta un segno Jonny's World (emoji-badge del gioco + titolo serata) e,
  dove utile, un QR per far entrare/guardare dal telefono.

## Regole
- Nessun valore cromatico/tipografico inventato fuori da questa palette.
- Non toccare logica/API: solo grafica e micro-interazioni.
- Mobile-first per Tavolo/Dealer/Giocatore: nessuno scroll orizzontale, tocco ≥ 44px.
