<!-- Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M -->

# Ippodromo Sprint — DEVIATIONS (scostamenti dai mockup e scelte)

Modalità **distinta** dall'ippodromo classico. Non toccati: `GestioneIppodromo.tsx`,
endpoint `horse-*` classici, `GestioneCorsaSiciliana.tsx`. Pattern imitato: Corsa
Siciliana (`sprintTables` nel `config` jsonb, nessuna migrazione).

## Correzioni OBBLIGATORIE ai mockup (incoerenze volute dal kit)

| Punto | Mockup regia (tavola 13) | Implementato (configurazione EFFETTIVA del motore) | Perché |
|---|---|---|---|
| Posizione ostacoli | 140 / 270 / 410 / 540 m | **120 / 240 / 360 / 480 m** | `01-MECCANICA`: usare la config unica del motore, non i numeri stampati nelle tavole |
| Nomi cavalli (tavola 11/12) | Fulmine, Tempesta, Tornado, Stella, Rebel, Ombra | **Catalogo unico: 1 Fulmine · 2 Stella · 3 Vento · 4 Saetta · 5 Tempesta · 6 Luna** | `01-MECCANICA`: catalogo unico nomi/colori, correggere le righe regia generate con nomi diversi |
| Colori | assortiti nelle tavole | **rosso / blu / verde / giallo / viola / arancio** (ordine 1→6) | catalogo unico stabile |
| Punteggi risultati | 120/95/80/65/50/40 (mockup 04) illustrativi | **100 / 80 / 60 / 40 / 20 / 10** | `01-MECCANICA`: i numeri dei mockup sono illustrativi; punti demo canonici del motore |
| Logo inventato nelle tavole | arco/logo generati | **PNG ORIGINALE** `idea-eventi-negativo-originale.png` (SHA-256 `8db12b5f…6c91e`), testa compresa | `00-MARCHIO-ORIGINALE-OBBLIGATORIO`: vietato rigenerare il marchio |

## Scelte di direzione artistica (metodo mockup-replica)

- **Monitor = palco fisso 1672×941** scalato con `transform: scale()`; fondo =
  `stadio-pulito.png` (clean-plate, stessa dimensione della Sicilia e della demo).
- **Pittura vs codice**: la pittura è il solo clean-plate (tribune/pista/terra). Tutto
  il resto è **codice**: titolo (Cinzel) + logo originale, pannello POSIZIONE, DISTANZA,
  card lobby, countdown, risultati (testi/numeri dinamici), e il **rig animato** su canvas.
- **RIG**: porting FEDELE di `demo/public/horse-rig.js` in codice (stessi pivot
  spalla/anca/ginocchio/garretto/zoccolo/collo/coda/bacino-fantino, stesso contratto di
  stati idle/galoppo/salto; ombra a terra mentre il root salta; sella/fantino col colore
  corsia). **Non è fotorealistico** e NON è identico ai cavalli dipinti nei mockup: le
  tavole sono art direction, il rig è grafica 2D stilizzata (come dichiara `00-LEGGIMI`
  e `02-FILIERA`). Il kit non fornisce un atlas 24-frame/3D finale.
- **Vista laterale a 6 corsie** con camera che segue il gruppo (leader ~90 m avanti),
  `pixelPerMeter = 4.2`; ostacoli e traguardo in coordinate world; cancello di partenza
  disegnato in testa. Scelta coerente con `02-FILIERA` (evita di ruotare sprite su un ovale).
- **Telefono/Regia**: non c'è un mockup "pixel" di dimensioni fisse (telefoni e pannelli
  regia sono scene dipinte): ricostruiti in codice fedeli per contenuto/sequenza (06→07→
  08→09→10 telefono; 11/12/13 regia), stessa palette nero/verde/oro. La tavola 14
  (ANIMAZIONE E ASSET, "Strumenti di sviluppo e debug") NON è riprodotta come vista
  utente: è un pannello di debug, fuori ambito di gioco.

## Verifica visiva (monitor, race view)

Confronto a zone contro `mockup/01-monitor.png` §03 (CORSA E SALTI), tramite harness
che usa lo STESSO `drawHorse` + la stessa geometria del componente:
- zone **codice** presenti e allineate: titolo+logo (alto-sx), DISTANZA `nnn/600 m`
  (alto-dx), pannello POSIZIONE ATTUALE con 6 barre colorate (sx), ARRIVO a scacchi (dx);
- zona **rig**: 6 cavalli animati sulle 6 corsie, galoppo + 1 salto, ostacoli-siepe;
- zona **dipinta** (clean-plate): invariata, 0% (nessuna pittura rifatta in CSS).
La soglia 6% percettiva NON si applica alle zone dipinte vs rig stilizzato: i cavalli
sono volutamente diversi dai cavalli fotografici del mockup (vedi sopra).

## Limiti noti (vedi NOTE-ippodromo-sprint.md)

- Rete: il prototipo/porting usa polling + estrapolazione client (no lag-compensation
  avanzata). Collaudo su WiFi reale con 6 telefoni e monitor 80″ ancora da fare (QA utente).
- Motore ricostruito a passo fisso dal log input (niente tick 20 Hz sul DB): determinismo
  verificato dai test; manca il collaudo multi-device fisico.
