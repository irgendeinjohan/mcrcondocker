import type { DashboardUser } from "../../shared/users";
class Session {
  user = $state<DashboardUser | null>(null);
  get operator(): boolean { return this.user?.role === "operator"; }
}
export const session = new Session();
