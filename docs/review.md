# Project review

The separation between RCON transport, SNBT parsing, persistent state, and the Svelte interface is clear. Mock mode and captured fixtures are particularly useful: they allow changes without touching a live Minecraft world. Authentication, dangerous-command confirmation, audit history, and restrictive response headers are already present.

## Changes implemented in this review

- Added `AGENTS.md` with development, security, translation, and validation guidance.
- Added English/German interface selection, persisted in the browser, including localized dates, coordinates, action confirmations, item search, item names, enchantments, and effects. Custom names and raw Minecraft content remain intact.
- Added database-backed BlueMap configuration in the map page, a persistent map-provider preference, and an embedded view with its own restricted frame policy.
- Added a reproducible download of Minecraft 26.3 inventory renders, HUD sprites, and English/German game names. Docker builds include the local asset pack. User-supplied rendered icons override bundled ones.
- Fixed icon namespace collisions: a modded item can no longer silently display a vanilla icon with the same path.
- Marked default item names explicitly so browser localization preserves renamed items, `item_name` overrides, book titles, and named player heads. Incremented the parser version to refresh stored snapshots from raw data.

## Follow-up implementation status

All seven review areas now have implementations:

1. **Named users and enforced roles:** reserved bootstrap `admin`, scrypt password hashes, named viewer/operator accounts, role-aware navigation, API allowlists, session revocation, filtered/revocable SSE, and audit actor names.
2. **Verified SQLite backups:** automatic scheduling and retention, operator downloads, online backup API, integrity/foreign-key/schema checks, private files, and a restore CLI that creates a new file and revokes restored sessions. The restore drill is documented in [operations.md](operations.md).
3. **Version regression coverage:** explicit matrix for 1.20.4, 1.20.5, 1.21.4, 1.21.5, 1.21.11, and captured 26.3 responses. Authored boundary fixtures are labelled honestly; existing captures are preserved. Additional real-server captures can be added using the existing capture tooling.
4. **Readiness:** `/readyz` reports connection, pause, degraded parsing, and stale polls; `/healthz` remains independent liveness.
5. **Browser CI:** exact Playwright version selects the installed Chromium revision. CI caches local game assets and exercises languages, inventory, component rendering, BlueMap, users/permissions/SSE revocation, backups, and mobile layout.
6. **Component-aware rendering:** pinned local browser renderer and Three.js, matching vanilla models/textures, local resource-pack layering, canonical legacy/modern appearance components, dyes/trims, custom potion colors, patterns, item-model/custom-model-data references, and installed profile skin textures. No arbitrary skin URLs are fetched; missing local skins, assets, or WebGL retain base icons.
7. **Structured diagnostics:** stable IDs and parameters for parser/poller warnings and nested SNBT errors, translated in the UI while preserving original text and raw context for exports.

Configuration, upgrade behavior, remaining runtime requirements, and the backup/restore runbook are in [operations.md](operations.md).

## Deployment limits

BlueMap must already be installed and rendering the server world; RCON cannot generate terrain tiles. The configured map must be reachable by the user's browser and allow framing by the dashboard origin. The dashboard never proxies or fetches a configured map URL. Real BlueMap availability and live-server behavior require deployment verification.

## Dependency verification

The production dependency check identified the upstream `fast-uri` URI-normalization advisory. The lockfile now selects patched 3.1.9 and 4.2.3 releases; `npm audit --omit=dev` reports zero production findings. See the [upstream advisory](https://github.com/fastify/fast-uri/security/advisories/GHSA-w74x-v6f9-j3xg).

The development-only Svelte/Vite plugin still inherits the low-severity `deepmerge` advisory, for which npm currently reports no available fix. It is not installed in the runtime image. Track the [upstream advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) when updating build tooling.

## Validation of the follow-up work

- 173 unit/integration tests pass, including original-schema migration, account/session permissions, online backup/restore, format boundaries, appearance normalization, and structured messages.
- Server TypeScript and Svelte checks pass; the production build succeeds.
- Browser smoke passes for languages, inventory/model variants, local profile skins, resource-pack overrides, BlueMap, viewer permissions and stream revocation, backup downloads, and the mobile layout.
- The Alpine image builds with Podman. An isolated container probe passes non-root startup, admin login, bundled model/icon availability, online backup, and verified restore.
- Production dependency audit reports zero findings; Git whitespace validation passes.

These checks use mock Minecraft data and a local test map. No live Minecraft/BlueMap deployment was changed or claimed as verified.
