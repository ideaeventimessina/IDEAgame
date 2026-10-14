# Lockdown — DEVIATIONS (scostamenti dai mockup, motivati)

I mockup del pacchetto sono DIPINTI (generati con AI): art direction, non specifica
di pixel. Il documento delle regole (02-REGOLE) e le correzioni (03-SCHERMATE, 04-AUDIT)
prevalgono sui dettagli illustrativi. Qui ogni scostamento con il motivo.

## Decisione architetturale — dove vive la regia/telefono
- La vista **REGIA MASTER** è stata aggiunta come MONITOR DEMO in
  `GestioneLockdown.tsx` (`?regia`), coerente con casa/sfida/finale già presenti:
  palco fisso 768×512, dati mock, nessun backend. È una replica visiva per
  showroom/anteprima, NON la console operativa autenticata.
- Il Lockdown GIOCABILE (comandi reali, auth host, ledger, spia privata) resta nel
  motore Home (`api-server/src/routes/home-lockdown.ts` + `HomeGame`/`HomeJoin`),
  come da 01-SPECIFICA. NON ho duplicato il runtime né portato i comandi dentro
  /gestione. La regia reale andrà poi collegata a quel motore (fase successiva).
  Motivo: la regola Live impone di riusare il runtime Home, non duplicarlo.

## Pannello 15 REGIA MASTER
1. **Badge "15" omesso.** I numeri 01–28 sulle tavole sono indici di catalogo del
   mockup, non elementi di UI. Titolo "REGIA MASTER" allineato a sinistra (x20).
2. **Tabella ESITO/VARIAZIONE calcolata, non copiata.** 03-SCHERMATE: «la regia
   Cucina della tavola 07 contiene somme esemplificative: usare 40×ricette e
   l'eventuale penalità del preset, non copiare i numeri delle righe». Applicata la
   regola Cucina (02-REGOLE): valide ≥4 → Premio 40×valide; valide <4 → Penalità 80.
   Conseguenze vs dipinto: Elena 4→160 (non 150), Luca 2→Penalità 80 (non "Nessun
   bonus 0"), Sofia 4→160 (non 150), Davide 3→Penalità 80 (non Premio 120),
   Matteo 3→Penalità 80 (non Premio 100). Giulia 5→200 e Chiara 1→Penalità 80
   coincidono col dipinto. Lo stato "Nessun bonus" del mockup non esiste nella regola.
3. **ANDAMENTO PARTITA = i 10 nomi reali del catalogo** (Cucina, 10 Sfumature,
   Biblioteca, Palestra, Studio, Cinema, Balcone, Gabinetto, Ufficio, Salone),
   nell'ordine mostrato dal pannello, senza duplicati né mancanti (03-SCHERMATE).
4. **Logo reale con sfondo trasparente** (`logo-lockdown-t.png`): il logo originale
   è RGB opaco con cielo notturno; su pannello quasi nero mostrerebbe un box. Reso
   trasparente via key su luminanza, conservando emblema e wordmark. Brand: testo
   "IDEAeventi" (non "IDEA EVENTI" del dipinto), logo reale non alterato.
5. **Font**: Libre Baskerville (già usato dai monitor Lockdown) al posto del serif
   del dipinto. Metriche diverse → zone testo non pixel-identiche; layout allineato.
6. **Lock-Euro**: le cifre con lucchetto hanno `aria-label` "… Lock-Euro" (etichetta
   completa, 03-SCHERMATE).
7. **La console non conosce la spia** (nessun dato spia nel componente): coerente con
   01-SPECIFICA (Master non vede la spia prima della rivelazione).

## Pannello 21 CONTENUTI
1. **Nomi stanze reali.** 03-SCHERMATE: «l'editor della tavola 08 inventa nomi di
   stanze: sostituirli tutti con i dieci nomi del catalogo reale». La lista "Stanze
   della casa (10)" usa `ROOM_CATALOG` (Cucina, 10 Sfumature, Biblioteca, Palestra,
   Studio, Salone, Cinema, Balcone, Gabinetto, Ufficio) al posto degli inventati
   (Atrio, Giardino, Cantina, Mansarda, Camera degli ospiti…). "Cinema" resta la #7.
2. **Cinema = storytelling**, 20 parole, 300s (già corretto nel mockup): mantenuto.
3. **Proiettore dipinto non replicato**: reso come bagliore radiale (`ad-glow`) per
   un pannello admin nitido; la pittura decorativa non è UI. Logo reale + 'IDEAeventi'.
4. **Badge "21"** di catalogo omesso.

## Monitor Casa/Sfida/Finale (priorità 1) — verifica
Viste preesistenti CONFERMATE fedeli ai pannelli 13/14/16: le pitture (house.png,
kitchen.png, finale.png) sono ritagli dei rispettivi pannelli; layout, pill stanze,
fascia giocatori, barra MASTER e dati mock corrispondono. Unico scostamento noto: il
palco è 744×456 (casa/sfida) / 744×448 (finale), mentre i pannelli sono 768×512 —
scelta dell'autore precedente, invisibile a schermo (nessun riferimento affiancato),
non rifatta per non regredire viste funzionanti. Il logo nei monitor usa una fascia
di mascheramento che combacia col proprio sfondo (il box non emerge).

## Salute (ambiente)
Gli errori api/auth/me 500, api/home/music-config 500 e websocket socket.io NON sono
della vista (che non fa fetch): derivano dal guscio app globale senza api-server nel
worktree isolato. La regia è console tablet/desktop: i touch target <40px segnalati
valgono solo a viewport telefono 375px, fuori target per questa vista.

## Dati mock (non persistenti)
Nomi, saldi, soglia 1500, vincitore e spia nelle viste sono ESEMPI dimostrativi, non
dati reali (03-SCHERMATE). Nessun QR illustrato è usato per accessi veri.
