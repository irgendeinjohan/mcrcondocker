# Datenformat und RCON-Verhalten (Paper 26.3)

Stand: 18.10.2026. Grundlage sind die Recherche (Quellen unten) und vor allem **echte Antworten eines lokalen Paper-26.3-Testservers** (Build 205). Alle Rohantworten liegen in [`tests/fixtures/26.3/`](../tests/fixtures/26.3), die Metadaten (Befehl, Paketanzahl, Bytes) in `index.json`. Wie sie entstanden sind, steht in [testserver.md](testserver.md).

> **Kurzfassung:** Das Dashboard holt pro Spieler alle Daten mit einem einzigen Befehl:
> `data modify storage mcdash:tmp s set string entity <UUID>`
> Die Antwort ist eine Fehlermeldung, die das **vollständige, kompakte SNBT** enthält. Es wird dabei **nichts geschrieben**. Begründung siehe Abschnitt 2.

---

## 1. RCON-Protokoll – Befunde am echten Server

| Befund | Nachweis | Folge für das Dashboard |
|---|---|---|
| Der Server liest **pro `read()` genau ein Paket** und prüft, ob die Länge exakt passt. Kommen zwei Pakete in einem Lesevorgang an (z. B. Befehl + Marker direkt hintereinander), **trennt er die Verbindung**. | `list` + `tps` direkt nacheinander gesendet → Verbindung geschlossen; mit Pause dazwischen → ok | Vom Client ist immer höchstens **ein** Paket unterwegs. |
| Lange Antworten werden in Pakete zu **4096 Zeichen** (Java-`String`-Länge, nicht Bytes) aufgeteilt, ohne Ende-Kennzeichnung. | `block-chest-large-string`: 11 916 Bytes in 3 Paketen | Fragmente als Bytes sammeln und erst am Ende als UTF-8 dekodieren. |
| Ein Paket mit unbekanntem Typ (hier 0) wird mit `Unknown request 0` unter derselben ID beantwortet. | raw dump | Dient als **Ende-Marker**. Er wird erst nach dem **ersten** Antwortfragment gesendet. Der Server schreibt alle Fragmente, bevor er das nächste Paket liest. |
| Jeder Befehl liefert mindestens ein Paket, auch mit leerem Text (`say` → `""`). | `say.txt` | Das Warten auf das erste Fragment kann also nicht hängen bleiben. |
| Falsches Passwort → Auth-Antwort mit ID `-1`. | Test | Status „RCON-Passwort falsch“, Reconnect mit Backoff |
| Antworten sind **englisch** (Server-Locale), unabhängig von der Client-Sprache. | alle Fixtures | Parser arbeitet auf englischen Texten |
| Paper-Befehle (`tps`, `mspt`, `version`) liefern **§-Farbcodes**. Vanilla-Befehle liefern reinen Text. | `tps.txt`, `mspt.txt` | §-Codes in der Konsole farbig darstellen, für Parser entfernen |

## 2. `/data get` ist über RCON unbrauchbar (Abschneiden nach ~32 Textstücken)

**Befund:** `data get entity <Spieler>` endet über RCON nach wenigen Feldern mit `...`:

```
Alex has the following entity data: {seenCredits: 0b, DeathTime: 0s, Bukkit.updateLevel: 2, foodTickTimer: 0, recipeBook: {...
```

**Ursache** (im Server-Code von 26.3 nachvollzogen): `RconConsoleSource` wandelt Meldungen mit `Component.getString()` in Text um. `TranslatableContents` bricht dabei nach **32 Textstücken** ab (`TranslatableContentConsumer`, Ausnahme „Too long“) und ersetzt den Rest durch `...`. Das ist ein Vanilla-Schutz gegen Übersetzungs-„Bomben“. Die hübsche NBT-Ausgabe besteht aus vielen kleinen Komponenten (Schlüssel, `: `, Wert, `, ` …), deshalb ist sie schon nach wenigen Feldern erschöpft. Das gilt für jede Version mit dieser Prüfung, nicht nur für Paper.

**Lösung:** Die `string`-Quelle von `/data modify` akzeptiert nur einfache Werte. Bei einem Compound oder einer Liste wirft sie den Fehler

```
Expected a value: got {AbsorptionAmount:0.0f,Air:300s,…}
```

mit dem **vollständigen kompakten SNBT** als *einem* Textstück. Getestet mit 11 916 Bytes, nichts abgeschnitten. Weil der Befehl fehlschlägt, wird **nichts in den Storage geschrieben** (geprüft: `data get storage mcdash:tmp` → `{}`, siehe `storage-after*.txt`). Es gibt auch keine „[Rcon: …]“-Meldung an Operatoren, denn die kommen nur bei Erfolg.

⚠️ Zeigt der Pfad auf einen **einfachen Wert** (z. B. `… entity <uuid> Health`), ist der Befehl erfolgreich und schreibt tatsächlich in den Storage. Das Dashboard fragt deshalb **immer die ganze Entity** ab (immer ein Compound).

