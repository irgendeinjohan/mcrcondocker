#!/bin/sh
# Startet das Dashboard als unprivilegierter Benutzer.
# - PUID/PGID gesetzt → mit dieser Benutzer-/Gruppen-ID starten
# - sonst als Benutzer "node"; ist /data für ihn nicht beschreibbar (typisch bei
#   Synology-Ordnern), wird versucht, /data an ihn zu übergeben
# - klappt beides nicht, läuft das Dashboard als root weiter (mit Warnung)
set -e

DATA="${DATA_DIR:-/data}"
mkdir -p "$DATA" 2>/dev/null || true

if [ "$(id -u)" != "0" ]; then
  exec "$@"
fi

if [ -n "$PUID" ]; then
  USER_SPEC="$PUID:${PGID:-$PUID}"
  chown "$USER_SPEC" "$DATA" 2>/dev/null || true
  for f in "$DATA"/dashboard.db "$DATA"/dashboard.db-wal "$DATA"/dashboard.db-shm; do
    [ -e "$f" ] && chown "$USER_SPEC" "$f" 2>/dev/null || true
  done
  exec su-exec "$USER_SPEC" "$@"
fi

if ! su-exec node test -w "$DATA"; then
  chown node:node "$DATA" 2>/dev/null || true
fi
for f in "$DATA"/dashboard.db "$DATA"/dashboard.db-wal "$DATA"/dashboard.db-shm; do
  if [ -e "$f" ] && ! su-exec node test -w "$f"; then chown node:node "$f" 2>/dev/null || true; fi
done

if su-exec node test -w "$DATA"; then
  exec su-exec node "$@"
fi

echo "WARNUNG: $DATA ist für den Benutzer 'node' nicht beschreibbar – Dashboard läuft als root." >&2
echo "         Tipp: PUID/PGID auf die ID deines NAS-Benutzers setzen (siehe README)." >&2
exec "$@"
