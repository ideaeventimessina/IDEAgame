# Corsa Siciliana — monitor 80″ · scostamenti dal mockup (metodo mockup-replica)

Mockup approvato: `design/corsa-siciliana@1672.png` (1672×941, raster dipinto AI).
Zone di confronto: `design/corsa-siciliana.regions.json`. Confronto `--blur 4`.
Ancore: **§titolo 0%** (pixel-exact) e **altezza pagina 941px = mockup +0px** → il sistema di
coordinate è corretto; sulle zone dipinte la % residua è **pittura-vs-CSS**, non disallineamento
(irriducibile su mockup generato, come prescrive la skill): si giudica a vista + stabilità.

## Costruzione
- **Base = clean-plate** `public/corsa-siciliana/sfondo-sicilia-pulito.png`: cornice maiolica, limoni,
  mare+Etna, plancia-titolo vuota, pannello pergamena e box destro sono nella pittura, NON rifatti.
- Tutto il dinamico è in overlay sul clean-plate: GIRO, titolo, corsie/caselle, cavalli, mazzo,
  carta, pulsante PESCA, "È USCITO", striscia giocatori, vincitore.

## Scostamenti e scelte
- **Titolo + marchio**: `crops/plancia-titolo.png` ritagliato dal mockup approvato e sovrapposto a
  coord esatte (§titolo 0%). Il marchio NON è ricostruito con un font: è il logo del mockup approvato.
  Il logo originale `logo/idea-eventi-originale.png` del kit è disponibile per un eventuale swap 1:1.
- **Carte**: rese dagli **atlanti siciliani autentici** via `rect` di `integrazione/mazzo.json`
  (identità logica dal manifest, MAI OCR/riconoscimento visivo). La carta d'esempio (tre di spade) usa
  la versione **corretta a spade verdi** (per `corsa-siciliana-riferimenti.md`: la variante a spade blu
  del mockup è superata). Le carte autentiche non hanno indici angolari ("3") come nel mockup → **omessi**
  (fedeltà al mazzo verificato, non al dipinto).
- **Cavalli**: PNG una-posa per seme (`cavalli/{coppe-rosso,denari-oro,spade-blu,bastoni-verde}.png`)
  con traslazione + leggera oscillazione. **Nessun rig di galoppo** (come dichiarato nel LEGGIMI del kit).
- **GIRO, menu, pillole corsia/caselle, pulsante PESCA, pannello mazzo**: ricostruiti in codice
  (controlli accessibili + numeri/testi dinamici) usando i reference `interfaccia/*.svg` come guida,
  non incollati (quei reference incorporano lo sfondo, ~4 MB l'uno: solo guida).
- **Font**: Cinzel (titoli/numeri) + Lora (testi), alternative OFL incluse nel kit — il font originale
  del mockup non era identificabile. Telefono/Regia restano sul Baskerville del casinò (invariati).
- **Medaglioni semi** e **ritratti giocatori**: ritagli circolari dal mockup approvato (`crops/`).
- **QR ingresso**: rimosso dal monitor (non presente nel mockup). I giocatori entrano dal QR del
  casinò / IDEAphoto Suite; il QR d'ingresso è disponibile nella **Regia**.
- **Overlay vincitore**: non presente nel mockup, aggiunto per il fine-corsa (stile coerente).

## Meccanica (da concept/LEGGIMI, rispettata)
- Mazzo 40 carte, 10 per seme; la pescata avanza di **1** solo il cavallo del seme uscito (il valore
  NON cambia l'avanzamento); primo al traguardo vince; esito derivato dalle carte (no esito deciso in
  anticipo, no quota 6× della vecchia corsa). Pescata riservata a Regia/host; token idempotente lato
  server blocca doppio-click/retry. Caselle configurabili (default 9).

## Asset nel repo (leggeri)
`public/corsa-siciliana/`: sfondo clean-plate, `atlanti/` (4 PNG, carte via rect), `dorso-maiolica.png`,
`cavalli/` (4), `crops/` (plancia-titolo + 4 medaglioni + 4 ritratti), `font/` (Cinzel+Lora), `data/mazzo.json`.
Scartate le 40 carte SVG (~112 MB: raster incorporato) a favore degli atlanti (~8 MB); scartati i
`simboli/*.svg` (non usati: medaglioni = crop) e i reference `interfaccia/*.svg` (solo guida, non spediti).
