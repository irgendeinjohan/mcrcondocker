import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

export function fixture(name: string): string {
  return readFileSync(path.join(root, name), "utf8");
}

export function fixture263(name: string): string {
  return fixture(`26.3/${name}.txt`);
}
