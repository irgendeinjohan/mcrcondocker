# MC-Dashboard

Selbst gehostetes Web-Dashboard für einen Minecraft-Server (Paper, getestet mit **26.3**). Es nutzt **ausschließlich RCON**: keine Plugins, keine Mods, nichts muss auf dem Server installiert werden. Gedacht für den Betrieb als Docker-Container auf einer Synology NAS im Heimnetz.

<p>
<img src="docs/img/desktop-spieler.png" alt="Spieleransicht mit Inventar und Tooltip" width="640">
<img src="docs/img/iphone-spieler.png" alt="Spielerliste auf dem iPhone" width="180">
<img src="docs/img/iphone-karte.png" alt="Karte auf dem iPhone" width="180">
</p>

## Funktionen

- **Spieler:** wer online ist, Koordinaten, Dimension, Leben, Hunger, XP-Level, Spielmodus, Effekte. Bedrock-Spieler (Geyser/Floodgate, z. B. `.Steve Bedrock`) werden erkannt und überall per UUID angesprochen, Präfixe und Leerzeichen sind also kein Problem.
- **Inventare wie im Spiel:** Inventar mit Hotbar, Rüstung, Offhand und Enderkiste. Der Tooltip zeigt Name, Anzahl, Verzauberungen, eigenen Namen, Haltbarkeit, Lore und den Inhalt von Shulkerkisten und Bündeln.
- **Offline-Stand:** Das letzte bekannte Inventar und die letzte Position werden gespeichert („Stand: …“).
- **2D-Karte:** Raster mit Koordinaten, Zoom und Verschieben (Maus und Touch), Tabs für Oberwelt/Nether/Ende, Spieler als Punkte. Ein Klick auf einen Spieler öffnet seine Details.
- **Konsole:** Befehle senden, §-Farbcodes werden dargestellt, Verlauf mit ↑/↓. Gefährliche Befehle (`stop`, `op`, `ban`, `kill`, `whitelist` …, auch in `execute … run`) verlangen eine Bestätigung.
- **Online-Zeiten:** Sessions aus dem Vergleich der `/list`-Abfragen, Gesamtzeit, letzte Sessions, „zuletzt gesehen“.
- **Pause-Schalter:** stoppt **alle** automatischen RCON-Abfragen und bleibt auch nach einem Neustart erhalten. Die Zeit der Pause wird als „unbekannt“ gespeichert, nicht als offline. Die Konsole funktioniert weiter.
- **Status:** verbunden / pausiert / Verbindungsfehler, Zeitpunkt der letzten Aktualisierung, TPS und MSPT von Paper.
- **Debug-Seite:** letzte Rohantworten pro Befehl und alle Parser-Warnungen, als JSON herunterladbar.
- **Handy:** responsives Layout, als Web-App auf dem iPhone-Home-Bildschirm nutzbar.

## Wie es funktioniert (und was es auf dem Server tut)

Alle 5 Sekunden (einstellbar) sendet das Dashboard über **eine einzige** RCON-Verbindung:

| Befehl | Wofür | Häufigkeit |
|---|---|---|
| `list uuids` | Wer ist online (Name + UUID) | jede Abfrage |
| `data modify storage mcdash:tmp s set string entity <UUID>` | alle Daten eines Spielers (Position, Werte, Inventare) | pro Online-Spieler |
| `tps`, `mspt` | Serverleistung (Paper) | alle 30 s |

Warum dieser seltsame zweite Befehl? `/data get entity` wird über RCON nach etwa 32 Textstücken mit „...“ **abgeschnitten**, das ist eine Schutzfunktion von Minecraft selbst. Der Befehl oben schlägt absichtlich fehl. Die Fehlermeldung enthält die **vollständigen** Spielerdaten in kompakter Form, und es wird dabei **nichts gespeichert oder verändert**. Das wurde an einem echten Paper-26.3-Server geprüft. Details stehen in [docs/datenformat.md](docs/datenformat.md).

Bei 5 Spielern sind das etwa 6 sehr leichte Befehle alle 5 Sekunden. Für den Server ist das vernachlässigbar.

---

## Einrichtung

### 1. RCON bei Nitrado aktivieren

