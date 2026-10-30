export type UserRole = "viewer" | "operator";
export interface DashboardUser { id: number; username: string; role: UserRole; enabled: boolean; bootstrap: boolean }
export interface LoginSession { authenticated: boolean; mock: boolean; user: DashboardUser | null }
export const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,39}$/;
