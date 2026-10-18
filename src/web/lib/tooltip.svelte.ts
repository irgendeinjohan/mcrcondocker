import type { Item } from "../../shared/types";

/** Ein globaler Tooltip: Maus = folgt beim Überfahren, Touch/Klick = angeheftet. */
class TooltipState {
  item = $state<Item | null>(null);
  x = $state(0);
  y = $state(0);
  pinned = $state(false);

  hover(item: Item, x: number, y: number): void {
    if (this.pinned) return;
    this.item = item;
    this.x = x;
    this.y = y;
  }

  move(x: number, y: number): void {
    if (this.pinned) return;
    this.x = x;
    this.y = y;
  }

  leave(): void {
    if (!this.pinned) this.item = null;
  }

  pin(item: Item, x: number, y: number): void {
    if (this.pinned && this.item === item) {
      this.close();
      return;
    }
    this.item = item;
    this.x = x;
    this.y = y;
    this.pinned = true;
  }

  close(): void {
    this.item = null;
    this.pinned = false;
  }
}

export const tooltip = new TooltipState();