1. Im Nitrado-Webinterface den Server **stoppen**.
2. Die Datei `server.properties` öffnen. Je nach Ansicht geht das über **Einstellungen** (eventuell den **Expertenmodus** einschalten) oder über **Konfigurationsdateien** / **Dateibrowser**. Hat das Webinterface eigene Felder für RCON, trag die Werte dort ein, damit Nitrado sie nicht überschreibt.
3. Diese Werte setzen:
   ```properties
   enable-rcon=true
   rcon.port=25575
   rcon.password=EIN-LANGES-ZUFAELLIGES-PASSWORT
   ```
   - **Port:** Nitrado vergibt die Ports pro Server. Steht im Webinterface ein eigener RCON-Port oder ist `rcon.port` bereits vorbelegt, nimm **diesen** Wert und ändere ihn nicht.
   - **Passwort:** mindestens 20 zufällige Zeichen, nirgends sonst verwenden. RCON ist **unverschlüsselt** und gibt **vollen Zugriff** auf den Server.
4. Speichern und den Server **starten**. RCON wird nur beim Start aktiviert.
5. Notieren: die **IP-Adresse** des Servers (ohne Spiel-Port), den **RCON-Port** und das **RCON-Passwort**.

> Ob alles stimmt, zeigt später das Dashboard: „Verbindung abgelehnt (RCON aktiv? Port richtig?)“ heißt, dass Port oder `enable-rcon` nicht stimmen. „RCON-Passwort falsch“ erklärt sich selbst.

### 2. Docker-Image bereitstellen

Das Image wird bei jedem Push auf `main` automatisch per GitHub Actions gebaut, für **amd64 und arm64** (Intel/AMD- und ARM-NAS): `ghcr.io/irgendeinjohan/mcrcondocker:latest`

- **Öffentliches Repository:** Das Paket kann direkt geladen werden. Falls nicht, auf GitHub unter *Profil → Packages → mcrcondocker → Package settings → Change visibility → Public* umstellen. Das Image enthält keine Passwörter.
- **Privates Paket:** Im Container Manager unter *Registry → Einstellungen → Hinzufügen* die Registry `https://ghcr.io` mit deinem GitHub-Benutzernamen und einem Token mit dem Recht `read:packages` als Passwort eintragen.
- **Alternativ selbst bauen:** Das Repository als ZIP herunterladen (*Code → Download ZIP*), in den Projektordner entpacken und in der Compose-Datei `image:` durch `build: .` ersetzen. Der Bau dauert auf schwachen NAS einige Minuten.

### 3. Projekt im Synology Container Manager anlegen

1. **Container Manager** aus dem Paketzentrum installieren (DSM 7.2 oder neuer).
2. In der **File Station** den Ordner `docker/mc-dashboard` und darin einen Unterordner `data` anlegen.
3. **Container Manager → Projekt → Erstellen**
   - Projektname: `mc-dashboard`
   - Pfad: `/docker/mc-dashboard`
   - Quelle: **docker-compose.yml erstellen**. Den folgenden Inhalt einfügen und die markierten Werte anpassen:

   ```yaml
   services:
     mc-dashboard:
       image: ghcr.io/irgendeinjohan/mcrcondocker:latest
       container_name: mc-dashboard
       restart: unless-stopped
       environment:
         DASHBOARD_PASSWORD: "dein-dashboard-passwort"   # ← ändern (min. 8 Zeichen)
         RCON_HOST: "123.45.67.89"                       # ← IP des Nitrado-Servers
         RCON_PORT: "25575"                              # ← RCON-Port
         RCON_PASSWORD: "dein-rcon-passwort"             # ← RCON-Passwort
         TZ: "Europe/Berlin"
         POLL_INTERVAL_SECONDS: "5"
         FLOODGATE_PREFIX: "."
       ports:
         - "8080:8080"                                   # ← links ggf. anderen freien Port wählen
       volumes:
         - ./data:/data
   ```
4. **Weiter** → die Web-Portal-Einstellungen überspringen → **Fertig**. Das Image wird geladen und der Container gestartet.
5. Im Browser `http://<IP-der-NAS>:8080` öffnen und mit dem Dashboard-Passwort anmelden.

**Dateirechte:** Der Container startet als unprivilegierter Benutzer und übernimmt beim Start den Ordner `data` automatisch. Klappt das auf deinem System nicht, steht im Container-Protokoll ein Hinweis. Dann in der Compose-Datei unter `environment` `PUID` und `PGID` auf die IDs deines NAS-Benutzers setzen. Die findest du per SSH mit dem Befehl `id`, meist `PUID: "1026"` und `PGID: "100"`.

