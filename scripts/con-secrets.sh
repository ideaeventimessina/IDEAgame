#!/usr/bin/env bash
# Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M
#
# Carica i secret CONDIVISI (ELEVENLABS_API_KEY, MESHY_API_KEY, SUNO_API_KEY, FAL_KEY, ...)
# nell'ambiente e poi esegue il comando passato. Stessa logica di chiave.sh di IDEAphoto-Suite:
# il file vive FUORI dal repo (default ~/.config/ideaphoto/secrets.env, permessi 600), i valori
# NON vengono mai stampati, non entrano nel repo ne' nella cronologia. In produzione (Replit) i
# secret arrivano dai Secrets, quindi questo loader serve solo al locale.
#
# Uso:
#   ./scripts/con-secrets.sh npm --prefix artifacts/api-server run dev
#   ./scripts/con-secrets.sh node -e "console.log(!!process.env.ELEVENLABS_API_KEY)"
#
# Override del percorso con IDEA_SECRETS=/altro/secrets.env
set -euo pipefail

SECRETS_FILE="${IDEA_SECRETS:-$HOME/.config/ideaphoto/secrets.env}"

if [ -f "$SECRETS_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$SECRETS_FILE"
  set +a
else
  echo "[con-secrets] nessun file secret in $SECRETS_FILE (uso solo l'ambiente attuale)" >&2
fi

# riepilogo PRESENZA (mai i valori), utile per capire al volo cosa e' caricato
for n in ELEVENLABS_API_KEY OPENAI_API_KEY MESHY_API_KEY SUNO_API_KEY FAL_KEY; do
  if [ -n "${!n:-}" ]; then echo "[con-secrets] $n: presente" >&2; else echo "[con-secrets] $n: assente" >&2; fi
done

if [ "$#" -gt 0 ]; then
  exec "$@"
fi
