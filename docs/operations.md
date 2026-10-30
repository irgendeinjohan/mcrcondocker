# Accounts, backups, readiness, and rendering

## Upgrading this checkout

Build a new image from this checkout. A previously published image does not contain these changes. Node source installations need Node >=22.16.

Before upgrading an existing database, make a verified backup. The user-account migration preserves player snapshots, playtime, settings, and audit entries, and signs out old anonymous sessions. The existing `DASHBOARD_PASSWORD` becomes the password of the reserved **admin** operator identity. Sign in with username `admin` and the same password.

## Viewer and operator identities

Operators manage accounts on **Users**. Create a named account and choose **Viewer** or **Operator**. Viewers can read players, inventories, the coordinate/BlueMap view, and playtime. Console history, raw diagnostics, audit history, world administration, user management, backups, and all server mutations require operator permission in the API. Viewer live streams omit console/audit events.

Passwords are stored as salted scrypt hashes. Password, role, and enabled-status changes revoke that account's sessions, including open live streams. The bootstrap `admin` account cannot be disabled or downgraded through the UI. Change its password using `DASHBOARD_PASSWORD` and restart; the old administrator sessions are revoked. Existing API clients that omit a username still authenticate as `admin`.

Actions and console commands record the dashboard username in the audit log. Older entries retain a null actor rather than assigning an identity retrospectively.

## Automatic backups

At startup, the dashboard creates a backup if none exists or the last one is older than the configured interval. It then checks periodically while running. Defaults:

| Variable | Default | Meaning |
|---|---|---|
| `BACKUP_DIR` | `<DATA_DIR>/backups` | Backup destination; use a separate mounted volume for off-host protection |
| `BACKUP_INTERVAL_HOURS` | `24` | Minimum time between automatic backups; `0` disables scheduling |
| `BACKUP_KEEP` | `7` | Number of successfully completed backups retained |

Backups use Node's SQLite online backup API, include committed WAL data, and pass SQLite integrity, foreign-key, and dashboard-schema checks before publication. An incomplete file has a `.partial` suffix; retention never treats it as a usable backup. Backup files are private (0600), and the directory is created as 0700. A failure is logged and does not delete the previous verified backups.

Operators can create/download backups under **Users → Database backups**. Backups contain authentication hashes and sessions as well as player data; store them with the same access restrictions as the live database. The restore tool removes authentication sessions from the restored copy.

### Manual backup and verification

From a source checkout:

```sh
npm run backup -- create ./data ./backups
npm run backup -- verify ./backups/<backup-name>.sqlite
```

For a running container:

```sh
docker compose exec mc-dashboard node dist/server/backup-cli.js create /data /data/backups
docker compose exec mc-dashboard node dist/server/backup-cli.js verify /data/backups/<backup-name>.sqlite
```

The create command may run while the dashboard writes to SQLite. Do not substitute a filesystem copy of a live `dashboard.db`: the WAL may contain committed changes absent from that file.

### Restore drill and production restore

The restore command always writes a **new path** and refuses to overwrite an existing file. A drill needs no live database changes:

```sh
npm run backup -- restore ./backups/<backup-name>.sqlite /tmp/dashboard-restore-check.db
npm run backup -- verify /tmp/dashboard-restore-check.db
```

Inspect the restored settings, users, and representative player/session rows using SQLite. Use a fresh destination for each drill.

For a production restore, stop the dashboard first, create and verify the restored file through a one-off container, then move the original database aside and put the verified replacement in place. Keep the old database and any `-wal`/`-shm` companions together until the restore has been accepted. Do not leave old WAL/SHM companions at the replacement database's path. Finally start the dashboard and confirm login, player snapshots, BlueMap settings, and playtime history. The restore CLI does not perform that live-file swap automatically.

Example creation of the replacement while stopped:

```sh
docker compose stop mc-dashboard
docker compose run --rm --no-deps mc-dashboard node dist/server/backup-cli.js restore /data/backups/<backup-name>.sqlite /data/dashboard-restored.db
docker compose run --rm --no-deps mc-dashboard node dist/server/backup-cli.js verify /data/dashboard-restored.db
```

The startup account password remains controlled by the current environment; restoring an older backup does not revert `DASHBOARD_PASSWORD`.

## Liveness and readiness

- `/healthz`: process liveness; remains HTTP 200 while Minecraft is unavailable or polling is paused.
- `/readyz`: HTTP 200 only when RCON is connected, a recent successful poll exists, polling is not paused, and parsing is not degraded. Otherwise HTTP 503, with `connection`, `paused`, `degraded`, and `stale` flags. No credentials or server address are included.

