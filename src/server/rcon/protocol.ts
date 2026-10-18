// RCON-Paketformat (Source RCON, wie von Minecraft verwendet):
//   int32 LE  length   (Anzahl Bytes nach diesem Feld)
//   int32 LE  requestId
//   int32 LE  type
//   bytes     body     (UTF-8)
//   0x00 0x00          (Body-Terminator + Pad-Byte)

export const PacketType = {
  /** Antwort vom Server; als Anfrage verwendet = "unbekannter Typ" → Marker */
  RESPONSE_VALUE: 0,
  /** Befehl (Anfrage) bzw. Auth-Antwort (vom Server) */
  EXEC_COMMAND: 2,
  AUTH_RESPONSE: 2,
  AUTH: 3,
} as const;

/** Minecraft akzeptiert eingehende Pakete bis 1460 Bytes inkl. Header. */
export const MAX_OUTGOING_BODY_BYTES = 1446;
/** Schutz gegen kaputte Längenangaben vom Server. */
export const MAX_INCOMING_PACKET_BYTES = 1024 * 1024;

export interface RconPacket {
  id: number;
  type: number;
  body: Buffer;
}

export function encodePacket(id: number, type: number, body: string): Buffer {
  const bodyBuf = Buffer.from(body, "utf8");
  const buf = Buffer.alloc(14 + bodyBuf.length);
  buf.writeInt32LE(10 + bodyBuf.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  bodyBuf.copy(buf, 12);
  // die beiden abschließenden Nullbytes sind durch Buffer.alloc bereits gesetzt
  return buf;
}

export class ProtocolError extends Error {}

/** Setzt Pakete aus beliebig zerstückelten TCP-Daten zusammen. */
export class PacketDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): RconPacket[] {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    const packets: RconPacket[] = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readInt32LE(0);
      if (length < 10 || length > MAX_INCOMING_PACKET_BYTES) {
        throw new ProtocolError(`Ungültige Paketlänge ${length}`);
      }
      if (this.buffer.length < 4 + length) break;
      const id = this.buffer.readInt32LE(4);
      const type = this.buffer.readInt32LE(8);
      // Body endet vor den zwei Nullbytes; tolerant, falls ein Server nur eins sendet
      let end = 4 + length;
      if (this.buffer[end - 1] === 0) end--;
      if (end > 12 && this.buffer[end - 1] === 0) end--;
      const body = Buffer.from(this.buffer.subarray(12, end));
      packets.push({ id, type, body });
      this.buffer = this.buffer.subarray(4 + length);
    }
    return packets;
  }

  reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}
