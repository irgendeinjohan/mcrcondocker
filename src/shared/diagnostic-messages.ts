import type { Locale } from "./translations.js";
export const DIAGNOSTIC_MESSAGES = {
  "snapshotCorrupt": [
    "Gespeicherter Datenstand ist beschädigt",
    "Stored player snapshot is corrupt"
  ],
  "pollCrash": [
    "Fehler im Abfragezyklus: {error}",
    "Polling cycle failed: {error}"
  ],
  "listNoUuid": [
    "Spieler \"{name}\" ohne UUID in /list – wird übersprungen",
    "Player \"{name}\" has no UUID in /list and will be skipped"
  ],
  "noTps": [
    "Der Server kennt /tps nicht (kein Paper?) – TPS wird nicht angezeigt",
    "The server does not support /tps (not Paper?). TPS will not be displayed"
  ],
  "noMspt": [
    "Der Server kennt /mspt nicht (kein Paper?) – MSPT wird nicht angezeigt",
    "The server does not support /mspt (not Paper?). MSPT will not be displayed"
  ],
  "listTruncated": [
    "/list ist gekürzt und die vollständige Spielerliste konnte nicht gelesen werden",
    "/list was truncated and the complete player list could not be read"
  ],
  "dumpFailed": [
    "Spielerdaten konnten nicht vollständig gelesen werden – nur Basiswerte (Rückfallweg)",
    "Could not read complete player data; showing basic values (fallback)"
  ],
  "listUnreadable": [
    "Antwort auf /list konnte nicht gelesen werden",
    "Could not parse the /list response"
  ],
  "listLeftover": [
    "Teil der /list-Antwort nicht zuordenbar",
    "Part of the /list response could not be identified"
  ],
  "listCountMismatch": [
    "/list meldet {online} Spieler, gelesen wurden {parsed}",
    "/list reports {online} players; parsed {parsed}"
  ],
  "tpsUnreadable": [
    "Antwort auf /tps konnte nicht gelesen werden",
    "Could not parse the /tps response"
  ],
  "tpsNoNumbers": [
    "Antwort auf /tps enthielt keine Zahlen",
    "The /tps response contained no numbers"
  ],
  "msptUnreadable": [
    "Antwort auf /mspt konnte nicht gelesen werden",
    "Could not parse the /mspt response"
  ],
  "entityUnreadable": [
    "Spielerdaten-Antwort konnte nicht gelesen werden",
    "Could not parse the player-data response"
  ],
  "entityUnknownPrefix": [
    "Spielerdaten-Antwort hat ein unbekanntes Format, versuche trotzdem zu lesen",
    "Player-data response has an unknown prefix; attempting to parse it"
  ],
  "entityNotCompound": [
    "Spielerdaten sind kein Compound",
    "Player data is not a compound"
  ],
  "entityTruncated": [
    "Spielerdaten waren abgeschnitten – es wird nur ein Teil angezeigt",
    "Player data was truncated; showing partial data"
  ],
  "entityParseError": [
    "SNBT-Fehler an Position {position}: {error}",
    "SNBT error at position {position}: {error}"
  ],
  "entityTrailing": [
    "Nach den Spielerdaten folgte weiterer Text",
    "Additional text followed the player data"
  ],
  "itemNotCompound": [
    "Item an {path} hat ein unerwartetes Format",
    "Item at {path} has an unexpected format"
  ],
  "itemNoId": [
    "Item ohne \"id\" an {path} wird übersprungen",
    "Item without an ID at {path} will be skipped"
  ],
  "unknownComponent": [
    "Unbekannte Item-Komponente \"{component}\" wird ignoriert",
    "Unknown item component \"{component}\" will be ignored"
  ],
  "itemListNotList": [
    "{path} ist keine Liste",
    "{path} is not a list"
  ],
  "unknownPlayerField": [
    "Unbekanntes Spielerfeld \"{field}\" wird ignoriert",
    "Unknown player field \"{field}\" will be ignored"
  ],
  "playerNoPos": [
    "Spielerdaten ohne lesbare Position (Pos)",
    "Player data has no readable position (Pos)"
  ],
  "playerNoDimension": [
    "Spielerdaten ohne Dimension",
    "Player data has no dimension"
  ],
  "playerNoHealth": [
    "Spielerdaten ohne Health",
    "Player data has no Health value"
  ],
  "inventorySlot": [
    "Inventar-Slot {slot} unbekannt (Item {item})",
    "Unknown inventory slot {slot} (item {item})"
  ],
  "playerNoInventory": [
    "Spielerdaten ohne Inventory",
    "Player data has no Inventory"
  ],
  "unknownEquipment": [
    "Unbekannter Ausrüstungsplatz \"{slot}\"",
    "Unknown equipment slot \"{slot}\""
  ],
  "snbtEndInput": [
    "Unerwartetes Ende der Eingabe",
    "Unexpected end of input"
  ],
  "snbtTruncated": [
    "Ausgabe abgekürzt (...)",
    "Output truncated (...)"
  ],
  "snbtEndCompound": [
    "Unerwartetes Ende in Compound",
    "Unexpected end inside compound"
  ],
  "snbtColon": [
    "':' nach Schlüssel \"{key}\" erwartet",
    "Expected ':' after key \"{key}\""
  ],
  "snbtCompoundSeparator": [
    "',' oder '}' erwartet, gefunden '{character}'",
    "Expected ',' or '}', found '{character}'"
  ],
  "snbtEndList": [
    "Unerwartetes Ende in Liste",
    "Unexpected end inside list"
  ],
  "snbtListSeparator": [
    "',' oder ']' erwartet, gefunden '{character}'",
    "Expected ',' or ']', found '{character}'"
  ],
  "snbtKey": [
    "Schlüssel erwartet, gefunden '{character}'",
    "Expected key, found '{character}'"
  ],
  "snbtString": [
    "String nicht abgeschlossen",
    "Unterminated string"
  ],
  "snbtValue": [
    "Wert erwartet, gefunden '{character}'",
    "Expected value, found '{character}'"
  ]
} as const;
export interface DiagnosticMessage {
  id: keyof typeof DIAGNOSTIC_MESSAGES;
  params?: Record<string, string | number>;
  children?: Record<string, DiagnosticMessage>;
}
export function diagnostic(id: DiagnosticMessage["id"], params?: DiagnosticMessage["params"], children?: DiagnosticMessage["children"]): DiagnosticMessage {
  return { id, ...(params ? { params } : {}), ...(children ? { children } : {}) };
}
export function formatDiagnostic(locale: Locale, message: DiagnosticMessage): string {
  const params = { ...message.params };
  for (const [key, child] of Object.entries(message.children ?? {})) params[key] = formatDiagnostic(locale, child);
  const template = DIAGNOSTIC_MESSAGES[message.id]?.[locale === "de" ? 0 : 1] ?? message.id;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => Object.hasOwn(params, key) ? String(params[key]) : match);
}