**Update:** *Container Manager → Projekt → mc-dashboard → Aktion → Stoppen*, dann unter *Image* das Image `ghcr.io/irgendeinjohan/mcrcondocker` auswählen und **Aktualisieren** (bzw. löschen), anschließend das Projekt wieder **Erstellen/Starten**. Die Daten in `data/` bleiben erhalten.

### 4. Als App auf dem iPhone

Das Dashboard in **Safari** öffnen → **Teilen** → **Zum Home-Bildschirm**. Es startet dann im Vollbild wie eine App. Offline-Unterstützung (Service Worker) gibt es nur, wenn das Dashboard über **HTTPS** läuft (siehe [Sicherheit](#sicherheit)). Über HTTP im Heimnetz funktioniert alles andere genauso.

---

## Item-Texturen und deutsche Item-Namen (optional)

Ohne weitere Dateien zeigt das Dashboard farbige Kacheln mit Kurznamen (z. B. „DiSw“ für Diamond Sword). Echte Bilder kannst du aus **deiner eigenen** Minecraft-Installation bereitstellen. Das Dashboard lädt nichts aus dem Internet und bringt keine Assets mit.

1. Den Ordner `data/assets` anlegen (in der File Station: `docker/mc-dashboard/data/assets`).
2. Die Client-`.jar` deiner Minecraft-Version **hineinkopieren**, entpacken ist nicht nötig:
   - Windows: `%APPDATA%\.minecraft\versions\26.3\26.3.jar`
   - macOS: `~/Library/Application Support/minecraft/versions/26.3/26.3.jar`
   - Linux: `~/.minecraft/versions/26.3/26.3.jar`
3. Container neu starten. Auf der Debug-Seite steht dann „Texturen: jar (26.3.jar)“, und die Item-Namen kommen aus der englischen Sprachdatei der `.jar`.

Alternativ geht auch ein entpackter Ordner `data/assets/textures/item/*.png` und `…/block/*.png`.

**Deutsche Namen:** Die deutsche Sprachdatei liegt nicht in der `.jar`, sondern im Asset-Speicher des Launchers:
1. `.minecraft/assets/indexes/` → die neueste `.json`-Datei mit einem Texteditor öffnen und nach `minecraft/lang/de_de.json` suchen. Dahinter steht ein `"hash": "ab12…"`.
2. Die Datei `.minecraft/assets/objects/ab/ab12…` (erste zwei Zeichen = Ordner) nach `data/assets/de_de.json` kopieren.
3. Container neu starten.

---

## Konfiguration

| Variable | Standard | Bedeutung |
|---|---|---|
| `DASHBOARD_PASSWORD` | – (Pflicht) | Passwort für die Anmeldung (min. 8 Zeichen) |
| `RCON_HOST` | – (Pflicht) | IP/Hostname des Minecraft-Servers |
| `RCON_PORT` | `25575` | RCON-Port |
| `RCON_PASSWORD` | – (Pflicht) | RCON-Passwort |
| `POLL_INTERVAL_SECONDS` | `5` | Abfrageintervall (min. 2) |
| `PERF_INTERVAL_SECONDS` | `30` | Intervall für `/tps` und `/mspt` |
| `RCON_TIMEOUT_SECONDS` | `10` | Wartezeit auf eine RCON-Antwort |
| `FLOODGATE_PREFIX` | `.` | Namenspräfix von Bedrock-Spielern |
| `DANGEROUS_COMMANDS` | – | zusätzliche Befehle, die eine Bestätigung brauchen (kommagetrennt) |
| `SESSION_DAYS` | `30` | wie lange eine Anmeldung gültig bleibt |
| `LANGUAGE_FILE` | `de_de` | Name der Sprachdatei in `data/assets` |
| `PUID` / `PGID` | – | Container mit dieser Benutzer-/Gruppen-ID betreiben |
| `TRUST_PROXY` | `false` | `true`, wenn ein Reverse-Proxy davor sitzt |
| `COOKIE_SECURE` | `auto` | `auto` = Secure-Cookie nur bei HTTPS |
| `MOCK` | `false` | Beispieldaten statt echtem Server (siehe unten) |

Die RCON-Zugangsdaten stehen nur in den Umgebungsvariablen. Sie werden nie an den Browser geschickt und nie protokolliert.

## Sicherheit

- Das Dashboard ist für das **Heimnetz** gedacht. **Keine Portfreigabe** im Router einrichten.
- Anmeldung mit einem Passwort. Die Sitzung liegt in einem HttpOnly-Cookie (`SameSite=Strict`). Nach 5 Fehlversuchen in 15 Minuten wird die IP gesperrt.
- RCON-Verbindungen sind **unverschlüsselt**. Das Passwort geht im Klartext zu Nitrado, deshalb ein eigenes, langes RCON-Passwort verwenden.
- **HTTPS (optional):** Über *Systemsteuerung → Anmeldeportal → Erweitert → Reverse Proxy* einen Eintrag von `https://mc.deine-nas.local:8443` auf `http://localhost:8080` anlegen und `TRUST_PROXY: "true"` setzen. Dann sind auch Secure-Cookies und der Service Worker aktiv.

## Pause und Online-Zeiten

- **⏸ Pausieren** stoppt alle automatischen Abfragen sofort. Der Zustand wird gespeichert und gilt auch nach einem Neustart.
- Während der Pause, bei Verbindungsfehlern und solange das Dashboard selbst nicht läuft, ist unbekannt, wer online war. Diese Zeiten werden als **Lücke** gespeichert. Sessions, die in eine Lücke fallen, enden mit „unbekannt“, und die Lücke zählt **nicht** zur Online-Zeit. Unter *Zeiten* ist jede Lücke mit Grund aufgeführt.
- Eine Session beginnt mit der ersten Abfrage, bei der ein Spieler online ist, und endet mit der ersten, bei der er fehlt. Die Genauigkeit entspricht also dem Abfrageintervall.

## Fehlerbehebung

| Anzeige | Ursache / Lösung |
|---|---|
| „Verbindung abgelehnt (RCON aktiv? Port richtig?)“ | `enable-rcon=true`? Server danach neu gestartet? RCON-Port richtig? |
| „RCON-Passwort falsch“ | `RCON_PASSWORD` mit `rcon.password` vergleichen (Groß-/Kleinschreibung) |
| „Zeitüberschreitung beim Verbinden“ | IP falsch oder Server offline |
| Inventare fehlen, Hinweis „Rückfallweg“ | Das Antwortformat hat sich geändert (z. B. nach einem Minecraft-Update). Auf der **Debug-Seite** „Als JSON herunterladen“ und die Datei zur Analyse weitergeben. |
| Container startet nicht, „DASHBOARD_PASSWORD …“ im Protokoll | Pflichtvariable fehlt oder ist zu kurz |
| Warnung „/data ist … nicht beschreibbar“ | `PUID`/`PGID` setzen (siehe oben) |

## Mock-Modus (ohne echten Server ausprobieren)

```yaml
environment:
  MOCK: "true"
  DASHBOARD_PASSWORD: "mock-passwort"
```

Simuliert werden fünf Spieler, darunter der Bedrock-Spieler `.Steve Bedrock`, in allen Dimensionen. Sie bewegen sich und loggen sich ein und aus. Die Antworten haben exakt das Format von Paper 26.3. Mit `MOCK_OLD_FORMAT: "true"` kommen die Daten im alten Format (1.20.4).

## Entwicklung

```bash
npm install
npm run mock          # Backend im Mock-Modus auf :8080 (Passwort "mock")
npm run dev:web       # Vite-Dev-Server auf :5173 (leitet /api an :8080 weiter)
npm test              # Unit- und Integrationstests (Parser, RCON, Sessions, API)
npm run check         # Typprüfung Backend + Svelte
npm run build         # Produktions-Build nach dist/
```

- `src/server`: Fastify-Backend (RCON-Client, Parser, Poller, SQLite über `node:sqlite`)
- `src/web`: Svelte-5-Frontend
- `src/shared`: gemeinsame Typen, §-Code- und Text-Komponenten-Parser
- `tests/fixtures/26.3`: **echte** Rohantworten eines Paper-26.3-Testservers. Wie sie aufgezeichnet werden, steht in [docs/testserver.md](docs/testserver.md).
- [docs/datenformat.md](docs/datenformat.md): Datenformat und RCON-Verhalten mit Quellen
- [docs/PLAN.md](docs/PLAN.md): Architektur und Plan
