# MC-Dashboard – Plan

Stand: 18.10.2026. Entwurf vor der Umsetzung. Annahmen sind mit **(A)** markiert und gelten, bis du etwas anderes sagst.

## 1. Geprüfte Umgebung

- Docker läuft hier (Daemon 29.8, buildx mit Multi-Arch-Emulation). Ich kann also einen echten Paper-Testserver betreiben.
- Paper 26.3 ist verfügbar (Build 205, stable, 17.10.2026). Im Image `itzg/minecraft-server` wählt `VERSION=26.3` die Version.
- Node 22 ist lokal installiert; das Docker-Image bekommt die aktuelle LTS-Version.
- Chromium/Playwright ist vorhanden, damit kann ich die Oberfläche per Screenshot selbst prüfen.
- Diese Arbeitsumgebung ist **flüchtig** und mit keinem GitHub-Konto verknüpft. Siehe Rückfrage 1.

## 2. Architektur

```
 Browser (Desktop / iPhone-PWA)
   │  HTTP: REST (JSON) + Server-Sent Events (Live)
   ▼
 ┌─────────────────────── ein Docker-Container ───────────────────────┐
 │ Fastify (Node + TS)                                                │
 │  ├─ Auth: Passwort aus ENV → Session-Cookie, Login-Rate-Limit      │
 │  ├─ REST: /api/state, /api/players/:uuid, /api/sessions, /api/console,│
 │  │        /api/pause, /api/debug, /textures/:id                    │
 │  ├─ SSE:  /api/events  (Status, Spieleränderungen, Konsole)        │
 │  ├─ Poller (Intervall, Pause, Lücken-Erkennung)                    │
 │  │     └─ Session-Tracker (Login/Logout per /list-Vergleich)       │
 │  ├─ Parser: SNBT → Mapping (alt+neu) → Warnungen → Diagnose-Puffer │
 │  ├─ RCON-Client: 1 Verbindung, Warteschlange, Multi-Paket, Backoff │
 │  └─ SQLite (/data/dashboard.db)                                    │
 │ Statisches Frontend (Svelte, mit Vite gebaut)                      │
 └────────────────────────────────────────────────────────────────────┘
   │ RCON (TCP, Port von Nitrado)
   ▼
 Paper 26.3 bei Nitrado (ohne Plugins fürs Dashboard)
```

### Abweichungen vom Stack-Vorschlag (mit Begründung)

| Thema | Entscheidung | Warum |
|---|---|---|
| Live-Updates | **SSE** statt WebSocket | Daten fließen fast nur vom Server zum Browser, Konsolenbefehle gehen per POST. SSE verbindet sich automatisch neu, läuft über normales HTTP, funktioniert in iOS Safari und braucht keine zusätzliche Bibliothek. |
| Frontend | **Svelte 5** statt Vanilla TS | Inventar-Raster, Tooltips, Tabs und Dialoge sind als Komponenten deutlich übersichtlicher, und das Bundle bleibt klein (kein Virtual DOM). |
| RCON | **eigene Implementierung** (~200 Zeilen) | Vorhandene Bibliotheken setzen mehrteilige Antworten nicht zuverlässig zusammen und haben keine Warteschlange mit Prioritäten. Genau das ist hier der Kern. |
| SQLite | bevorzugt **`node:sqlite`** (in Node eingebaut), sonst `better-sqlite3` | Ohne native Abhängigkeit ist der Multi-Arch-Build (amd64/arm64) problemlos. Ob die eingebaute Variante in der LTS-Version stabil genug ist, prüfe ich in Schritt 4. |
| SNBT-Parser | **eigene Implementierung** | Er muss alte und neue SNBT-Syntax verstehen (Typ-Suffixe, `[I;…]`-Arrays, true/false, Text-Komponenten als Compound) und fehlertolerant sein, mit Warnungen statt Abstürzen. |
| Projektaufbau | **ein** `package.json` (kein Monorepo) | Weniger Aufwand, ein Build und ein Image. |

## 3. RCON-Strategie (möglichst wenige Befehle)

Pro Intervall (Standard 5 s, einstellbar):

1. `list uuids`: Online-Spieler mit UUID. Dafür reicht **ein** Befehl, und ab hier wird jeder Spieler über seine UUID angesprochen. So sind Bedrock-Namen mit Präfix oder Leerzeichen kein Problem. Der Namens-Parser arbeitet über das UUID-Muster `name (uuid)`, nicht über Leerzeichen oder Kommas.
2. `data modify storage mcdash:tmp s set string entity <uuid>` je Online-Spieler: **ein** Befehl liefert alles (Pos, Dimension, Health, foodLevel, XpLevel, Inventory, EnderItems, equipment, Spielmodus …). *Nachtrag aus Schritt 2:* `data get entity` wird über RCON nach ~32 Textstücken abgeschnitten. Der `string`-Umweg liefert das komplette SNBT in einer Fehlermeldung und schreibt nichts. Siehe [datenformat.md](datenformat.md).
3. `tps` und `mspt` nur in jedem n-ten Zyklus (Standard: alle 30 s).