**Rückfallweg:** Liefert dieser Befehl irgendwann kein „Expected a value: got“ mehr, etwa nach einem Update, fragt das Dashboard Einzelwerte mit `data get entity <uuid> <Pfad>` ab (Pos, Dimension, Health, foodLevel, XpLevel …). Diese sind kurz genug. Inventare sind dann nicht verfügbar, und die Debug-Seite meldet das.

## 3. Befehle und Antworten

| Befehl | Antwort (Beispiel) | Fixture |
|---|---|---|
| `list` | `There are 3 of a max of 20 players online: .Bedrock_Spieler, Steve_Java, Alex` | `list-3-players` |
| `list uuids` | `There are 3 of a max of 20 players online: .Bedrock_Spieler (56200adf-…), Steve_Java (…), Alex (…)` | `list-uuids-3-players` |
| `list uuids` (leer) | `There are 0 of a max of 20 players online: ` (Leerzeichen am Ende) | `list-uuids-empty` |
| `tps` | `§6TPS from last 1m, 5m, 15m: §a20.0§r, §a20.0§r, §a20.0\n` | `tps` |
| `mspt` | zwei Zeilen, `◴ avg/min/max` für 5 s, 10 s, 1 min | `mspt` |
| `data modify storage mcdash:tmp s set string entity <uuid>` | `Expected a value: got {…}` | `player-*-string` |
| … unbekannter Spieler | `No entity was found` | `error-string-player-not-found` |
| `data get block` (nicht geladen) | `That position is not loaded` | `error-not-loaded` |
| kein Block-Entity | `The target block is not a block entity` | `error-not-block-entity` |
| Pfad fehlt | `Found no elements matching Foo` | `error-no-such-path` |
| unbekannter Befehl | `Unknown or incomplete command. See below for error\n…<--[HERE]` | `error-unknown-command` |
| `xp set <uuid> …` | `Only players may be affected by this command, but the provided selector includes entities` | `error-xp-uuid-selector` |

**Spielernamen:** `list uuids` trennt mit `, ` und hängt ` (uuid)` an. Der Parser zerlegt die Liste anhand des UUID-Musters, nicht anhand von Kommas oder Leerzeichen. Namen mit Punkt (Floodgate-Präfix) funktionieren in Befehlen auch direkt. Namen mit **Leerzeichen** lehnt der Server bei der Anmeldung ab („The name of the profile contains invalid characters“). Floodgate ersetzt Leerzeichen deshalb standardmäßig durch `_` (Option `replace-spaces`). Das Dashboard spricht trotzdem jeden Spieler **per UUID** an, so ist es in jedem Fall sicher.

**UUID-Selektoren:** Eine UUID gilt als Entity-Selektor. Befehle, die nur Spieler erlauben (`xp`, `gamemode` …), lehnen sie ab. Das betrifft nur manuell eingegebene Konsolenbefehle (Workaround: `execute as <uuid> run xp set @s 30 levels`). `data` funktioniert mit UUIDs.

## 4. Spieler-NBT (26.3, DataVersion 5023)

Gelesen aus `player-alex-string.txt`:

| Feld | Typ | Bedeutung |
|---|---|---|
| `Pos` | `[double×3]` | x, y, z |
| `Dimension` | string | `minecraft:overworld`, `minecraft:the_nether`, `minecraft:the_end`, eigene |
| `Health` | float | Leben (20 = 10 Herzen) |
| `attributes[{id:"minecraft:max_health",base}]` | list | maximales Leben |
| `foodLevel`, `foodSaturationLevel` | int, float | Hunger |
| `XpLevel`, `XpP` | int, float | Level und Fortschritt (0–1) |
| `playerGameType` | int | 0 Survival, 1 Creative, 2 Adventure, 3 Spectator |
| `SelectedItemSlot` | int | Hotbar-Slot 0–8 |
| `Inventory[]` | `{Slot:byte, id, count, components?}` | Slots **0–8 Hotbar, 9–35 Inventar**. **Keine** Slots 100–103/-106 mehr. |
| `equipment` | `{head, chest, legs, feet, offhand, body?, saddle?}` | **Rüstung und Offhand** (seit 25w03a bzw. 1.21.5) |
| `EnderItems[]` | `{Slot:0–26, …}` | Enderkiste |
| `active_effects[]` | `{id, amplifier, duration, …}` | Effekte |
| `UUID` | `[I; a,b,c,d]` | UUID als 4 Ints |

Dazu kommen viele weitere Felder (`Brain`, `recipeBook`, `abilities`, `Paper.*`, `Bukkit.*`, `Spigot.*`, `warden_spawn_tracker` …). Der Parser ignoriert sie und meldet Unbekanntes einmalig als Hinweis.

