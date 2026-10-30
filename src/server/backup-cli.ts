import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { Backups, restoreBackup, verifyBackup } from "./backups.js";

const [command, first, second] = process.argv.slice(2);
try {
  if (command === "verify" && first) console.log(JSON.stringify(verifyBackup(path.resolve(first))));
  else if (command === "restore" && first && second) {
    await restoreBackup(path.resolve(first), path.resolve(second));
    console.log(`Verified restore created at ${path.resolve(second)}. Existing files were not replaced.`);
  } else if (command === "create") {
    const data = path.resolve(first || process.env.DATA_DIR || "./data");
    const database = new DatabaseSync(path.join(data, "dashboard.db"), { readOnly: true });
    try {
      const service = new Backups(database, path.resolve(second || process.env.BACKUP_DIR || path.join(data, "backups")), Number(process.env.BACKUP_KEEP || 7));
      console.log(JSON.stringify(await service.create()));
    } finally { database.close(); }
  } else throw new Error("Usage: backup-cli.js create [data-directory] [backup-directory] | verify <backup.sqlite> | restore <backup.sqlite> <NEW-destination.db>");
} catch (e) { console.error((e as Error).message); process.exitCode = 1; }
