# ShoMap demo: tech stack and system design

**Date:** 2026-10-02
**Status:** Approved in conversation (sections 1–4). The team asked for a single-session build.
**Source requirements:** [PRD.md](../../../PRD.md) v0.3

## 1. Shared understanding

**Stated by the team**
- The team knows JavaScript, TypeScript and React.
- The demo runs **fully locally** on one laptop, with **no internet at the venue** and no cloud accounts.
- Build window: about one week, done as a single build rather than phases.

**Assumptions agreed during design**
- Judges' phones reach the demo by joining the laptop's hotspot or travel router and opening `http://<laptop-ip>:3000`. A public URL isn't required.
- No external API is called at runtime: OTP is mocked, there's no geocoder, and nothing loads from a CDN.
- Scale is about 80–500 incidents and fewer than 10 devices. Spatial maths runs in JS; no spatial database.
- GPS works only on the laptop (`localhost` is a secure context). Phones on plain HTTP use the pin-drop fallback (PRD FR-2.3).

**Success:** every P0 requirement in the PRD works offline, and `npm run rehearse` (the PRD §11 demo script as an automated test) passes 5 times in a row with Wi-Fi off.

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) everywhere | Team skill; one set of types across client and server |
| Repo | npm workspaces: `apps/web`, `apps/server`, `packages/shared` | Shared zod schemas without a publish step |
| Web app | Vite + React 18 + React Router | Fast dev server; no server-side rendering needed |
| Server state | TanStack Query | Caching, retries with backoff, refetch on reconnect |
| i18n | i18next + react-i18next (`en.json`, `bn.json`) | Instant language switch, interpolation, plurals |
| Map | MapLibre GL JS + `pmtiles` protocol, reading a local `dhaka.pmtiles` | Vector map that works fully offline; built-in GeoJSON clustering |
| Basemap style | Protomaps grayscale theme, tuned to the PRD tokens; English or no labels | Muted map (PRD §12.1). MapLibre can't shape Bengali, so Bangla labels go on HTML overlays |
| Styling | Plain CSS with custom-property tokens from PRD §12.1 (CSS modules per component) | Tokens are already specified; no framework lock-in |
| Fonts and icons | `@fontsource/inter`, `@fontsource/hind-siliguri`, `lucide-react` | Bundled; no CDN |
| HTTP server | Node 22 + Fastify | Fast; schema validation; `inject` for API tests |
| Real-time | Socket.IO | Rooms, reconnection, and an acknowledgement for each event, all built in |
| Database | SQLite (better-sqlite3, WAL) + Drizzle ORM | The database is a single file; reset is instant; schema in TS |
| Validation | zod (in `packages/shared`) | One schema used for client forms and server input |
| Uploads | `@fastify/multipart` + `sharp` | EXIF strip and resize; stored on local disk |
| Sessions | `@fastify/cookie`, signed session cookie | Mock OTP login; server-side role checks |
| LAN QR code | `qrcode` | QR on the `/demo` panel for judges |
| Tests | Vitest (unit + API via `fastify.inject`), Playwright (end to end) | The demo script becomes the end-to-end test |

## 3. Architecture

```
shomap/
├─ apps/web/                 Vite + React + TS
│   ├─ src/features/         map · report · incident · feed · dashboard · alerts ·
│   │                        watch-zones · authority · admin · auth · demo
│   ├─ src/ui/               design-system components (PRD §12 tokens)
│   ├─ src/i18n/             en.json · bn.json
│   └─ src/lib/              api client, socket client, geo helpers, formatters
├─ apps/server/              Node + Fastify + Socket.IO
│   ├─ src/routes/           REST endpoints
│   ├─ src/domain/           pure logic: verification, referral, lifecycle, sos, watchZones, geo
│   ├─ src/serializers/      role-aware output (anonymity enforced here)
│   ├─ src/realtime/         Socket.IO rooms and emitters
│   ├─ src/db/               Drizzle schema (= ERD), migrate, seed
│   └─ src/config.ts         thresholds and demo flags
├─ packages/shared/          zod schemas, enums, DTO types, error codes
├─ assets/offline/           dhaka.pmtiles (git-ignored), style.json, glyphs, sprites
├─ data/                     shomap.db, uploads/, logs/ (git-ignored)
└─ e2e/                      Playwright demo-script test
```

- **One process in demo mode.** Fastify serves the API, Socket.IO, `/uploads`, `/offline` (map assets) and the built web app on `0.0.0.0:3000`. In development, Vite (`:5173`) proxies `/api`, `/socket.io`, `/uploads` and `/offline` to `:3000`.
- **Domain functions are pure**, with no database or socket access. Route handler pattern: validate → load → call domain → write in a transaction → emit → serialize the response.
- **Database:** the tables match the PRD ERD (diagram 06). IDs are UUID strings; timestamps are ISO-8601 UTC text.

## 4. Core flows

