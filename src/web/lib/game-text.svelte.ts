import type { Item, ItemDetailMessage, TextSegment } from "../../shared/types";
import { prettifyId } from "../../shared/mctext";
import { live } from "./live.svelte";
import { language, t } from "./i18n.svelte";

export function gameName(id: string, kind: "item" | "enchantment" | "effect", fallback?: string): string {
  // Reading locale makes consumers reactive even before the new catalog arrives.
  void language.locale;
  const full = id.includes(":") ? id : `minecraft:${id}`;
  const key = full.replace(":", ".");
  return live.translations[`${kind}.${key}`] ?? (kind === "item" ? live.translations[`block.${key}`] : undefined)
    ?? fallback ?? prettifyId(id.replace(/^[^:]*:/, ""));
}
export function itemName(item: Item): TextSegment[] {
  // Custom names, item_name overrides, book titles, and player heads stay intact.
  return item.nameIsDefault && !item.hasCustomName ? [{ text: gameName(item.id, "item") }] : item.name;
}

export function itemDetail(message: ItemDetailMessage): string {
  const params = { ...message.params };
  for (const [name, key] of Object.entries(message.gameKeys ?? {})) {
    params[name] = live.translations[key] ?? params[name] ?? "";
  }
  return t(message.key, params);
}
