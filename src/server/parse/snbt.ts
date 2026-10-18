// Fehlertoleranter SNBT-Parser.
//
// Versteht das kompakte Format ({a:1b,b:"x"}) ebenso wie die "hübsche" Ausgabe
// von /data get ({a: 1b, b: "x"}), alte und neue Zahlenschreibweisen, typisierte
// Arrays ([B;…], [I;…], [L;…]) und true/false.
// Bei Fehlern oder abgeschnittener Ausgabe ("...", "<...>") wird das bis dahin
// Gelesene zurückgegeben und `truncated`/`error` gesetzt, statt eine Exception
// zu werfen.

export type SnbtValue = SnbtCompound | SnbtValue[] | string | number | boolean;
export interface SnbtCompound {
  [key: string]: SnbtValue;
}

export interface SnbtResult {
  value: SnbtValue | undefined;
  /** Eingabe endete vorzeitig bzw. enthielt Auslassungszeichen */
  truncated: boolean;
  error?: { pos: number; message: string };
  /** Position nach dem gelesenen Wert */
  end: number;
}

const UNQUOTED = /[A-Za-z0-9._+\-]/;
const INT_RE = /^([+-]?)(0x[0-9a-f_]+|0b[01_]+|[0-9][0-9_]*)([su]?[bsli])?$/i;
const FLOAT_RE = /^[+-]?(?:[0-9][0-9_]*\.?[0-9_]*|\.[0-9][0-9_]*)(?:e[+-]?[0-9_]+)?[fd]?$/i;

class Stop extends Error {}

class Parser {
  pos = 0;
  truncated = false;
  error?: { pos: number; message: string };

  constructor(private readonly s: string) {}

  fail(message: string, truncated = false): never {
    if (!this.error) this.error = { pos: this.pos, message };
    if (truncated) this.truncated = true;
    throw new Stop(message);
  }

  ws(): void {
    while (this.pos < this.s.length && /\s/.test(this.s[this.pos]!)) this.pos++;
  }

  atEllipsis(): boolean {
    return this.s.startsWith("...", this.pos) || this.s.startsWith("<...>", this.pos);
  }

  peek(): string | undefined {
    return this.s[this.pos];
  }

  /** Liest einen Wert; bei Abbruch innerhalb eines Containers wird `onPartial` mit dem Teilwert aufgerufen. */
  value(onPartial?: (v: SnbtValue) => void): SnbtValue {
    this.ws();
    if (this.pos >= this.s.length) this.fail("Unerwartetes Ende der Eingabe", true);
    if (this.atEllipsis()) this.fail("Ausgabe abgekürzt (...)", true);
    const c = this.peek()!;
    if (c === "{") return this.compound(onPartial);
    if (c === "[") return this.list(onPartial);
    if (c === '"' || c === "'") return this.quoted();
    return this.literal();
  }

  compound(onPartial?: (v: SnbtValue) => void): SnbtCompound {
    const obj: SnbtCompound = Object.create(null);
    onPartial?.(obj);
    this.pos++; // {
    this.ws();
    if (this.peek() === "}") {
      this.pos++;
      return obj;
    }
    for (;;) {
      this.ws();
      if (this.atEllipsis()) this.fail("Ausgabe abgekürzt (...)", true);
      if (this.pos >= this.s.length) this.fail("Unerwartetes Ende in Compound", true);
      const key = this.key();
      this.ws();
      if (this.peek() !== ":") this.fail(`':' nach Schlüssel "${key}" erwartet`);
      this.pos++;
      obj[key] = undefined as never;
      try {
        obj[key] = this.value((partial) => (obj[key] = partial));
      } catch (e) {
        if (obj[key] === undefined) delete obj[key];
        throw e;
      }
      this.ws();
      if (this.atEllipsis()) this.fail("Ausgabe abgekürzt (...)", true);
      const c = this.peek();
      if (c === ",") {
        this.pos++;
        continue;
      }
      if (c === "}") {
        this.pos++;
        return obj;
      }
      if (c === undefined) this.fail("Unerwartetes Ende in Compound", true);
      this.fail(`',' oder '}' erwartet, gefunden '${c}'`);
    }
  }

