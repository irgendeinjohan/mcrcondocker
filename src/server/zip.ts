// Minimaler ZIP-Leser (nur lesen, Methoden "stored" und "deflate"), um Texturen
// und Sprachdateien direkt aus der Minecraft-Client-.jar zu lesen.
import { openSync, readSync, closeSync, fstatSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

interface Entry {
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

export class ZipReader {
  private fd: number;
  private entries = new Map<string, Entry>();

  constructor(readonly file: string) {
    this.fd = openSync(file, "r");
    try {
      this.readDirectory();
    } catch (e) {
      closeSync(this.fd);
      throw e;
    }
  }

  private read(pos: number, len: number): Buffer {
    const buf = Buffer.alloc(len);
    let off = 0;
    while (off < len) {
      const n = readSync(this.fd, buf, off, len - off, pos + off);
      if (n === 0) break;
      off += n;
    }
    return buf.subarray(0, off);
  }

  private readDirectory(): void {
    const size = fstatSync(this.fd).size;
    const tailLen = Math.min(size, 65_557);
    const tail = this.read(size - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error("Keine gültige ZIP/JAR-Datei");
    let count = tail.readUInt16LE(eocd + 10);
    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);
    // ZIP64
    if (cdOffset === 0xffffffff || count === 0xffff) {
      const loc = eocd - 20;
      if (loc >= 0 && tail.readUInt32LE(loc) === 0x07064b50) {
        const z64 = Number(tail.readBigUInt64LE(loc + 8));
        const rec = this.read(z64, 56);
        count = Number(rec.readBigUInt64LE(32));
        cdSize = Number(rec.readBigUInt64LE(40));
        cdOffset = Number(rec.readBigUInt64LE(48));
      }
    }
    const cd = this.read(cdOffset, cdSize);
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const method = cd.readUInt16LE(p + 10);
      let compressedSize = cd.readUInt32LE(p + 20);
      let sizeU = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      let localHeaderOffset = cd.readUInt32LE(p + 42);
      const name = cd.toString("utf8", p + 46, p + 46 + nameLen);
      // ZIP64-Extra
      let e = p + 46 + nameLen;
      const eEnd = e + extraLen;
      while (e + 4 <= eEnd) {
        const id = cd.readUInt16LE(e);
        const len = cd.readUInt16LE(e + 2);
        if (id === 0x0001) {
          let q = e + 4;
          if (sizeU === 0xffffffff) { sizeU = Number(cd.readBigUInt64LE(q)); q += 8; }
          if (compressedSize === 0xffffffff) { compressedSize = Number(cd.readBigUInt64LE(q)); q += 8; }
          if (localHeaderOffset === 0xffffffff) { localHeaderOffset = Number(cd.readBigUInt64LE(q)); }
        }
        e += 4 + len;
      }
      this.entries.set(name, { method, compressedSize, size: sizeU, localHeaderOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  names(): IterableIterator<string> {
    return this.entries.keys();
  }

  get(name: string): Buffer | null {
    const e = this.entries.get(name);
    if (!e) return null;
    const lh = this.read(e.localHeaderOffset, 30);
    if (lh.readUInt32LE(0) !== 0x04034b50) return null;
    const dataStart = e.localHeaderOffset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    const data = this.read(dataStart, e.compressedSize);
    if (e.method === 0) return data;
    if (e.method === 8) return inflateRawSync(data);
    return null;
  }

  close(): void {
    closeSync(this.fd);
  }
}
