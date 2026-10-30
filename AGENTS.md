# Repository guidance

## Project
MC-Dashboard is a self-hosted Minecraft Java dashboard. A Fastify backend talks to the server exclusively over RCON; Svelte 5 displays live state over server-sent events. SQLite stores sessions, snapshots, settings, and audit history. BlueMap is an optional, separately hosted integration.

## Layout
- `src/server/`: API, authentication, polling, actions, assets, SQLite, and the RCON client.
- `src/server/parse/`: Minecraft SNBT and response parsers; preserve both legacy and current formats.
- `src/web/`: Svelte 5 frontend; use runes for reactive state.
- `src/shared/`: shared types and pure helpers.
- `tests/unit/`: Vitest unit and mock-RCON integration tests.
- `tests/fixtures/`: captured server responses; do not alter fixtures to make a broken parser pass.
- `docs/`: deployment and format documentation.

## Development and verification
Use Node.js >=22.16 (Node 24 is used in Docker). Install with `npm ci`.
- `npm run mock` starts the mock backend; `npm run dev:web` starts Vite.
- `npm test` runs parser, protocol, database, and API tests.
- `npm run check` checks server TypeScript and Svelte.
- `npm run build` builds both production targets.
Run checks appropriate to your changes. New parser behavior needs realistic fixtures and regression coverage. API changes should cover authentication and invalid input.

## Conventions
Keep server/shared ESM imports ending in `.js`. Keep secrets server-side; never log RCON credentials or commit `.env`, databases, or downloaded game assets. Preserve authentication, CSRF protections, content security policy, and confirmation for dangerous commands. Validate user input before constructing RCON commands. Use UUIDs for player actions.

All dashboard interface text belongs in the shared English/German translation catalog. Keep commands, item IDs, player names, custom item names, and raw Minecraft responses intact. Format dates and numbers using the selected locale. Keep translations complete when adding UI.

Serve Minecraft icons locally. Prefer rendered inventory icons over raw textures, preserve namespaces, and keep missing-asset fallbacks usable. Do not substitute another namespace's vanilla icon. Document asset sources/version and configuration changes in the README.

## Scope
Keep changes focused and preserve existing user work. Do not deploy, publish, restart live containers, or modify a real Minecraft world merely to validate a local change. Use mock mode for local integration checks.

## Accounts, backups, and rendering
Named users and viewer/operator roles are enforced by the API. Keep viewer requests on the read-only allowlist and filter administrative SSE events. Never trust a role sent by a browser. Account credential/role/status changes must revoke sessions. Preserve the reserved environment-managed `admin` identity and never expose password hashes.

Database schema changes require a numbered migration and an upgrade regression case. Use the SQLite online backup API; verify completed backups before pruning and never overwrite a live database in restore tooling. `/healthz` is liveness, `/readyz` is Minecraft readiness.

Normalize old NBT tags and current components into bounded appearance data in `src/shared/appearance.ts`. Serve renderer assets and profile skins locally through authenticated routes. Keep the vendored renderer and Three.js pinned with source/license attribution. Unit tests cover normalization and path boundaries; `npm run test:smoke` checks actual component variants, permissions, stream revocation, backups, and mobile layout. Install icons/models and build before that check.

Parser/poller diagnostics use stable IDs and parameters from `src/shared/diagnostic-messages.ts`. Preserve original message strings and raw context in debug exports; translate structured messages at display time.