Bei 5 Spielern sind das etwa 6 Befehle pro 5 s, eine vernachlässigbare Last. Kein Zyklus überlappt mit dem nächsten: Dauert ein Zyklus länger, beginnt der nächste erst danach.

**Mehrteilige Antworten:** Nach dem **ersten** Antwortfragment schicke ich ein „Marker-Paket“ (unbekannter Pakettyp). Der Server schreibt alle Fragmente, bevor er das nächste Paket liest, also ist die Antwort auf den Marker das Ende-Signal. *Nachtrag:* Befehl und Marker dürfen nicht gleichzeitig unterwegs sein, sonst trennt der Server die Verbindung. Fragmente werden als Bytes zusammengefügt und erst dann als UTF-8 dekodiert. Am Testserver geprüft: 11 916 Bytes in 3 Paketen.

**Warteschlange:** Konsolenbefehle haben Vorrang vor Poll-Befehlen. Jeder Befehl hat ein Timeout, danach wird die Verbindung neu aufgebaut. Reconnect mit exponentiellem Backoff (1 s → 2 → 4 … max. 60 s).

## 4. Online-Zeiten und Lücken

- Tabelle `sessions(uuid, start, end, end_reason)`. `end_reason` ist `logout` oder `unknown` (Lücke).
- Tabelle `gaps(start, end, reason)` mit `reason` = `paused` | `rcon_error` | `dashboard_offline`.
- Neu in `/list` → Session beginnt. Nicht mehr in `/list` → Session endet zum Zeitpunkt der letzten Beobachtung.
- Pause, Verbindungsfehler oder ein Neustart des Dashboards (erkannt am gespeicherten Zeitpunkt der letzten Abfrage) schließen offene Sessions mit `unknown`. Die Zeit dazwischen wird als Lücke gespeichert, also weder als online noch als offline gezählt. Danach beginnt eine neue Session, wenn der Spieler noch online ist. **(A)** Auch Verbindungsfehler und Ausfallzeiten des Dashboards gelten als „unbekannt“, nicht nur die Pause.
- Pause-Status und „letzte erfolgreiche Abfrage“ liegen in der Tabelle `settings` und überleben einen Neustart.

## 5. Gespeicherte Daten (SQLite)

```
settings(key, value)                  -- paused, last_poll_at, …
players(uuid, name, is_bedrock, first_seen, last_seen)
player_snapshot(uuid, taken_at, dimension, x, y, z, health, food, xp_level,
                parsed_json, raw_snbt, parser_version)
sessions(id, uuid, start, end, end_reason)
gaps(id, start, end, reason)
auth_sessions(token_hash, created_at, expires_at)
```

`raw_snbt` wird mitgespeichert. Nach einer Parser-Korrektur lassen sich alte Stände dann neu einlesen, ohne dass der Spieler online sein muss. **(A)** Gespeichert wird nur der jeweils letzte Stand, keine Inventar- oder Positionshistorie.

## 6. Parser und Selbstdiagnose

- `snbt.ts`: Tokenizer und Parser. Er versteht Zahlensuffixe b/s/L/f/d, typisierte Arrays, Strings in `'` oder `"`, Escapes und unquotierte Schlüssel. Bei Fehlern gibt es eine Fehlerposition und ein Teilergebnis statt einer Exception.
- `items.ts`: Items werden **rekursiv** über `id` plus `count`/`Count` gefunden. Das neue Format (`components`: `minecraft:enchantments`, `custom_name`, `damage`/`max_damage`, `container`, `bundle_contents` …) und das alte (`tag.Enchantments`, `tag.display.Name`, `tag.Damage`, `BlockEntityTag.Items`) werden auf ein gemeinsames `Item` abgebildet. Text-Komponenten können als JSON-String oder als SNBT-Compound kommen.
- `player.ts`: Rüstung und Offhand werden aus `equipment` gelesen, ersatzweise aus den Inventar-Slots 100–103 bzw. -106. Die Hotbar sind die Slots 0–8, das Hauptinventar 9–35.
- Unbekannte Felder werden ignoriert und einmal pro Feldpfad als Warnung gezählt, nicht bei jeder Abfrage.
- **Debug-Seite:** Sie zeigt die letzten Rohantworten pro Befehlstyp (Ringpuffer) und alle Warnungen mit Anzahl und erstem/letztem Auftreten. Mit einem Knopf lädt man alles als JSON herunter, um es mir zu zeigen. Das RCON-Passwort kommt dort nie vor.

