export interface BlueMapSettings { url: string | null }

/** Browser-side embedding only: the backend never fetches a user-provided URL. */
export function normalizeBlueMapUrl(input: unknown): string | null {
  if (input === null || input === "") return null;
  if (typeof input !== "string" || input.length > 2048 || /[\u0000-\u0020\u007f]/.test(input.trim())) {
    throw new Error("Eine vollständige HTTP(S)-URL ohne Benutzername oder Passwort ist erforderlich.");
  }
  let url: URL;
  try { url = new URL(input.trim()); } catch {
    throw new Error("Eine vollständige HTTP(S)-URL ohne Benutzername oder Passwort ist erforderlich.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname) {
    throw new Error("Eine vollständige HTTP(S)-URL ohne Benutzername oder Passwort ist erforderlich.");
  }
  return url.href;
}