**Report** (`POST /api/incidents`, multipart)
1. Validate with zod. A blocked category returns `422 blocked_category` with its hotline.
2. Check the idempotency key (stored for 10 minutes) so a submit is never doubled.
3. Photos (at most 3, ≤ 5 MB, images only) go through `sharp`: rotate per EXIF, then strip metadata and resize to a maximum of 1600 px as JPEG.
4. Area = the nearest seeded area centroid. A pin outside the Dhaka bounding box returns `422 out_of_area`.
5. Insert the incident and its first `STATUS_EVENT`.
6. If the category triggers SOS: urgency = critical; create an `SOS_ALERT` (3 km, 72 h); refer immediately; fan out the SOS; flag it for admin review.
7. Watch-zone fan-out: zones containing the pin with urgency ≥ the zone's minimum get a notification.
8. Emit `incident:created` (the public version to `all`; the full version to privileged rooms).

**Verify** (`POST /api/incidents/:id/votes`): reject self-votes and duplicate votes. In one transaction: update the counts, then `evaluateVerification`. A change to verified triggers `routeReferral`; a change to disputed sends the incident to the admin queue. Then emit.

**Referral** (`routeReferral`): `category.authority_type` combined with `JURISDICTION(area)` selects the authority. No match sends the incident to the admin "Redirected" tab.

**Authority actions** (`POST /api/referrals/:id/actions`): `canTransition(from, to, role)` follows diagram 03. Each action writes a `STATUS_EVENT` and an `official` comment, notifies the reporter and watchers, and emits.

**Reopen and auto-close:** 3 "still happening" votes on a resolved incident move it to `in_progress`. A sweeper runs every 60 s: resolved for more than 72 h becomes `closed`, and an SOS older than 72 h becomes `expired`. The demo clock offset (`/demo` fast-forward) shifts "now" for the sweeper and its checks.

**SOS fan-out:** recipients are users whose home-area centroid is within the radius, or whose watch zone overlaps the alert circle (distance between centres < r1 + r2). Each recipient gets a notification row and `sos:issued` on `user:<id>`. Found or retract: `sos:closed`, and the photo's `public_hidden` is set.

**Anonymity:** every incident and comment response goes through `serializeIncident(row, viewer)` and `serializeComment(row, viewer)`. Unless the viewer is an admin, the assigned authority's staff, or the reporter themselves, `reporter` is `null` and the name shows as "Anonymous". Socket payloads follow the same rule.

**Real-time rooms:** `all`, `user:<id>`, `authority:<id>`, `admins`. Events: `incident:created`, `incident:updated`, `comment:created`, `sos:issued`, `sos:closed`, `notification:new`. On reconnect the client invalidates its queries, which refetches everything.

## 5. Offline assets and demo operations

- `npm run fetch:map` (needs internet, run once) uses the `pmtiles` CLI to extract the Dhaka bounding box `90.30,23.68,90.50,23.90` at zoom 0–15 from the Protomaps build into `assets/offline/dhaka.pmtiles`. The file is git-ignored; keep a copy on a USB stick.
- **If the map file is missing,** the map renders on a plain token-coloured background with pins and area labels, and shows "Map background unavailable" (PRD §12.5 partial state).
- `npm run demo` builds the web app, migrates and seeds if the database is empty, starts the single process, and prints the LAN URL.
- **`DEMO_MODE=1` adds:**
  - the role switcher
  - `/demo` with *Reset demo* (deterministic re-seed), *Fast-forward 72 h*, and a LAN-URL QR code
  - mock OTP `1234`
- **On the day:** use a phone hotspot with mobile data off, or a travel router (Windows Mobile Hotspot may need an internet connection). Allow Node through the firewall on private networks.

## 6. Errors

- One error format for the whole API: `{ code, messageKey, details? }`. Every `messageKey` exists in both `en.json` and `bn.json`.
- The client covers every state in PRD §12.5. TanStack Query retries network errors twice with backoff, and forms keep their state.
- If the socket disconnects, a "Reconnecting…" pill shows, followed by a refetch on reconnect.
- Server logs are JSON lines with a request ID, written to stdout and `data/logs/server.log`. The admin live event log shows the last 50 `STATUS_EVENT`s.

## 7. Testing

1. **Unit (Vitest)** covers `evaluateVerification`, `canTransition` (every edge in diagram 03), `routeReferral` (including no jurisdiction), SOS recipient maths, watch-zone matching, and the serializers. Those tests assert that public payloads never contain the reporter's identity.
2. **API (Vitest + `fastify.inject`, temporary SQLite)** covers role checks on write routes, blocked categories, out-of-area pins, rate limits, idempotent submits, and self or duplicate votes.
3. **End to end (Playwright, 2 browser contexts)** runs the PRD §11 script: report → 3 confirms → verified and referred → authority acknowledges → reporter sees the update; then SOS → banner in under 5 s on the second context → sighting → Found. `npm run rehearse` resets the demo and then runs it.

## 8. PRD changes this design implies

- **NFR-8:** strengthened from "fallback for map tiles" to **fully offline**: no runtime network dependency at all.
- **NFR-13:** "public URL" becomes **"LAN URL plus a QR code on the `/demo` panel"**.
- **FR-2.3:** GPS is available on the laptop only. On phones over the LAN, the report flow starts with the pin at the home-area centroid.

## 9. Out of scope for the build (unchanged from PRD §8)

Real SMS, push notifications, cloud hosting, HTTPS on the LAN, PostGIS, and everything else listed in PRD §8.