## 7. Frontend

- **Kopfleiste:** Status (verbunden / pausiert / Verbindungsfehler) farbig und mit Text, Zeit der letzten Aktualisierung, TPS/MSPT, Pause-Schalter.
- **Spieler:** Liste (online zuerst, offline mit „Stand: …“), Bedrock-Kennzeichen. In der Detailansicht Position, Dimension, Herzen, Hunger und Level.
- **Inventar:** Raster wie im Spiel (3×9 plus Hotbar, Rüstung, Offhand, Enderkiste 3×9). Der Tooltip zeigt Name, Anzahl, Verzauberungen, eigenen Namen und eine Haltbarkeitsleiste. Auf Shulkerkisten und Bündel tippt man, um den Inhalt zu sehen. Am Touchscreen erscheint der Tooltip per Tippen.
- **Item-Icons:** Ohne Texturen gibt es eine Kachel mit Kurzname, Anzahl und einer aus dem Namen abgeleiteten Farbe. Optional liest das Backend `/data/textures/` und sucht dort `item/<id>.png` bzw. `block/<id>.png`. Es werden keine Assets mitgeliefert und keine aus dem Internet geladen.
- **Karte:** Canvas mit Zoom und Verschieben (Pointer Events, Pinch, Mausrad) und einem Raster, das sich dem Zoom anpasst. Tabs für die Dimensionen (unbekannte Dimensionen bekommen automatisch einen eigenen Tab). Ein Klick auf einen Spieler öffnet seine Details. **(A)** Offline-Spieler erscheinen an ihrer letzten Position als hohler Punkt und lassen sich ausblenden.
- **Konsole:** Ausgabe mit dargestellten §-Farbcodes, Verlauf per Pfeil hoch/runter (im Browser gespeichert). Gefährliche Befehle verlangen eine Bestätigung. Das gilt auch, wenn sie in `execute … run …` verpackt sind. Liste **(A)**: `stop, restart, reload, op, deop, ban, ban-ip, pardon, pardon-ip, kick, kill, whitelist, clear, save-off, difficulty, gamerule, fill, clone, setblock, worldborder, defaultgamemode`, per ENV erweiterbar.
- **Sessions:** Pro Spieler Gesamtzeit, zuletzt gesehen und die letzten Sessions. Lücken werden schraffiert als „unbekannt“ angezeigt.
- **Mobil/PWA:** Responsive Layout, `manifest.webmanifest`, eigene Icons (selbst gezeichnet, nicht aus Minecraft), `apple-touch-icon`, `display: standalone`. Der Service Worker wird **nur** registriert, wenn die Seite über HTTPS (`isSecureContext`) geladen wird.

## 8. Sicherheit

- `DASHBOARD_PASSWORD` kommt aus der ENV und wird zeitkonstant verglichen. Session-Cookie: zufälliges Token, HttpOnly, SameSite=Strict, `Secure` nur unter HTTPS, gültig 30 Tage **(A)**. Gespeichert wird nur der Hash des Tokens.
- Rate-Limit: 5 Fehlversuche in 15 Minuten pro IP, danach Sperre.
- POST-Endpunkte akzeptieren nur JSON (Schutz gegen CSRF zusätzlich zu SameSite). Dazu Security-Header und CSP mit `self`.
- `RCON_HOST`, `RCON_PORT` und `RCON_PASSWORD` nur aus der ENV. Sie gehen nie ans Frontend und nie in Logs. Ein Test stellt sicher, dass das Passwort in keiner API-Antwort vorkommt.
- Hinweis: RCON ist **unverschlüsselt**. Das Passwort geht im Klartext übers Internet zu Nitrado. Das README empfiehlt deshalb ein langes, zufälliges RCON-Passwort, das nirgends sonst verwendet wird.

## 9. Mock-Modus

`MOCK=true` startet im selben Prozess einen **simulierten RCON-Server**, der echte Antworten im Format der Fixtures liefert. Dadurch läuft der komplette Weg (RCON-Client → Parser → DB → UI) auch ohne echten Server. Simuliert werden 4–5 Spieler, darunter ein Bedrock-Spieler `.Steve Bedrock` mit Floodgate-UUID, in allen drei Dimensionen. Sie bewegen sich, loggen sich ein und aus und tragen verschiedene Items (verzaubert, umbenannt, beschädigt, Shulkerkiste mit Inhalt, Tränke, Bücher, Rüstung mit Offhand). Mit `MOCK_OLD_FORMAT=true` kommen Daten im alten Format.

