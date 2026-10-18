import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { RconClient } from "../../src/server/rcon/client.js";
import { startMockRconServer, type MockRconServer } from "../../src/server/rcon/mock-server.js";
import { encodePacket, PacketDecoder } from "../../src/server/rcon/protocol.js";
import { fixture263 } from "./helpers.js";

let server: MockRconServer | undefined;
let client: RconClient | undefined;

afterEach(async () => {
  client?.stop();
  await server?.close();
  client = undefined;
  server = undefined;
});

async function setup(handler: (c: string) => string | Promise<string>, opts: Partial<ConstructorParameters<typeof RconClient>[0]> = {}) {
  server = await startMockRconServer({ password: "pw", handler });
  client = new RconClient({ host: "127.0.0.1", port: server.port, password: "pw", minBackoffMs: 50, maxBackoffMs: 200, ...opts });
  client.start();
  await client.waitForConnected(2000);
  return client;
}

describe("Protokoll", () => {
  it("Decoder setzt zerstückelte und zusammengeklebte Pakete zusammen", () => {
    const d = new PacketDecoder();
    const a = encodePacket(1, 0, "Hallo");
    const b = encodePacket(2, 0, "Wält");
    const all = Buffer.concat([a, b]);
    expect(d.push(all.subarray(0, 3))).toEqual([]);
    const ps = d.push(all.subarray(3));
    expect(ps.map((p) => [p.id, p.body.toString()])).toEqual([[1, "Hallo"], [2, "Wält"]]);
  });
});

describe("RconClient", () => {
  it("sendet Befehle nacheinander und liefert Antworten", async () => {
    const c = await setup((cmd) => `echo:${cmd}`);
    const rs = await Promise.all(["a", "b", "c"].map((x) => c.send(x)));
    expect(rs.map((r) => r.body)).toEqual(["echo:a", "echo:b", "echo:c"]);
  });

  it("setzt mehrteilige Antworten (>4096 Zeichen) zusammen, auch mit Mehrbyte-Zeichen", async () => {
    const big = fixture263("block-chest-large-string");
    const c = await setup(() => big);
    const r = await c.send("data modify storage mcdash:tmp s set string block 3 -59 0");
    expect(r.fragments).toBe(3);
    expect(r.body).toBe(big);
  });

  it("leere Antwort", async () => {
    const c = await setup(() => "");
    expect((await c.send("say hi")).body).toBe("");
  });

  it("Konsolenbefehle (high) überholen wartende Poll-Befehle", async () => {
    const order: string[] = [];
    const c = await setup(async (cmd) => {
      order.push(cmd);
      await new Promise((r) => setTimeout(r, 20));
      return cmd;
    });
    const ps = [c.send("poll1"), c.send("poll2"), c.send("poll3"), c.send("konsole", "high")];
    await Promise.all(ps);
    expect(order).toEqual(["poll1", "konsole", "poll2", "poll3"]);
  });

  it("falsches Passwort → auth_failed", async () => {
    server = await startMockRconServer({ password: "richtig", handler: () => "" });
    client = new RconClient({ host: "127.0.0.1", port: server.port, password: "falsch", minBackoffMs: 50 });
    const states: string[] = [];
    client.on("state", (s) => states.push(s));
    client.start();
    await new Promise((r) => setTimeout(r, 200));
    expect(states).toContain("auth_failed");
    expect(client.lastError).toBe("RCON-Passwort falsch");
  });

  it("verbindet nach Abbruch automatisch neu", async () => {
    const c = await setup((cmd) => cmd);
    server!.dropConnections();
    await new Promise((r) => setTimeout(r, 30));
    expect(c.state).not.toBe("connected");
    await c.waitForConnected(2000);
    expect((await c.send("wieder da")).body).toBe("wieder da");
  });

  it("Timeout bricht Befehl ab und verbindet neu", async () => {
    const c = await setup((cmd) => (cmd === "haengt" ? new Promise<string>(() => {}) : cmd), { commandTimeoutMs: 100 });
    await expect(c.send("haengt")).rejects.toMatchObject({ code: "timeout" });
    await c.waitForConnected(2000);
    expect((await c.send("ok")).body).toBe("ok");
  });

  it("ohne Verbindung sofortiger Fehler", async () => {
    client = new RconClient({ host: "127.0.0.1", port: 1, password: "x", minBackoffMs: 1000 });
    client.start();
    await expect(client.send("list")).rejects.toMatchObject({ code: "not_connected" });
  });

  it("zu langer Befehl wird abgelehnt", async () => {
    const c = await setup((cmd) => cmd);
    await expect(c.send("x".repeat(2000))).rejects.toMatchObject({ code: "too_long" });
  });

  it("Mock-Server trennt bei zwei Paketen in einem Lesevorgang (wie Vanilla)", async () => {
    server = await startMockRconServer({ password: "pw", handler: (c) => c });
    const sock = net.connect(server.port, "127.0.0.1");
    await new Promise((r) => sock.once("connect", r));
    const closed = new Promise((r) => sock.once("close", r));
    sock.write(Buffer.concat([encodePacket(1, 3, "pw"), encodePacket(2, 2, "list")]));
    await closed;
  });
});
