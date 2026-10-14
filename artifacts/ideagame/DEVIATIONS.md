# DEVIATIONS — scostamenti consapevoli dai mockup

I mockup sono DIPINTI (imagegen): art direction, non specifica pixel-perfect. Dove il mockup
contiene errori o texture non riproducibili in codice, si corregge e si annota qui (vedi anche
pacchetto `04-DECISIONI-E-CORREZIONI.md`).

## Globali
- **Fondo palco**: il mockup ha una scena studio dipinta (luci, bokeh, pubblico). Ricostruita in
  CSS (`ShowStage`) con bagliori oro/viola + vignettatura. Volutamente più pulita e scura: le zone
  di texture dipinta non scendono mai sotto la soglia 6% (atteso, da skill). Nessun asset pesante.
- **Logo occhiali**: ritagliato dalla tavola (`public/brand/logo-glasses.png`) perché nel repo il
  favicon è una "J" esagonale diversa dal marchio del mockup. Mantiene lo sfondo scuro del crop (si
  fonde sull'header scuro).
- **Marchio**: wordmark prodotto = "IDEAGAME" (come da tavole e spec 01). Mascotte = "Johhy".
- **Avatar conduttore** (header, alto dx): usa `jonny-master-nobg.png` ritagliato sul volto; il
  mockup mostra un ritrattino generico.

## 05-01 HOME landing
- **Palco fisso scalato** invece di layout fluido: scelta prescritta dalla skill per le schermate
  "show". Per il telefono è stato aggiunto un reflow verticale dedicato (il mockup non mostra la
  variante mobile della Home, quindi è un'interpretazione fedele ai token).
- **Titolo** ~40px, rientrato ~34px rispetto ai bottoni, come nel mockup (il generatore lo aveva
  leggermente spostato a destra). 2 righe forzate ("La tua serata" / "diventa uno show").
- **Johhy**: zona ancora a ~51% nel compare — dominata dallo sfondo dipinto dietro di lui, non da
  errore di posa/scala; residuo x-12 y-24 non percettibile a occhio (vedi `.replica/.../§johhy`).
- **"Riprendi serata"** mostrato sempre; la spec chiede di mostrarlo solo per una sessione host
  recuperabile. Da collegare al recupero reale quando si tocca la logica di sessione (ora → /home-setup).
- **"Scopri i giochi"** → /demo (vetrina); nel mockup non è specificata la destinazione.

## 05-02 MODALITÀ
- **Sfondi card**: il mockup usa foto dipinte per scena (salotto, discoteca, videochiamata, tavolo
  da carte, pubblico). Rese con gradienti tinta per mantenere la tonalità dominante e la legibilità
  del testo in codice. Scelta autonoma e leggera; le zone restano ~24-54% nel compare (atteso).
- **Icone**: Casa=Home, Eventi=MapPin, Lockdown=Lock, Burraco=Spade, Casinò=Crown. Il mockup mostra
  per Casinò un pedone di scacchi (Lucide non ha scacchi): Crown come sostituto "giochi di società".
- **Modalità mostrate**: allineate al mockup (Casa/Eventi + Lockdown/Burraco/Casinò). La vecchia
  card "Gestione giochi" generica è stata sostituita dalle due voci reali Burraco e Casinò.

## Note di salute (non scostamenti, ambientali)
`health.mjs` esce 1 su OGNI rotta per `/api/auth/me`, `/api/home/music-config` e socket.io: nel
worktree gira solo il frontend (vite), senza backend. Non sono regressioni introdotte dal redesign.
