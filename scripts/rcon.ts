// Einzelne RCON-Befehle senden: tsx scripts/rcon.ts "list uuids" "tps"
// Verbindung aus RCON_HOST / RCON_PORT / RCON_PASSWORD.
import { RconClient } from "../src/server/rcon/client.js";

const client = new RconClient({
  host: process.env.RCON_HOST ?? "127.0.0.1",
  port: Number(process.env.RCON_PORT ?? 25575),
  password: process.env.RCON_PASSWORD ?? "",
});
client.start();
try {
  await client.waitForConnected();
  for (const cmd of process.argv.slice(2)) {
    const r = await client.send(cmd);
    console.log(`> ${cmd}   [${r.fragments} Paket(e), ${r.bytes} Bytes, ${r.durationMs} ms]`);
    console.log(JSON.stringify(r.body));
  }
} catch (e) {
  console.error("Fehler:", (e as Error).message);
  process.exitCode = 1;
} finally {
  client.stop();
}