  list(onPartial?: (v: SnbtValue) => void): SnbtValue[] {
    const arr: SnbtValue[] = [];
    onPartial?.(arr);
    this.pos++; // [
    this.ws();
    // typisierte Arrays [B; …] / [I; …] / [L; …]
    const m = /^([BIL])\s*;/.exec(this.s.slice(this.pos, this.pos + 4));
    if (m) this.pos += m[0].length;
    this.ws();
    if (this.peek() === "]") {
      this.pos++;
      return arr;
    }
    for (;;) {
      this.ws();
      if (this.pos >= this.s.length) this.fail("Unerwartetes Ende in Liste", true);
      const idx = arr.length;
      arr[idx] = this.value((partial) => (arr[idx] = partial));
      this.ws();
      if (this.atEllipsis()) this.fail("Ausgabe abgekürzt (...)", true);
      const c = this.peek();
      if (c === ",") {
        this.pos++;
        continue;
      }
      if (c === "]") {
        this.pos++;
        return arr;
      }
      if (c === undefined) this.fail("Unerwartetes Ende in Liste", true);
      this.fail(`',' oder ']' erwartet, gefunden '${c}'`);
    }
  }

  key(): string {
    const c = this.peek();
    if (c === '"' || c === "'") return this.quoted();
    const start = this.pos;
    while (this.pos < this.s.length && UNQUOTED.test(this.s[this.pos]!)) this.pos++;
    if (this.pos === start) this.fail(`Schlüssel erwartet, gefunden '${c}'`);
    return this.s.slice(start, this.pos);
  }

  quoted(): string {
    const q = this.s[this.pos++]!;
    let out = "";
    for (;;) {
      if (this.pos >= this.s.length) this.fail("String nicht abgeschlossen", true);
      const c = this.s[this.pos++]!;
      if (c === q) return out;
      if (c !== "\\") {
        out += c;
        continue;
      }
      const e = this.s[this.pos++];
      switch (e) {
        case undefined:
          this.fail("String nicht abgeschlossen", true);
        // eslint-disable-next-line no-fallthrough
        case "b": out += "\b"; break;
        case "f": out += "\f"; break;
        case "n": out += "\n"; break;
        case "r": out += "\r"; break;
        case "s": out += " "; break;
        case "t": out += "\t"; break;
        case "x": out += this.hexEscape(2); break;
        case "u": out += this.hexEscape(4); break;
        case "U": out += this.hexEscape(8); break;
        case "N": {
          // \N{Name} – Unicode-Namen kennen wir nicht; Platzhalter
          const close = this.s.indexOf("}", this.pos);
          if (this.peek() === "{" && close > 0) {
            this.pos = close + 1;
            out += "�";
          } else out += "N";
          break;
        }
        default:
          out += e; // \\ \" \' und Unbekanntes wörtlich
      }
    }
  }

  hexEscape(len: number): string {
    const hex = this.s.slice(this.pos, this.pos + len);
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== len) return "�";
    this.pos += len;
    const cp = parseInt(hex, 16);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : "�";
  }

  literal(): SnbtValue {
    const start = this.pos;
    while (this.pos < this.s.length && UNQUOTED.test(this.s[this.pos]!)) {
      // "..." am Ende eines Literals = Auslassung
      if (this.s.startsWith("...", this.pos)) break;
      this.pos++;
    }
    const tok = this.s.slice(start, this.pos);
    if (tok === "") this.fail(`Wert erwartet, gefunden '${this.peek()}'`);
    return parseLiteral(tok);
  }
}

export function parseLiteral(tok: string): SnbtValue {
  if (tok === "true") return true;
  if (tok === "false") return false;
  const im = INT_RE.exec(tok);
  if (im) {
    const sign = im[1] === "-" ? -1 : 1;
    const digits = im[2]!.replace(/_/g, "").toLowerCase();
    let n: number;
    if (digits.startsWith("0x")) n = parseInt(digits.slice(2), 16);
    else if (digits.startsWith("0b") && digits.length > 2 && !im[3]) n = parseInt(digits.slice(2), 2);
    else if (digits === "0b") return 0; // "0b" = Byte 0, nicht Binärpräfix
    else n = Number(digits);
    return sign * n;
  }
  if (FLOAT_RE.test(tok) && /[0-9]/.test(tok)) {
    return Number(tok.replace(/[fd]$/i, "").replace(/_/g, ""));
  }
  return tok; // unquotierter String
}

export function parseSnbt(input: string, start = 0): SnbtResult {
  const p = new Parser(input);
  p.pos = start;
  let partial: SnbtValue | undefined;
  try {
    const value = p.value((v) => (partial = v));
    return { value, truncated: p.truncated, end: p.pos, error: p.error };
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    return { value: partial, truncated: p.truncated, end: p.pos, error: p.error };
  }
}

export function isCompound(v: unknown): v is SnbtCompound {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
