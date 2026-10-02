# ShoMap Demo Implementation Plan

> **For agentic workers:** executed inline in one session (superpowers:executing-plans), as the team requested: one continuous build, no phases. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an offline, LAN-served web app that runs the full PRD Report → Receive → Respond loop, including SOS alerts, watch zones, anonymity, EN/BN, and the authority and admin views.

**Architecture:** npm workspaces. `packages/shared` holds the zod schemas and enums. `apps/server` is Fastify + Socket.IO + SQLite through Drizzle, with a pure `domain/` layer and role-aware serializers. `apps/web` is Vite + React with MapLibre over a local PMTiles file. In demo mode a single Node process serves everything on `0.0.0.0:3000`.

**Tech Stack:** TypeScript, React 18, Vite, React Router, TanStack Query, react-i18next, MapLibre GL, pmtiles, supercluster, Fastify, Socket.IO, better-sqlite3, Drizzle ORM, zod, sharp, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-shomap-demo-tech-stack-design.md` (reads with `PRD.md` v0.3)

## Global Constraints

- No runtime network calls: no CDN, no external API. Every asset is bundled or served from `assets/offline/`.
- The server binds `0.0.0.0:3000`. Vite dev runs on `5173` and proxies `/api`, `/socket.io`, `/uploads` and `/offline`.
- Every user-facing string lives in both `en.json` and `bn.json`. Every API error is `{ code, messageKey, details? }`.
- Public payloads (REST and socket) never include the identity of an anonymous reporter or commenter.
- Thresholds live in `apps/server/src/config.ts`: confirms 3, dispute 3, reopen 3, SOS radius 3000 m, SOS TTL 72 h, auto-close 72 h, rate limit 5 per hour.
- Design tokens are exactly as in PRD §12.1. Urgency is encoded as colour + shape + label (PRD §12.2).
- TypeScript strict mode. Node 22.

## Review Focus

1. **Two clients voting at the same moment on the 3rd confirm:** the incident is referred exactly once (the transaction plus a unique `REFERRAL.incident_id`). Covered by an API test.
2. **An anonymous reporter viewing their own report:** they still see that it's theirs ("You · hidden from public"), while other citizens see "Anonymous". Covered by a serializer unit test.
3. **A socket reconnect after missing events:** the client refetches and shows the missed SOS banner if the alert is still active. Covered by the e2e reconnect check, plus `/api/sos/active` on load.
4. **A pin dropped exactly on the bounding-box edge, or in an area with no thana:** it's accepted and lands in the admin "Redirected" tab. Covered by a `routeReferral` unit test and the API out-of-area test.
5. **Switching language mid-flow (inside the report modal):** form state is kept and labels switch. Covered by the e2e step that toggles language while the report modal is open.

---

### Task 1: Workspace scaffold and shared package
**Files:** `package.json`, `tsconfig.base.json`, `.gitignore`, `packages/shared/{package.json,src/index.ts,src/enums.ts,src/schemas.ts,src/errors.ts}`
**Produces:** enums `Role`, `Urgency`, `Status`, `Verification`, `CommentKind`, `NotificationType`, `AuthorityType`, `SosState`; zod schemas `ReportInput`, `VoteInput`, `CommentInput`, `ReferralActionInput`, `WatchZoneInput`, `LoginInput`; type `ApiError`; `URGENCY_ORDER`.
- [ ] Root workspaces, scripts (`dev`, `build`, `test`, `demo`, `rehearse`, `fetch:map`), shared tsconfig
- [ ] Shared enums, schemas and error codes
- [ ] Commit

### Task 2: Domain layer (TDD)
**Files:** `apps/server/src/domain/{geo,verification,lifecycle,referral,sos,watchZones}.ts`, plus tests in `apps/server/test/domain/*.test.ts`
**Produces:**
- `haversineM(a,b)`, `nearestArea(pt, areas)`, `inDhaka(pt)`
- `evaluateVerification({confirms,disputes}, cfg) → Verification`
- `canTransition(from,to,role) → boolean`
- `routeReferral(category, areaId, jurisdictions, authorities) → authorityId|null`
- `sosRecipients(alert, users, zones) → userId[]`
- `zonesMatching(pt, urgency, zones) → zone[]`

**Tests:** threshold edges (2/0, 3/0, 3/2, 4/2, 3/3, 0/3, 2/3); every legal and illegal transition per role; no-jurisdiction routing; circle overlap at the boundary; urgency minimum.
- [ ] Write failing tests → implement → pass → commit

### Task 3: Database schema, migration and deterministic seed
**Files:** `apps/server/src/db/{schema.ts,client.ts,migrate.ts,seed.ts,seedData.ts}`, `drizzle.config.ts`
**Produces:** `db`, `openDb(path)`, `migrate(db)`, `seed(db, {now})`, `resetDemo(db)`. Tables follow the ERD. Seed: 12 areas, about 16 authorities, 13 categories (2 blocked), 18 citizens, 3 authority staff, 1 admin, about 80 incidents over 14 days with votes, comments, referrals and status events, and the hero data for §11.
**Test:** `seed` is deterministic (same ids on two runs); counts match.
- [ ] Implement → test → commit

### Task 4: Serializers (TDD)
**Files:** `apps/server/src/serializers/{incident,comment}.ts` with tests
**Produces:** `serializeIncident(row, ctx, viewer)`, `serializeComment(row, viewer, incident)`, `canSeeIdentity(viewer, incident)`
**Tests:** anonymous incident seen by another citizen → `reporter === null`, and the JSON doesn't contain the reporter id; seen by the reporter themselves, an admin, or the assigned authority's staff → identity present; SOS child photo hidden when `public_hidden`.
- [ ] Failing tests → implement → pass → commit

### Task 5: Server app (routes, auth, real-time, uploads, sweeper, demo)
**Files:** `apps/server/src/{app.ts,index.ts,config.ts,auth.ts,errors.ts,realtime.ts,clock.ts,sweeper.ts,services/*.ts,routes/*.ts}`
**Routes:**
- **Auth:** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`, `PATCH /api/me`
- **Reference data:** `GET /api/meta` (areas, categories, authorities)
- **Incidents:** `GET /api/incidents?since&days&…`, `GET /api/incidents/:id`, `POST /api/incidents` (multipart), `POST /api/incidents/:id/votes`, `POST /api/incidents/:id/still-happening`, `GET/POST /api/incidents/:id/comments`, `POST /api/flags`
- **Authority:** `GET /api/authority/queue`, `POST /api/referrals/:id/actions`
- **Admin:** `GET /api/admin/queue`, `POST /api/admin/incidents/:id/actions`, `POST /api/admin/comments/:id/hide`, `GET /api/admin/events`
- **SOS:** `GET /api/sos/active`, `POST /api/sos/:id/found`
- **User data:** `GET/POST/PATCH/DELETE /api/watch-zones`, `GET /api/notifications`, `POST /api/notifications/:id/read`, `GET /api/dashboard?scope`
- **Demo:** `POST /api/demo/reset`, `POST /api/demo/fast-forward`, `POST /api/demo/switch-role`, `GET /api/demo/info`

**API tests:** role checks, blocked category, out of area, rate limit, idempotency, self and duplicate votes, a single referral on a concurrent 3rd vote, the full referral lifecycle, reopen.
- [ ] Implement → API tests → commit

### Task 6: Web foundation
**Files:** `apps/web/{index.html,vite.config.ts,src/main.tsx,src/App.tsx,src/styles/tokens.css,src/styles/base.css,src/i18n/*,src/lib/{api,socket,format,geo,useMeta,useMe}.ts,src/ui/*}`
**Produces:** `api<T>(path, opts)`, `useSocket(event, handler)`, `t()`, the `Shell` layout (top bar, bottom bar under 768 px), `Pin`, `UrgencyBadge`, `VerificationBadge`, `StatusTracker`, `EmptyState`, `ErrorState`, `Skeleton`, `Modal`, `Panel`, `Toast`.
- [ ] Implement → commit

### Task 7: Feature screens
**Files:** `apps/web/src/features/**`
**Screens:** first run and login · map (HTML pins through supercluster, area labels, filters, counts strip, watch-zone circles) · incident panel (detail, tracker, votes, thread, still happening, flag) · 3-step report modal (blocked hotline card, SOS fields, anonymous toggle, post-submit tracker) · feed · dashboard · alerts and SOS banner · watch zones · authority console · admin queue and event log · `/demo` panel with QR.
- [ ] Implement each screen with every state from PRD §12.5 → commit

### Task 8: Offline map assets
**Files:** `scripts/fetch-map.mjs`, `apps/web/src/features/map/style.ts`, `assets/offline/README.md`
- [ ] Fetch the Dhaka PMTiles extract; build a grayscale style without symbol layers; fall back to a plain background if the file is missing → commit

### Task 9: End to end and rehearse
**Files:** `e2e/demo-script.spec.ts`, `playwright.config.ts`, `README.md`
- [ ] Demo-script test across 2 contexts; `npm run rehearse`; README with run instructions → commit
