// Sammelt die Lizenzen aller Laufzeit-Abhängigkeiten in eine Datei (läuft beim Docker-Build).
// Aufruf: node docker/collect-licenses.mjs > THIRD-PARTY-LICENSES.md
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const out = ["# Third-party licenses (server)", "", "Dieses Image enthält folgende Bibliotheken:", ""];
const entries = Object.entries(lock.packages)
  .filter(([k, v]) => k && !v.dev && existsSync(k))
  .sort(([a], [b]) => a.localeCompare(b));

for (const [dir, info] of entries) {
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  out.push(`## ${pkg.name} ${pkg.version} (${info.license ?? pkg.license ?? "unbekannt"})`, "");
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f));
  if (file) {
    out.push(readFileSync(path.join(dir, file), "utf8").trim());
  } else {
    const author = typeof pkg.author === "string" ? pkg.author : pkg.author?.name;
    if (author) out.push(`Copyright (c) ${author}`, "");
    if ((info.license ?? pkg.license) === "MIT") out.push(MIT_TEXT);
    else out.push(`Lizenz: ${info.license ?? pkg.license}. Siehe ${pkg.homepage ?? pkg.repository?.url ?? "Paketquelle"}`);
  }
  out.push("");
}
process.stdout.write(out.join("\n"));
