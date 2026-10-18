// Minimaler Hash-Router: #/players, #/players/<uuid>, #/map/<dim>, #/console, #/sessions, #/debug
export type View = "players" | "map" | "console" | "sessions" | "debug";

function parse(hash: string): { view: View; param: string | null } {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const views: View[] = ["players", "map", "console", "sessions", "debug"];
  const view = (views.includes(parts[0] as View) ? parts[0] : "players") as View;
  return { view, param: parts[1] ?? null };
}

class Router {
  view = $state<View>("players");
  param = $state<string | null>(null);

  constructor() {
    if (typeof window !== "undefined") {
      this.update();
      window.addEventListener("hashchange", () => this.update());
    }
  }

  private update(): void {
    const r = parse(location.hash);
    this.view = r.view;
    this.param = r.param;
  }

  go(view: View, param?: string | null): void {
    location.hash = `#/${view}${param ? "/" + encodeURIComponent(param) : ""}`;
  }
}

export const router = new Router();
