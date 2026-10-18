// Minecraft-Text: §-Farbcodes und Text-Komponenten → einfache Segmente.
// Wird im Backend (Item-Namen) und im Frontend (Konsole, Tooltips) genutzt.

export interface TextSegment {
  text: string;
  color?: string; // #rrggbb
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
}

export const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  dark_blue: "#0000aa",
  dark_green: "#00aa00",
  dark_aqua: "#00aaaa",
  dark_red: "#aa0000",
  dark_purple: "#aa00aa",
  gold: "#ffaa00",
  gray: "#aaaaaa",
  dark_gray: "#555555",
  blue: "#5555ff",
  green: "#55ff55",
  aqua: "#55ffff",
  red: "#ff5555",
  light_purple: "#ff55ff",
  yellow: "#ffff55",
  white: "#ffffff",
};

const LEGACY_COLORS = "0123456789abcdef";
const LEGACY_NAMES = Object.keys(NAMED_COLORS);

type Style = Omit<TextSegment, "text">;

function pushSeg(out: TextSegment[], text: string, style: Style): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && sameStyle(last, style)) last.text += text;
  else out.push({ text, ...cleanStyle(style) });
}

const STYLE_KEYS = ["color", "bold", "italic", "underlined", "strikethrough", "obfuscated"] as const;

function cleanStyle(s: Style): Style {
  const r: Record<string, unknown> = {};
  for (const k of STYLE_KEYS) if (s[k]) r[k] = s[k];
  return r as Style;
}

function sameStyle(a: Style, b: Style): boolean {
  return STYLE_KEYS.every((k) => (a[k] || undefined) === (b[k] || undefined));
}

/** Zerlegt Text mit §-Codes (inkl. §x§r§r§g§g§b§b für Hex-Farben) in Segmente. */
export function parseLegacy(input: string, base: Style = {}): TextSegment[] {
  const out: TextSegment[] = [];
  let style: Style = { ...base };
  let buf = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch !== "§" || i + 1 >= input.length) {
      buf += ch;
      continue;
    }
    const code = input[i + 1]!.toLowerCase();
    pushSeg(out, buf, style);
    buf = "";
    i++;
    const ci = LEGACY_COLORS.indexOf(code);
    if (ci >= 0) {
      style = { color: NAMED_COLORS[LEGACY_NAMES[ci]!] };
    } else if (code === "x") {
      // §x§R§R§G§G§B§B
      const hex = input.slice(i + 1, i + 13);
      if (/^(§[0-9a-fA-F]){6}$/.test(hex)) {
        style = { color: "#" + hex.replace(/§/g, "").toLowerCase() };
        i += 12;
      }
    } else if (code === "l") style = { ...style, bold: true };
    else if (code === "o") style = { ...style, italic: true };
    else if (code === "n") style = { ...style, underlined: true };
    else if (code === "m") style = { ...style, strikethrough: true };
    else if (code === "k") style = { ...style, obfuscated: true };
    else if (code === "r") style = { ...base };
    // unbekannte Codes werden einfach verschluckt
  }
  pushSeg(out, buf, style);
  return out;
}

export function stripLegacy(input: string): string {
  return input.replace(/§x(§[0-9a-fA-F]){6}/g, "").replace(/§./g, "");
}

export function segmentsToPlain(segs: TextSegment[]): string {
  return segs.map((s) => s.text).join("");
}

function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === "true";
}

function colorOf(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  if (v.startsWith("#") && /^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  return NAMED_COLORS[v];
}

/** Macht aus "item.minecraft.diamond_sword" bzw. "minecraft:diamond_sword" → "Diamond Sword". */
export function prettifyId(id: string): string {
  const last = id.split(/[.:/]/).filter(Boolean).pop() ?? id;
  return last
    .split("_")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Wandelt eine Text-Komponente in Segmente um. Akzeptiert:
 * - SNBT-Compound/Liste (ab 1.21.5: custom_name:{text:"…",color:"gold"})
 * - JSON-String (bis 1.21.4: custom_name:'{"text":"…"}')
 * - einfachen String
 * `translate` wird mithilfe von `translate`-Callback (Sprachdatei) oder `fallback` aufgelöst.
 */
export function componentToSegments(
  value: unknown,
  translate?: (key: string) => string | undefined,
  parent: Style = {},
  depth = 0,
): TextSegment[] {
  const out: TextSegment[] = [];
  if (depth > 32 || value === undefined || value === null) return out;
  if (typeof value === "string") {
    const t = value.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]")) || (t.startsWith('"') && t.endsWith('"'))) {
      try {
        return componentToSegments(JSON.parse(t), translate, parent, depth + 1);
      } catch {
        /* kein JSON – als Text behandeln */
      }
    }
    return parseLegacy(value, parent);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [{ text: String(value), ...cleanStyle(parent) }];
  }
  if (Array.isArray(value)) {
    for (const v of value) for (const s of componentToSegments(v, translate, parent, depth + 1)) pushSeg(out, s.text, s);
    return out;
  }
  if (typeof value !== "object") return out;
  const o = value as Record<string, unknown>;
  const style: Style = { ...parent };
  const col = colorOf(o.color);
  if (col) style.color = col;
  for (const k of ["bold", "italic", "underlined", "strikethrough", "obfuscated"] as const) {
    if (k in o) style[k] = truthy(o[k]);
  }
  let own: TextSegment[] = [];
  if (typeof o.text === "string" || typeof o.text === "number") own = parseLegacy(String(o.text), style);
  else if (typeof o.translate === "string") {
    const tpl = translate?.(o.translate) ?? (typeof o.fallback === "string" ? o.fallback : undefined);
    const args = Array.isArray(o.with) ? o.with : [];
    if (tpl !== undefined) {
      let ai = 0;
      const parts = tpl.split(/(%(?:\d+\$)?s|%%)/);
      for (const part of parts) {
        if (part === "%%") pushSeg(own, "%", style);
        else if (/^%(?:\d+\$)?s$/.test(part)) {
          const m = /^%(\d+)\$s$/.exec(part);
          const arg = args[m ? Number(m[1]) - 1 : ai++];
          for (const s of componentToSegments(arg, translate, style, depth + 1)) own.push(s);
        } else pushSeg(own, part, style);
      }
    } else {
      own = [{ text: prettifyId(o.translate), ...cleanStyle(style) }];
    }
  } else if (typeof o.keybind === "string") own = [{ text: `[${o.keybind}]`, ...cleanStyle(style) }];
  else if (typeof o.selector === "string") own = [{ text: o.selector, ...cleanStyle(style) }];
  else if (o.score && typeof o.score === "object") {
    const sc = o.score as Record<string, unknown>;
    own = [{ text: String(sc.value ?? `${sc.name ?? "?"}:${sc.objective ?? "?"}`), ...cleanStyle(style) }];
  } else if (typeof o[""] === "string") own = parseLegacy(o[""] as string, style); // Listen-Wrapper aus NBT
  for (const s of own) pushSeg(out, s.text, s);
  if (Array.isArray(o.extra)) {
    for (const e of o.extra) for (const s of componentToSegments(e, translate, style, depth + 1)) pushSeg(out, s.text, s);
  }
  return out;
}

export function componentToPlain(value: unknown, translate?: (key: string) => string | undefined): string {
  return segmentsToPlain(componentToSegments(value, translate));
}
