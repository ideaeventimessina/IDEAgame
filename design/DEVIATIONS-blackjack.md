<!-- Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M -->

# Blackjack — DEVIATIONS (scostamenti dai mockup e scelte)

Rifacimento GRAFICA + giocabilità delle 3 viste (`BlackjackMonitor`, `BlackjackPhone`,
`BlackjackRegia` / `BlackjackTablesView` in `artifacts/ideagame/src/pages/GestioneBlackjack.tsx`).
**Logica soldi NON toccata**: `finishBjHand`, `bjAction`, idempotenza `settledHand`,
update atomici in `db.transaction` dentro `artifacts/api-server/src/routes/gestione-casino.ts`
restano identici a `main`. Contratto API invariato.

## Mockup di riferimento

`design/bj-monitor-attesa@744.png`, `bj-monitor-partita@744.png`, `bj-monitor-risultati@744.png`
(+ `.regions.json`) e `bj-phone-01..06@300.png`. Sono **mockup dipinti / generati con AI**:
panno con texture, marmo agli angoli, cornici e filigrane d'oro, bagliori. Valgono come
**art direction**, non come file di design al pixel.

## Correzioni OBBLIGATORIE ai mockup (incoerenze volute del kit)

| Punto | Mockup | Implementato | Perché |
|---|---|---|---|
| Valuta | crediti seat come `1.000 €` | **`1.000`** (nessun simbolo €) | Gli importi sono **crediti virtuali** del casinò, non euro (regola di prodotto, commento in testa al file). |
| QR (monitor attesa) | QR dipinto generico | **QR vero** che codifica l'URL `…/gestione/casino?bjplay=<codice>` | Il QR deve funzionare: è generato runtime (`qrcode.react`), quindi i moduli differiscono dal dipinto. |
| Banco risultati | due `9♠` + un dorso (18) | **due carte reali** `9♠ 9♥` = 18, dorso rivelato in fase result | Il generatore ripete i semi; la mano reale rivela la coperta. |
| Totale banco in gioco | mostrato pieno | **solo la carta scoperta** conta finché la coperta è nascosta | Regola BJ + sicurezza: la coperta non è mai inviata al client prima della rivelazione. |

## Scelte di direzione artistica (metodo mockup-replica)

- **Monitor = palco fisso 744×407** (coordinate del righello, posizionamento assoluto),
  scalato con `transform: scale(min(w/744, h/407))` e centrato → letterbox, **nessun
  pannello tagliato e nessun controllo che sparisce** su TV 1920×1080 e 1280×720.
- **Pittura vs codice**: il panno/la cornice/le filigrane sono resi in **CSS** (gradient,
  box-shadow, PNG `flourish-l/r.png`), non ritagliati dai dipinti. Carte, totali, QR,
  testi, badge esito, avatar = **codice**, con font Libre Baskerville (locale).
- **Avatar giocatori**: foto reale caricata dal telefono (`fileToAvatar`); senza foto →
  placeholder generico. I volti dipinti nei mockup sono contenuto utente, non UI: nel
  confronto per zone appaiono come differenza attesa.
- **Dorso carta**: immagine condivisa `public/bj/card-back.png` (coerente monitor+telefono).
- **Regia e Tavoli**: **nessun mockup** fornito → interpretazione fedele allo stile del
  casinò (palco 1600×900 scalato per la regia; hub per `BlackjackTablesView`). Non sono
  vincolati a una tavola.

## Fix funzionali applicati in questo giro

- **`soft17` → `soft17Hit`**: il tipo frontend `BjTbl` dichiarava `soft17`, ma il server
  invia `soft17Hit`. In regia il selettore «Banco sta su» leggeva sempre `undefined`
  (mostrava «Soft 17 (sta)» a prescindere). Allineato il tipo e il binding al campo reale
  del server. Solo frontend; nessun impatto sui soldi.

## Soglia percettiva (mockup dipinti)

Sulle zone con panno/oro/marmo dipinti la soglia del 6% **non è raggiungibile**: il
confronto gira con `--blur 4` e il giudizio è, come da skill, su **spostamento ~0 nelle
zone costruite in codice**, altezza pagina esatta, zero errori di salute. Numeri in
`deliverables/ACCETTAZIONE-blackjack.md`.
