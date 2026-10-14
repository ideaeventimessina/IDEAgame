# Lockdown — NOTE di avanzamento (replica mockup)

Metodo: skill `mockup-replica` — palco fisso, ritaglio asset dipinti, testi/numeri
ricostruiti in codice, confronto per ZONE (regions.json), giudizio con `--blur 4`
sui mockup DIPINTI (generati AI). Numeri del confronto riportati come sono.

Pacchetto: `/private/tmp/idea_pkg/IDEA-EVENTI/02-lockdown/` (28 viste su 5 tavole).

## Architettura confermata
- Monitor/regia DEMO (mock, no backend): `artifacts/ideagame/src/pages/GestioneLockdown.tsx`
  rotta `/gestione/lockdown`, dispatcher per query:
  `?casa` (default) · `?sfida` · `?finale` · `?regia` (NUOVO).
- Il Lockdown GIOCABILE vero resta nel motore Home (`api-server/src/routes/home-lockdown.ts`
  + `HomeGame`/`HomeJoin`). Decisione telefono/regia: vedi DEVIATIONS-lockdown.md.

## Tavole → pannelli (reference ritagliati in design/lockdown/)
- Tavola 07 (1536×1024, 2×2 → pannelli 768×512): 13 casa, 14 sfida, 15 regia, 16 finale.
- Tavola 05 (3×2 phone): 01 accesso, 02 lobby, 03 personaggio, 04 spia, 05 mappa, 06 risultato.
- Tavola 06 (3×2 phone): 07 quiz, 08 ricette, 09 prova dal vivo, 10 votazione, 11 potere, 12 accusa.
- Tavola 09 (3×2 phone): Studio, Cinema, Balcone, Palestra, Gabinetto, Ufficio.
- Tavola 08 (3×2): 17 crea, 18 colpo di scena, 19 penalità, 20 riconnessione/sedato, 21 contenuti, 22 pausa/registro.

## Stato per vista
| Vista | Priorità | Stato | Note |
|---|---|---|---|
| 13 MONITOR CASA (`?casa`) | 1 | preesistente | da riverificare vs tavola 07 aggiornata |
| 14 MONITOR SFIDA (`?sfida`) | 1 | preesistente | idem |
| 16 FINALE (`?finale`) | 1 | preesistente pixel-faithful | ok |
| 15 REGIA MASTER (`?regia`) | 2 | **FATTO (questa sessione)** | confronto per zone sotto |
| Telefono (05/06/09) | 3 | DA FARE | vive in Home; vedi DEVIATIONS |
| Admin stati (08) | 3 | DA FARE | crea/penalità/contenuti/pausa |

## 15 REGIA MASTER — confronto per zone (giro g3, --blur 4, palco 768×512)
Mockup DIPINTO + font serif diverso (Libre Baskerville) → la soglia 6% non è
raggiungibile; giudizio visivo sui compositi MOCKUP|PAGINA|DIFF (allineati) e
stabilità fra giri. Dati ESITO/VARIAZIONE volutamente CALCOLATI dalla regola
Cucina (vedi DEVIATIONS), quindi la zona tabella diverge dalle somme dipinte.

| Zona | percettivo | spostamento | giudizio visivo |
|---|---|---|---|
| header | 18.4% | — | allineato (omesso badge "15" di catalogo) |
| tabs | 14.9% | — | allineato |
| masterbox | 22.9% | — | allineato |
| leftcol | 26.1% | x-30 y36* | allineato (shift = larghezza font + texture miniatura) |
| tabella | 13.6% | x18 y54* | righe allineate ±3px; shift = dati corretti + titolo |
| timeline | 9.6% | x30 y48* | item allineati ±3px; shift = label più larghe |
| pulsanti | 13.4% | — | allineato perfettamente |
altezza pagina 512 = mockup 512 (+0). *(shift = rumore di correlazione dipinto/font, non errore di layout reale: verificato sui compositi).

Salute: 4 errori ambientali (api/auth/me 500, api/home/music-config 500, websocket
socket.io) — NON del monitor (nessun fetch in GestioneLockdown), ma del guscio app
globale senza api-server avviato nel worktree. Touch target <40px solo a viewport
mobile 375px: la regia è console tablet/desktop, non telefono.

## Asset creati
- `public/lockdown/room-thumb-cucina.png` — miniatura stanza (ritaglio da pannello 15).
- `public/lockdown/logo-lockdown-t.png` — logo reale con sfondo notte reso trasparente
  (key su luminanza): usato in regia per evitare il box bluastro su pannello scuro.

## Prossimi passi
1. Riverificare casa/sfida vs pannelli 13/14 (compare per zone) e rifinire se divergono.
2. Telefono per ruolo (tavole 05/06/09) e admin stati (tavola 08).
