# Testserver für Fixtures

So sind die Dateien in `tests/fixtures/26.3/` entstanden. Der Ablauf lässt sich wiederholen, zum Beispiel nach einem Minecraft-Update mit einer neuen Versionsnummer.

> Die Plugins **ViaVersion/ViaBackwards** und die Einstellung „Namensprüfung aus“ gab es **nur auf diesem lokalen Testserver**, damit Testbots beitreten konnten. Der echte Server braucht nichts davon.

## 1. Server starten

Paper 26.3 braucht Java 25.

```bash
mkdir testserver && cd testserver
curl -L -o paper.jar "$(curl -s https://fill.papermc.io/v3/projects/paper/versions/26.3/builds/latest | jq -r '.downloads["server:default"].url')"
echo "eula=true" > eula.txt
cat > server.properties <<'EOF'
enable-rcon=true
rcon.port=25575
rcon.password=testpass123
online-mode=false
level-type=minecraft\:flat
view-distance=4
EOF
java -Xmx2G -jar paper.jar --nogui
```

Die Alternative mit Docker: `docker compose -f scripts/testserver/docker-compose.yml up` (Image `itzg/minecraft-server`).

Hinweis: In 26.3 ist `white-list=true` offenbar Standard. Für Bots also `whitelist off` per RCON ausführen.

## 2. Welt-Fixtures (Truhen, Rüstungsständer, Fehlermeldungen)

```bash
RCON_PASSWORD=testpass123 npm run capture -- tests/fixtures/26.3 world
```

## 3. Spieler-Fixtures mit Bots (optional)

mineflayer unterstützt bis 26.1. Mit ViaVersion und ViaBackwards auf dem **Testserver** kann ein 26.1-Bot beitreten:

1. `plugins/ViaVersion.jar` und `plugins/ViaBackwards.jar` von Modrinth herunterladen (Version für 26.3).
2. In `config/paper-global.yml` `unsupported-settings.perform-username-validation: false` setzen (erlaubt `.` im Namen).
3. Server neu starten, `whitelist off`.
4. Bots verbinden. Bewegungspakete werden unterdrückt, weil sie über ViaBackwards fehlerhaft ankommen und der Server den Bot sonst kickt:

```js
import mineflayer from "mineflayer";
const DROP = new Set(["position", "position_look", "look", "flying"]);
for (const username of ["Steve_Java", ".Bedrock_Spieler", "Alex"]) {
  const bot = mineflayer.createBot({ host: "127.0.0.1", port: 25565, username, version: "26.1", auth: "offline" });
  const w = bot._client.write.bind(bot._client);
  bot._client.write = (n, p) => (DROP.has(n) ? undefined : w(n, p));
}
```

5. `RCON_PASSWORD=testpass123 npm run capture -- tests/fixtures/26.3 players`

Das Skript setzt `difficulty peaceful` und `time set day` (sonst stirbt ein Bot nachts), verteilt Items, Rüstung, Enderkisten-Inhalt, XP und Schaden und teleportiert die Bots in Overworld, Nether und End.

## 4. Aufräumen

`stop` per RCON, danach den Ordner löschen.