**Altes Format (bis 1.21.4):** Rüstung lag im Inventar auf Slot 100 (Füße), 101 (Beine), 102 (Brust) und 103 (Kopf), die Offhand auf -106. Der Parser liest beide Varianten.

## 5. Item-Format

Kompaktes SNBT aus `block-chest-items-string`:

```
{Slot:0b,components:{"minecraft:custom_name":{color:"gold",italic:0b,text:"Excalibur"},
 "minecraft:damage":120,"minecraft:enchantments":{"minecraft:mending":1,"minecraft:sharpness":5,"minecraft:unbreaking":3}},
 count:1,id:"minecraft:diamond_sword"}
```

| Merkmal | 26.3 (gemessen) | 1.20.5 – 1.21.4 | vor 1.20.5 |
|---|---|---|---|
| Anzahl | `count` (int) | `count` | `Count` (byte) |
| Zusatzdaten | `components:{"minecraft:…":…}` | `components` | `tag:{…}` |
| Verzauberungen | `"minecraft:enchantments":{"minecraft:sharpness":5}` | `{levels:{…},show_in_tooltip:…}` | `tag.Enchantments:[{id,lvl}]` |
| Eigener Name | `custom_name` als **SNBT-Text-Komponente** (`{text:…,color:…}` oder `"Lager"`) | JSON-String `'{"text":"…"}'` | `tag.display.Name` (JSON) |
| Lore | Liste aus Strings/Compounds (gemischt) | JSON-Strings | `tag.display.Lore` |
| Haltbarkeit | `damage` (benutzte Punkte). `max_damage` **nur, wenn abweichend** | gleich | `tag.Damage` |
| Shulker-Inhalt | `container:[{slot:int,item:{…}}]` | gleich | `tag.BlockEntityTag.Items` |
| Bündel | `bundle_contents:[{id,count}]` | gleich | `tag.Items` |
| Buch | `written_book_content:{title:{raw:"…"},author,pages:[{raw:"…"}]}` | – | `tag.title` |
| Unzerbrechlich | `unbreakable:{}` | `{show_in_tooltip}` | `tag.Unbreakable:1b` |

- `count` fehlt, wenn er 1 ist (z. B. die Spitzhacke im Shulker, siehe Fixture). Ersatzwert ist also 1.
- Die maximale Haltbarkeit steht **nicht** in den Daten, wenn sie dem Standard entspricht. Das Dashboard bringt eine Tabelle der Vanilla-Werte mit (`src/server/parse/durability.ts`).
- Gemischte Listen können intern als `[{"":"a"},{b:3}]` erscheinen. Der Text-Parser versteht beide Formen.
- Entfernte Standard-Komponenten erscheinen als `"!minecraft:…"` und werden ignoriert.

## 6. Rüstungsständer (`entity-armor-stand-string`)

`equipment:{head,chest,legs,feet,mainhand,offhand}`. Das bestätigt das neue `equipment`-Feld auch für Nicht-Spieler.

## Quellen

- Minecraft Wiki – Player.dat format: <https://minecraft.wiki/w/Player.dat_format> (Rüstung und Offhand vor 25w03a im Inventar, Slots 100–103/-106)
- Minecraft Wiki – Item format: <https://minecraft.wiki/w/Item_format> (id, count, components, container, bundle_contents, custom_name als Text-Komponente)
- Minecraft Wiki – Java Edition 25w03a: <https://minecraft.wiki/w/Java_Edition_25w03a> (`equipment`-Feld)
- Minecraft Wiki – Java Edition 1.20.5: <https://minecraft.wiki/w/Java_Edition_1.20.5> (`Count`→`count`, `tag`→`components`)
- Minecraft Wiki – Java Edition 1.21.5: <https://minecraft.wiki/w/Java_Edition_1.21.5> (`tooltip_display`, gemischte Listen in SNBT)
- Minecraft Wiki – Text component format: <https://minecraft.wiki/w/Text_component_format> (seit 1.21.5 als NBT gespeichert)
- Minecraft Wiki – Java Edition 26.3: <https://minecraft.wiki/w/Java_Edition_26.3> (neue Befehle `/compute`, `/posteffect`. Keine relevanten Änderungen an `/data` oder `/list` gefunden)
- Minecraft Wiki – Commands/list, Commands/data: <https://minecraft.wiki/w/Commands/list>, <https://minecraft.wiki/w/Commands/data>
- Paper-Doku – Commands (`/tps`: 1/5/15 min; `/mspt`: avg/min/max über 5/10/60 s): <https://docs.papermc.io/paper/reference/commands/>
- Server-Code Paper 26.3 Build 205 (Mojang-Namen, dekompiliert mit Vineflower): `RconConsoleSource.sendSystemMessage`, `TranslatableContents$TranslatableContentConsumer`, `StringTag.quoteAndEscape`, `TextComponentTagVisitor`