## 10. Dateistruktur

```
mcrcondocker/
├─ package.json, tsconfig*.json, vite.config.ts, vitest.config.ts
├─ .env.example, .gitignore, .dockerignore
├─ Dockerfile, docker-compose.yml, README.md
├─ docs/
│  ├─ PLAN.md
│  ├─ datenformat.md          # Recherche + Testserver-Ergebnisse mit Quellen
│  └─ testserver.md           # wie die Fixtures entstanden sind (reproduzierbar)
├─ scripts/
│  ├─ testserver/docker-compose.yml
│  └─ capture-fixtures.ts     # schickt Befehle an den Testserver, speichert Rohantworten
├─ src/
│  ├─ shared/types.ts         # gemeinsame Typen Backend/Frontend
│  ├─ server/
│  │  ├─ index.ts, config.ts
│  │  ├─ rcon/{protocol,client,mock-server}.ts
│  │  ├─ parse/{snbt,text,responses,items,player,diagnostics}.ts
│  │  ├─ poller.ts, sessions.ts, textures.ts, auth.ts
│  │  ├─ db/{db,migrations,repo}.ts
│  │  └─ routes/{api,events,console,debug,textures}.ts
│  └─ web/
│     ├─ index.html, main.ts, App.svelte, api.ts, events.ts, stores.ts
│     ├─ lib/{mcText,format,dangerous}.ts
│     ├─ components/{StatusBar,PlayerList,PlayerDetail,InventoryGrid,ItemSlot,
│     │              ItemTooltip,MapCanvas,Console,ConfirmDialog,Sessions,Debug,Login}.svelte
│     └─ public/{manifest.webmanifest,icons/,sw.js}
└─ tests/
   ├─ fixtures/               # echte Rohantworten (26.3) + handgeschriebene im alten Format
   └─ unit/                   # snbt, items, player, responses, rcon (gegen Mock-Server), sessions
```

## 11. Schritte (jeder wird von mir selbst getestet)

1. **Plan und Rückfragen** ← jetzt
2. **Recherche und Testserver:** Wiki/Paper-Doku zu 26.3 durchsehen und `docs/datenformat.md` mit Quellen schreiben. Dann Paper 26.3 im Docker starten (RCON an, `online-mode=false`) und Rohantworten aufzeichnen: Truhe mit verschiedenen Items, Rüstungsständer, `/list`, `/list uuids`, `/tps`, `/mspt`, Fehlermeldungen und eine >4 KB große Antwort. Versuch mit Bot (mineflayer, falls 26.3 unterstützt), wenn möglich mit einem Namen mit Punkt und Leerzeichen über Papers Option, die Namensprüfung abzuschalten. Danach Server herunterfahren.
   *Test:* Fixtures liegen vor und sind dokumentiert.
3. **RCON-Client, Parser und Tests:** Protokoll, Warteschlange, Multi-Paket und Backoff. SNBT-Parser und Mapping alt/neu, Diagnose.
   *Test:* Vitest gegen die Fixtures und alte Beispiele, RCON-Client gegen den Mock-Server (Fragmentierung, Timeout, Reconnect, falsches Passwort).
4. **Backend und Datenbank:** Config, Auth, Poller, Sessions/Lücken, REST, SSE, Texturen, Mock-Modus.
   *Test:* Unit-Tests für die Session-Logik (Pause, Fehler, Neustart), API per HTTP gegen den Mock-Modus und noch einmal gegen den echten Testserver.
5. **Frontend:** alle Ansichten, Responsive Design, PWA.
   *Test:* Playwright-Screenshots auf Desktop und iPhone-Größe im Mock-Modus, Bedienung von Karte und Konsole.
6. **Docker und README:** Multi-Stage-Dockerfile, Multi-Arch-Build (amd64 + arm64 per buildx), Compose mit Healthcheck, deutsche Anleitung für Synology und Nitrado.
   *Test:* Image bauen, Container im Mock-Modus starten, Healthcheck grün, arm64-Build läuft durch.

## 12. Risiken

- **Das echte Bedrock-Verhalten kann ich nicht testen.** Ohne Bedrock-Client gibt es keinen echten Floodgate-Spieler. Abgesichert wird das durch UUID-basierte Ansprache, Tests mit Namen mit Punkt und Leerzeichen und, wenn möglich, einen Bot mit solchem Namen.
- **Nitrado** setzt möglicherweise eigene Werte (z.B. den RCON-Port). Das README erklärt, wo man sie findet.
- **Spätere Server-Updates** können das Format wieder ändern. Dafür gibt es den toleranten Parser, die Debug-Seite und die gespeicherten Rohdaten zum erneuten Einlesen.
