# Ippodromo — deviazioni dal mockup (mockup-replica)

## Monitor PUNTATE (ippo-monitor-puntate@744) — misure compare
- §logo 0% · §wordmark 0% · §cards 1,72% · §banner ~0% layout (residuo = cifra countdown live 29 vs 30 dipinto) → OK
- §strip 51% **deviazione dati dinamici**: la fascia giocatori mostra selfie/nomi/crediti REALI dei giocatori collegati; il mockup usa foto segnaposto e numeri d'esempio. Layout (barra, posizioni avatar, tipografia nome/credito) replicato dal righello; il contenuto non può e non deve combaciare coi segnaposto.
- QR: generato vero dall'URL del tavolo (il QR disegnato è illustrativo, come da spec).

## Asset ritagliati dai mockup (dipinti) → public/ippo/
logo-ippodromo, corsa-wordmark, card-1..6 (carte-cavallo fotorealistiche), horse-1..6 (ritagli cavallo per il telefono), banner-puntate. Fonte: ippodromo-01-monitor-regia.png (nativo 1536×1024).

## Da completare con lo stesso metodo (compare per zone)
- Monitor CORSA: pista ovale (backdrop da ritagliare + inpaint dei cavalli dipinti) con sprite cavalli animati; Monitor RISULTATI: podio ritagliato.
- Telefono (06 scegli, 07 conferma, 08 corsa, 09/12 esiti, 11 ricevuta, 10 stati) e Regia (04, 13 tavoli, 14 storico, 15 sospensione, 16 annullamento).