Keep the Docker liveness check on `/healthz`. Use `/readyz` for monitoring/traffic readiness; a Minecraft outage should not cause a dashboard restart loop.

## Component-aware item icons and resource packs

New Docker builds include the pinned Minecraft 26.3 base models/textures. For a source checkout:

```sh
npm run assets:download
npm run assets:models
```

`assets:models` tries the pinned official client JAR, then the pinned asset mirror. It checks the archive checksum and installs only rendering assets, not sounds or server data. The mirror archive is larger than the client JAR; CI caches the installed result. You can supply an already downloaded, checksum-matching archive with `MINECRAFT_ASSET_ARCHIVE=/path/to/client.jar` (or the pinned mirror ZIP). Downloads happen during setup/build, never during rendering.

Item components and equivalent legacy tags are retained as bounded appearance data. The browser renders armor dyes and trim materials, potion colors (including custom colors), shield/banner patterns, custom-model data, item-model references, and locally installed profile-head textures. Rendering uses the vendored **block-model-renderer 2.20.0** and pinned Three.js 0.162.0. Model/texture requests remain on the authenticated dashboard origin. The existing static icon remains the fallback if assets or WebGL are unavailable. The browser needs WebGL; renderer and texture caches are reused across slots.

Place your resource packs in `data/assets/resourcepacks/` as ZIP files or unpacked directories. Each pack must have an `assets/<namespace>/...` tree at its root. Packs are applied in filename order; later names override earlier ones, so `90-overrides.zip` wins over `10-base.zip`. User assets and a local client JAR can supply the base as well. Restart the dashboard and refresh clients after changing packs.

Set `MINECRAFT_ASSET_VERSION` to match a user-provided base pack, e.g. `1.20.4`. Its default is `26.3`; keep the base version, custom packs, and server item definitions compatible.

### Profile head skins

No arbitrary skin URLs or Mojang profile lookups are fetched at runtime. For a head with a standard texture property, place its texture in:

```text
data/assets/skins/<texture-hash>.png
```

The hash is the 64-character hexadecimal ID at the end of the profile's `textures.minecraft.net/texture/...` URL. Only this validated hash is sent to the local skin endpoint. Install the corresponding skin PNG and restart/refresh; the renderer uses its face and outer hat layer. Heads without a locally installed profile texture retain the vanilla base icon. This also works without Internet access.

Custom pack shaders, non-vanilla mod rendering extensions, and entity appearance that cannot be described by resource-pack models remain dependent on renderer support. The bundled renderer license and exact source archive are linked in `src/web/public/renderer/SOURCES.md` and served under `/renderer/`.

## Fixtures, diagnostics, and CI

The version matrix covers 1.20.4, 1.20.5, 1.21.4, 1.21.5, 1.21.11, and 26.3 format boundaries. `tests/fixtures/versions/README.md` distinguishes hand-authored cases from actual 26.3 server captures. This is parser regression coverage, not a claim that every release was runtime-tested on a server.

Parser warnings and nested SNBT errors now carry stable message IDs, parameters, and optional nested messages. The UI formats them in the selected language; raw server replies, context excerpts, audit history, and exported original message strings remain intact.

CI runs unit tests, Svelte/TypeScript checks, the production build, and browser smoke checks. The exact `playwright-core` version in the lockfile selects the Chromium revision installed by CI. The browser test checks account roles and stream revocation, local model/component rendering, backup downloads, languages, BlueMap, and mobile layout against an isolated mock server.

## GitHub container releases

The container workflow publishes to `ghcr.io/irgendeinjohan/mcrcondocker` for `linux/amd64` and `linux/arm64`. Ordinary pushes to `main` run CI but do not publish an image. Container publishing waits for the reusable CI workflow, including browser smoke checks.

- Push a stable version tag, e.g. `v1.2.3`: publishes `:1.2.3`, `:1.2`, `:latest`, and `:sha-<full-commit-SHA>`.
- Push a prerelease tag, e.g. `v1.2.3-beta.1`: publishes the prerelease version and commit tag; does not move `:latest` or the minor-version tag.
- Run **Actions → Container release → Run workflow**: publishes only `:sha-<full-commit-SHA>`, including when selecting a tag manually. It does not move release tags or `:latest`.

The workflow uses GitHub's built-in `GITHUB_TOKEN` with package-write permission in the publishing job. No personal token or external registry secret is required. A new GHCR package may need its visibility set to public in package settings if anonymous pulls are desired. No image publication is dispatched merely by committing this setup.

To publish a release after choosing the version:

```sh
git tag v1.2.3
git push origin v1.2.3
```

Use a new version tag for each release. Container publishing does not deploy or restart any server.
