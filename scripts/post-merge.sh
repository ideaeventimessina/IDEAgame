#!/bin/bash
# Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M

set -e
pnpm install --frozen-lockfile
pnpm --filter db push
