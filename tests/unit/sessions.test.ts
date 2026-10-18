import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../../src/server/db/db.js";
import { Repo } from "../../src/server/db/repo.js";
import { SessionTracker } from "../../src/server/sessions.js";

const A = { uuid: "aaaaaaaa-0000-0000-0000-000000000001", name: "Alex", isBedrock: false };
const B = { uuid: "00000000-0000-0000-0009-000000000002", name: ".Steve Bedrock", isBedrock: true };

function setup() {
  const repo = new Repo(openMemoryDb());
  return { repo, t: new SessionTracker(repo) };
}

describe("SessionTracker", () => {
  it("Login und Logout aus /list-Vergleich", () => {
    const { repo, t } = setup();
    t.observe([A], 1000);
    t.observe([A, B], 2000);
    t.observe([B], 3000);
    const a = repo.sessionsFor(A.uuid, 10);
    expect(a).toEqual([{ id: 1, uuid: A.uuid, start: 1000, end: 3000, endReason: "logout" }]);
    expect(repo.sessionsFor(B.uuid, 10)[0]).toMatchObject({ start: 2000, end: null });
    expect(repo.getPlayer(B.uuid)).toMatchObject({ name: ".Steve Bedrock", is_bedrock: 1, last_seen: 3000 });
  });

  it("Pause: offene Sessions enden mit 'unknown' zur letzten Abfrage, Lücke wird gespeichert", () => {
    const { repo, t } = setup();
    t.observe([A], 1000);
    t.observe([A], 2000);
    t.interrupt("paused", 2500);
    expect(repo.sessionsFor(A.uuid, 10)[0]).toMatchObject({ start: 1000, end: 2000, endReason: "unknown" });
    expect(repo.openGap()).toMatchObject({ start: 2000, end: null, reason: "paused" });
    // weitere Unterbrechungen während der Lücke ändern nichts
    t.interrupt("rcon_error", 5000);
    expect(repo.recentGaps(0)).toHaveLength(1);
    // Fortsetzen: Lücke endet, neue Session
    t.observe([A], 10_000);
    expect(repo.openGap()).toBeUndefined();
    expect(repo.recentGaps(0)[0]).toMatchObject({ start: 2000, end: 10_000, reason: "paused" });
    expect(repo.sessionsFor(A.uuid, 10)[0]).toMatchObject({ start: 10_000, end: null });
    // Gesamtzeit zählt die Lücke nicht
    const total = repo.sessionTotals(12_000).find((x) => x.uuid === A.uuid)!;
    expect(total.total).toBe(1000 + 2000);
  });

  it("RCON-Fehler erzeugt Lücke 'rcon_error'", () => {
    const { repo, t } = setup();
    t.observe([A, B], 1000);
    t.interrupt("rcon_error", 1500);
    expect(repo.openGap()!.reason).toBe("rcon_error");
    expect(repo.openSessions()).toEqual([]);
  });

  it("Neustart des Dashboards: Ausfallzeit wird zur Lücke 'dashboard_offline'", () => {
    const { repo, t } = setup();
    t.observe([A], 1000);
    // Prozess stirbt ohne sauberes Beenden
    const t2 = new SessionTracker(repo);
    t2.recoverOnStartup(50_000);
    expect(repo.sessionsFor(A.uuid, 10)[0]).toMatchObject({ end: 1000, endReason: "unknown" });
    expect(repo.openGap()).toMatchObject({ start: 1000, reason: "dashboard_offline" });
    t2.observe([], 60_000);
    expect(repo.recentGaps(0)[0]).toMatchObject({ end: 60_000 });
  });

  it("Neustart während Pause: Pause-Lücke läuft weiter", () => {
    const { repo, t } = setup();
    t.observe([A], 1000);
    t.interrupt("paused", 2000);
    new SessionTracker(repo).recoverOnStartup(9000);
    expect(repo.recentGaps(0)).toHaveLength(1);
    expect(repo.openGap()!.reason).toBe("paused");
  });

  it("Erststart ohne Daten erzeugt keine Lücke", () => {
    const { repo, t } = setup();
    t.recoverOnStartup(1000);
    expect(repo.openGap()).toBeUndefined();
  });
});
