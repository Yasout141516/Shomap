# ShoMap

**Report. Receive. Respond.** A community-powered platform where people in Bangladesh report, verify and track everyday incidents together. This repo is the hackathon demo by Team Snoopy.

**Live demo: https://shomap.onrender.com**

It's a free instance, so the first visit after idle takes 30–60 s to wake. Log in with any `01XXXXXXXXX` number and code `1234`, or open **Demo controls** to switch between the citizen, authority and moderator accounts. Data is sample data and resets when the server restarts.

- Product requirements: [PRD.md](PRD.md)
- Tech design: [docs/superpowers/specs/2026-10-02-shomap-demo-tech-stack-design.md](docs/superpowers/specs/2026-10-02-shomap-demo-tech-stack-design.md)
- Diagrams (including the ERD): [diagrams/](diagrams/)

The demo runs **fully offline on one laptop**. Phones join through the laptop's hotspot or LAN.

## Quick start

Needs Node 22 or newer. The first install needs internet; after that, nothing does.

```bash
npm install
npm run fetch:map     # one-time download of the Dhaka map file (~19 MB) into assets/offline/
npm run demo          # builds the web app and starts everything on port 3000
```

The terminal prints the URLs:

```
On this laptop:  http://localhost:3000
On the hotspot:  http://192.168.x.x:3000
Demo controls:   http://localhost:3000/demo   (OTP is 1234)
```

Login is a mock: any `01XXXXXXXXX` number, and the code is always **1234**. The login page and `/demo` also offer one-tap demo accounts.

## Demo accounts

| Person | Role | Used for |
|---|---|---|
| Rahim Uddin | Citizen, Farmgate | Reports the snatching (anonymously) |
| Nila Akter, Tanvir Hasan, Rafiq Ahmed | Citizens near Farmgate | Confirm the report |
| Duty Officer, Tejgaon Thana | Authority (simulated) | Acknowledges and resolves |
| ShoMap Moderator | Admin | Sees anonymous reporters; reviews SOS, disputed and flagged reports |
| Shirin Begum | Citizen, Mirpur 10 | Sends the missing-child SOS |
| Arif Chowdhury | Citizen, watches Mirpur 10 | Receives the SOS banner and posts a sighting |

`assets/demo/sample-child.jpg` is an illustrated sample photo for the SOS demo. Never use a real child's photo.

## Demo day checklist

1. Before the venue, with internet: `npm install`, `npm run fetch:map`, then `npm run rehearse`. Copy `assets/offline/dhaka.pmtiles` to a USB stick.
2. Turn **Wi-Fi off** and run `npm run rehearse` again. It must pass offline.
3. Networking: use a phone hotspot with mobile data off, or a travel router. Windows' own Mobile Hotspot may refuse to start without an internet connection. When Windows asks, allow Node through the firewall on private networks.
4. `npm run demo`, open `/demo`, and click **Reset demo** right before you present.
5. Judges scan the QR code on `/demo`. On phones over plain `http`, GPS is unavailable, so the report flow starts at the user's home area with a draggable pin.
6. Record a backup video of the full script.

## Public deployment (Render, from GitHub)

The same app can also run on the public internet. [render.yaml](render.yaml) describes the service:

1. Sign in at [render.com](https://render.com) with GitHub.
2. **New → Blueprint**, pick this repo, then **Apply**.
3. Wait for the first build (about 5 minutes). It installs, downloads the Dhaka map and builds the web app. The URL looks like `https://shomap.onrender.com`.

Free-tier behaviour:
- The service sleeps after about 15 minutes idle, so the first visit takes 30–60 s to wake.
- The disk is temporary, so data resets to the seeded demo on every restart or deploy. The banner tells visitors this.
- Every push to `main` redeploys automatically.

`PUBLIC_DEMO=1` turns on the banner, proxy trust, and the public URL in the `/demo` QR code. Leave it unset for the offline laptop demo.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Server with reload on `:3000` plus Vite on `:5173` (the UI with hot reload) |
| `npm run demo` | Production build, served by the single Node process on `:3000` |
| `npm test` | Server unit and API tests (Vitest) |
| `npm run e2e` | The PRD §11 demo script in Chrome (Playwright), on port 3100 with its own data |
| `npm run rehearse` | Build, then e2e |
| `npm run typecheck` | TypeScript across all packages |
| `npm run fetch:map` | Download the offline map (add `--force` to refresh) |

## How it's built

```
apps/web         Vite + React + TypeScript. MapLibre over the local PMTiles map; HTML pins; EN/BN i18n
apps/server      Fastify + Socket.IO + SQLite (Drizzle). Pure domain logic in src/domain
packages/shared  zod schemas, enums and API types shared by both apps
assets/offline   dhaka.pmtiles (git-ignored; fetched by script)
data/            shomap.db, uploads, logs (git-ignored; created on first run)
e2e/             Playwright demo-script test
```

Key rules live in [apps/server/src/config.ts](apps/server/src/config.ts):
- 3 confirmations verify a report.
- 3 "still happening" votes reopen a resolved report.
- SOS radius is 3 km, and alerts last 72 h.
- Resolved reports auto-close after 72 h.
- Each user can send 5 reports an hour.

**Anonymity** is enforced in one place: [apps/server/src/serializers/](apps/server/src/serializers/). Every REST response and real-time event passes through it. Tests check that public payloads never contain an anonymous reporter's id or name.

**Bangla copy** in [apps/web/src/i18n/bn.json](apps/web/src/i18n/bn.json) is a first draft. Please have a native speaker on the team review it, as the PRD asks.
