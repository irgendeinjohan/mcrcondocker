// Gamerules, die auf der Welt-Seite als Schalter erscheinen.
// Seit 1.21.11 heißen die Regeln anders (keep_inventory statt keepInventory).
// Das Dashboard fragt die Namen der Reihe nach ab und nimmt den ersten, den der Server kennt.

export interface GameruleDef {
  key: string;
  label: string;
  hint?: string;
  /** mögliche Namen, neueste zuerst */
  names: string[];
}

export const GAMERULES: GameruleDef[] = [
  { key: "keepInventory", label: "Inventar behalten", hint: "Items bleiben nach dem Tod erhalten", names: ["keep_inventory", "keepInventory"] },
  { key: "mobGriefing", label: "Mob-Griefing", hint: "Creeper, Endermen usw. verändern Blöcke", names: ["mob_griefing", "mobGriefing"] },
  { key: "doDaylightCycle", label: "Tageszyklus", hint: "Zeit läuft weiter", names: ["advance_time", "doDaylightCycle"] },
  { key: "doWeatherCycle", label: "Wetterwechsel", hint: "Wetter ändert sich von selbst", names: ["advance_weather", "doWeatherCycle"] },
  { key: "doMobSpawning", label: "Mobs spawnen", names: ["spawn_mobs", "doMobSpawning"] },
  { key: "doInsomnia", label: "Phantome", hint: "Phantome bei Schlafmangel", names: ["spawn_phantoms", "doInsomnia"] },
  { key: "doFireTick", label: "Feuer breitet sich aus", hint: "Zahl = Radius um Spieler (0 = aus)", names: ["fire_spread_radius_around_player", "doFireTick"] },
  { key: "pvp", label: "PvP", hint: "Spieler können sich gegenseitig schaden", names: ["pvp"] },
  { key: "naturalRegeneration", label: "Natürliche Regeneration", names: ["natural_health_regeneration", "naturalRegeneration"] },
  { key: "fallDamage", label: "Fallschaden", names: ["fall_damage", "fallDamage"] },
  { key: "doImmediateRespawn", label: "Sofort wiederbeleben", hint: "ohne Todesbildschirm", names: ["immediate_respawn", "doImmediateRespawn"] },
  { key: "showDeathMessages", label: "Todesnachrichten", names: ["show_death_messages", "showDeathMessages"] },
  { key: "announceAdvancements", label: "Fortschritte ansagen", names: ["show_advancement_messages", "announceAdvancements"] },
  { key: "locatorBar", label: "Locator-Bar", names: ["locator_bar", "locatorBar"] },
  { key: "playersSleepingPercentage", label: "Schlaf-Prozent", hint: "Anteil der Spieler, die schlafen müssen", names: ["players_sleeping_percentage", "playersSleepingPercentage"] },
];

export const GAMERULE_NAMES = new Set(GAMERULES.flatMap((g) => g.names));
