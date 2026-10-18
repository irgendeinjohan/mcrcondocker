// Simulierter RCON-Server mit dem am echten Paper-26.3-Server beobachteten
// Verhalten (siehe docs/datenformat.md):
// - genau ein Paket pro Lesevorgang, sonst Verbindungsabbruch
// - Antworten in Stücken zu 4096 Zeichen, gleiche ID, ohne Ende-Kennung
// - unbekannter Pakettyp → "Unknown request <hex>"
// - falsches Passwort → Auth-Antwort mit ID -1
import net from "node:net";
import { encodePacket, PacketDecoder, PacketType } from "./protocol.js";

export interface MockRconOptions {
  password: string;
  host?: string;
  port?: number;
  /** Liefert die Antwort auf einen Befehl (darf async sein) */
  handler: (command: string) => string | Promise<string>;
  /** Verbindung trennen, wenn mehrere Pakete in einem Chunk ankommen (wie Vanilla) */
  strictSingleRead?: boolean;
  /** künstliche Verzögerung pro Befehl in ms */
  delayMs?: number;
}

export interface MockRconServer {
  port: number;
  close(): Promise<void>;
  /** alle aktiven Verbindungen trennen (für Reconnect-Tests) */
  dropConnections(): void;
  connections(): number;
}

function writeChunked(socket: net.Socket, id: number, body: string): void {
  // Vanilla teilt nach Zeichen (String.length), nicht nach Bytes
  let rest = body;
  do {
    const part = rest.slice(0, 4096);
    rest = rest.slice(4096);
    socket.write(encodePacket(id, PacketType.RESPONSE_VALUE, part));
  } while (rest.length > 0);
}

export function startMockRconServer(opts: MockRconOptions): Promise<MockRconServer> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    const decoder = new PacketDecoder();
    let authed = false;
    // Pakete strikt nacheinander verarbeiten
    let chain = Promise.resolve();
    socket.on("data", (chunk) => {
      let packets;
      try {
        packets = decoder.push(chunk);
      } catch {
        socket.destroy();
        return;
      }
      if (opts.strictSingleRead !== false && packets.length > 1) {
        socket.destroy();
        return;
      }
      for (const p of packets) {
        chain = chain.then(async () => {
          if (socket.destroyed) return;
          if (p.type === PacketType.AUTH) {
            authed = p.body.toString("utf8") === opts.password;
            socket.write(encodePacket(authed ? p.id : -1, PacketType.AUTH_RESPONSE, ""));
            return;
          }
          if (!authed) {
            socket.write(encodePacket(-1, PacketType.AUTH_RESPONSE, ""));
            return;
          }
          if (p.type === PacketType.EXEC_COMMAND) {
            if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
            let out: string;
            try {
              out = await opts.handler(p.body.toString("utf8"));
            } catch (e) {
              out = `An unexpected error occurred trying to execute that command`;
            }
            if (!socket.destroyed) writeChunked(socket, p.id, out);
            return;
          }
          writeChunked(socket, p.id, `Unknown request ${p.type.toString(16)}`);
        });
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, opts.host ?? "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo;
      resolve({
        port: addr.port,
        close: () =>
          new Promise<void>((res) => {
            for (const s of sockets) s.destroy();
            server.close(() => res());
          }),
        dropConnections: () => {
          for (const s of sockets) s.destroy();
        },
        connections: () => sockets.size,
      });
    });
  });
}
