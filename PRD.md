# ShoMap — Product Requirements Document (Hackathon Demo)

> **Report. Receive. Respond.**
> A community-powered platform where people in Bangladesh report, verify, and track everyday incidents together.

| | |
|---|---|
| **Team** | Team Snoopy: Yasin Rahman, Dia Nur Sehba, Faiza Fatima Sarah |
| **Document status** | v0.3: CEO and design reviews complete, ready to build against |
| **Build window** | About 1 week |
| **Scope** | Hackathon demo. Functional end to end on seeded Dhaka data; not production. |
| **Tech stack** | **Not decided.** This PRD is stack-agnostic on purpose. |
| **Humanity 101 principles** | Compassion · Integrity · Empathy |
| **Last updated** | 2026-09-30 |

---

## 1. Problem

Bangladesh (178M people) has no central, trusted place to report and track community incidents: extortion, mugging, missing children, traffic mismanagement, illegal vendors, garbage dumping.

- Business Standard (June) cited **1,400+ active muggers in Dhaka** alone.
- The Daily Star reported **15,717 missing children** from January to July.

The failure is not a lack of information. It's the chain that follows (deck, slide 3):

```
Incident happens → someone posts it somewhere → it gets buried → others never learn of it
→ no verification or tracking → no follow-up
```

People forget until they become victims. Mistrust of the system means nobody checks whether anything was done. Every so often the numbers show up in an article, and then everyone moves on.

## 2. Vision and demo goal

**Vision:** turn scattered local incidents into verified, trackable, actionable information. The record persists ("nothing gets forgotten"), authorities are visibly accountable, and neighbours show up for one another.

**Demo goal:** in a **3-minute live demo**, a judge sees one incident travel the full loop:

1. A citizen **reports** it.
2. Neighbours **receive** and **verify** it.
3. An authority **responds**.
4. The community **sees** the outcome.

A missing-child SOS shows the emotional stakes.

### Success criteria (demo)

| # | Criterion | How we know |
|---|---|---|
| S1 | The full loop (report → verify → refer → resolve → community sees it) runs live without a page reload | Rehearsed 5× with no failure |
| S2 | A new report takes **under 60 seconds** from tap to pin | Timed in rehearsal |
| S3 | The map looks "alive" on first load | 80+ seeded incidents across 12 Dhaka areas over 14 days |
| S4 | An SOS alert reaches a second device or tab in **under 5 seconds** | Two-screen demo |
| S5 | The whole UI switches between English and Bangla | Toggled live in the demo |
| S6 | The demo can be reset to a clean seeded state in one action | "Reset demo" admin action |

## 3. Guiding principles → product decisions

| Principle | What it means in ShoMap |
|---|---|
| **Compassion** | Missing-child SOS; "Offer help" and "Sighting" comment types; supportive tone in copy; no victim-blaming fields |
| **Integrity** | Community verification before referral; a full status history per incident; honest anonymity (admins can still see who reported); abuse flagging |
| **Empathy** | Anonymous reporting so extortion victims aren't exposed; SOS photos auto-hidden once the child is found; Bangla-first option; a report flow built for one hand and a bad signal |

## 4. Scope boundary: light crimes and civic issues only

ShoMap handles **light crimes and civic issues**. **Serious or violent crime is not reported on ShoMap.** Choosing one of those categories shows a full-screen redirect to the right hotline, and no pin is created.

**Why:** the platform can't safely handle evidence, victims, or live danger for serious crimes, and a public map pin could put a victim at risk.

### 4.1 Incident categories (seed set)

| Category (EN / BN) | Type | Default urgency | Routed to | Notes |
|---|---|---|---|---|
| Mugging / snatching (ছিনতাই) | Light crime | High | DMP police thana | |
| Pickpocketing (পকেটমার) | Light crime | Medium | DMP police thana | |
| Extortion (চাঁদাবাজি) | Light crime | High | DMP police thana | Anonymous suggested by default |
| Public harassment (হয়রানি) | Light crime | High | DMP police thana | Anonymous suggested by default |
| **Missing child (নিখোঁজ শিশু)** | Special | **Critical** | DMP police thana | **Triggers SOS alert** (§6.8) |
| Traffic mismanagement (যানজট) | Civic | Medium | DMP Traffic division | |
| Illegal vendor / footpath encroachment (ফুটপাত দখল) | Civic | Low | City Corporation (DNCC/DSCC) | |
| Garbage dumping (ময়লা) | Civic | Low | City Corporation | |
| Waterlogging / drainage (জলাবদ্ধতা) | Civic | Medium | City Corporation / WASA | |
| Broken road / streetlight (ভাঙা রাস্তা/বাতি) | Civic | Low | City Corporation | |
| Other (অন্যান্য) | Civic | Low | None (community only) | |
| *Assault, sexual violence, murder, kidnapping, armed robbery in progress* | **Blocked** | — | **Redirect: 999** | No pin created |
| *Domestic violence, violence against women or children* | **Blocked** | — | **Redirect: 109 / 999** | No pin created |

### 4.2 Urgency levels

| Level | Meaning | Map treatment |
|---|---|---|
| Low | Nuisance; fix within days | Small pin |
| Medium | Affects many people today | Medium pin |
| High | Personal safety risk | Large pin, pulses when new (< 1 h) |
| Critical | Life or child at risk now | SOS pin plus a banner for everyone in the radius |

A reporter can raise or lower urgency by one level from the category default. Only admins can set Critical on a non-SOS category.

## 5. Users and roles

| Role | Who | Primary jobs | Demo login |
|---|---|---|---|
| **Citizen** | Any resident | Report; view map, feed, dashboard; verify; comment; set watch zones; receive alerts | Phone number + mock OTP `1234` |
| **Authority** | Staff of a police thana, DMP Traffic, or a City Corporation | See referred incidents in their jurisdiction; acknowledge; update; resolve | Seeded account per authority |
| **Admin / Moderator** | ShoMap team | Review disputed, flagged, and SOS items; verify or remove; see anonymous reporters' identity; reset the demo | Seeded admin account |

A **demo role switcher** (visible only in demo mode) lets the presenter jump between the Citizen, Authority, and Admin views without logging out.

## 6. Functional requirements

Priority: **P0** = must work in the demo. **P1** = should work; cut only if behind schedule. **P2** = nice to have.

### 6.1 Accounts and access

| ID | Requirement | Pri |
|---|---|---|
| FR-1.1 | User signs up or logs in with a phone number and a **mock OTP** (always `1234`; no SMS sent) | P0 |
| FR-1.2 | The first run asks for a language (English / বাংলা) and a home area (from the seeded Dhaka areas) | P0 |
| FR-1.3 | Three roles (Citizen, Authority, Admin) with role-based access to screens and actions | P0 |
| FR-1.4 | The demo role switcher appears only when demo mode is on | P0 |
| FR-1.5 | Guests (not logged in) can view the map and incident details, but must log in to report, verify, or comment | P1 |

### 6.2 Reporting (REPORT)

| ID | Requirement | Pri |
|---|---|---|
| FR-2.1 | A 3-step report flow: **(1) Category → (2) Location → (3) Details** | P0 |
| FR-2.2 | Choosing a **blocked category** shows the hotline redirect (tap-to-call 999 / 109) and ends the flow without creating a pin | P0 |
| FR-2.3 | Location defaults to the device's GPS. The user can drag the pin or search a seeded area name. The area is derived from the pin with no external geocoder | P0 |
| FR-2.4 | Required fields: category, location, short description (10–280 characters). Optional fields: up to 3 photos (≤ 5 MB each), time it happened (defaults to now), urgency adjusted ±1 level | P0 |
| FR-2.5 | **Anonymous toggle** (see §6.9). It's on by default for Extortion and Public harassment | P0 |
| FR-2.6 | On submit, the incident appears on the map in **under 5 seconds** for every connected user, with status `open` / `unverified` | P0 |
| FR-2.7 | Photo metadata (EXIF, including GPS) is stripped before storage | P1 |
| FR-2.8 | Rate limit: at most 5 reports per user per hour, with a friendly message when hit | P1 |
| FR-2.9 | The user can see "My reports" with the live status of each | P0 |

### 6.3 Verification (integrity)

| ID | Requirement | Pri |
|---|---|---|
| FR-3.1 | Any logged-in user other than the reporter can **Confirm** ("I've seen this too") or **Dispute** ("This isn't right") once per incident, with an optional note | P0 |
| FR-3.2 | The incident becomes **verified** when confirms ≥ 3 **and** confirms ≥ 2 × disputes | P0 |
| FR-3.3 | The incident becomes **disputed** when disputes ≥ 3 **and** disputes > confirms. It moves to the admin queue, and its pin is greyed out | P0 |
| FR-3.4 | Admins and the assigned authority can verify or reject manually | P0 |
| FR-3.5 | Unverified incidents with no activity for 7 days expire (status `removed`, kept in history) | P2 |
| FR-3.6 | Verification state is visible on pins and cards: *Unverified* / *Verified by N neighbours* / *Disputed* | P0 |

See diagram: [04 Verification logic](diagrams/04-verification-logic.png)

### 6.4 Interactive map (RECEIVE)

| ID | Requirement | Pri |
|---|---|---|
| FR-4.1 | The map opens on the user's home area, with pins for incidents from the last 14 days | P0 |
| FR-4.2 | Pins are coloured and shaped by urgency and show a category icon. Pins cluster when zoomed out | P0 |
| FR-4.3 | Filters: category, urgency, verification state, status (active vs resolved), time range (24 h / 7 d / 14 d) | P0 |
| FR-4.4 | Tapping a pin opens a preview card; tapping the card opens Incident Detail | P0 |
| FR-4.5 | New incidents and status changes appear live, with no refresh | P0 |
| FR-4.6 | Resolved and closed incidents stay on the map (faded, hidden by default) as a permanent record: "nothing gets forgotten" | P1 |
| FR-4.7 | Watch zones are drawn as translucent circles on the map | P1 |

### 6.5 Incident detail and community thread (RECEIVE + RESPOND)

| ID | Requirement | Pri |
|---|---|---|
| FR-5.1 | The detail page shows category, urgency, verification badge, status timeline, location mini-map, photos, reporter (or "Anonymous"), and the assigned authority | P0 |
| FR-5.2 | **Status timeline**: every status change with actor role, time, and note (from `STATUS_EVENT`) | P0 |
| FR-5.3 | The **thread** has one level of replies. Comment types: `comment`, `update` ("still happening"), `sighting` (SOS only, with an optional pin), `offer_help`, `official` (authority only, visually distinct) | P0 |
| FR-5.4 | Comments can be posted anonymously, with the same anonymity rules as reports | P1 |
| FR-5.5 | Users can flag an incident or comment as abusive (reasons: false, offensive, personal info, spam) | P1 |
| FR-5.6 | **Area feed**: a chronological list of incidents in the user's home area and watch zones, with the latest thread activity. This is the "community thread" from the pitch | P0 |
| FR-5.7 | Share an incident link (copies the URL) | P2 |

### 6.6 Referral and authority response (RESPOND)

| ID | Requirement | Pri |
|---|---|---|
| FR-6.1 | **Auto-referral**: once an incident is verified, it's referred to the authority whose type matches the category and whose jurisdiction covers the incident's area | P0 |
| FR-6.2 | **Critical** incidents (missing child) are referred **immediately on submit**, without waiting for verification | P0 |
| FR-6.3 | "Other" and categories with no authority stay community-only. An admin can refer them manually | P1 |
| FR-6.4 | The **Authority console** lists referred incidents in the authority's jurisdiction. It's sorted by urgency, then by age, and shows a "waiting for" timer (e.g. *Awaiting acknowledgement · 42 min*) | P0 |
| FR-6.5 | Authority actions: **Acknowledge → In progress → Resolved (note required)**, or **Redirect** (wrong jurisdiction, back to the admin queue) | P0 |
| FR-6.6 | Each authority action writes a `STATUS_EVENT`, posts an `official` comment on the thread, and notifies the reporter and watchers | P0 |
| FR-6.7 | **Community reopen** (decision D2): after an incident is resolved, the community can press "Still happening". **3 or more** such presses reopen it to `in_progress`, with a `STATUS_EVENT` and a notification to the authority. Otherwise it auto-closes after 72 h | P0 |
| FR-6.8 | The authority sees the reporter's identity even for anonymous reports (needed for follow-up) and is told it must not be disclosed | P0 |

See diagrams: [02 Report → Receive → Respond](diagrams/02-report-receive-respond.png), [03 Incident lifecycle](diagrams/03-incident-lifecycle.png)

### 6.7 Dashboard (insight)

| ID | Requirement | Pri |
|---|---|---|
| FR-7.1 | Scope selector: my home area / a watch zone / all of Dhaka | P0 |
| FR-7.2 | Headline counts: total reported, **high + critical**, verified, resolved, for the last 7 days | P0 |
| FR-7.3 | Breakdown **by urgency** (sorted Critical → Low) and **by category** | P0 |
| FR-7.4 | A 14-day daily trend of reported vs resolved | P1 |
| FR-7.5 | Every number is tappable and opens the map or feed pre-filtered to that set | P1 |

### 6.8 Missing-child / SOS alert (accepted expansion)

| ID | Requirement | Pri |
|---|---|---|
| FR-8.1 | The Missing child category collects extra fields: child's first name, age, photo (required), clothing description, last-seen location and time, and a contact preference | P0 |
| FR-8.2 | On submit: urgency is set to Critical, an `SOS_ALERT` is created (**radius 3 km**, **expires in 72 h**), and the incident is referred immediately (FR-6.2) | P0 |
| FR-8.3 | Everyone whose **home area centroid or watch zone intersects the radius** gets a real-time, full-width **SOS banner** and an entry in their alerts inbox within 5 s | P0 |
| FR-8.4 | People nearby can post a **Sighting** (comment plus an optional pin). The reporter is notified on each one | P0 |
| FR-8.5 | The reporter or an admin can mark **Found** or **Cancel**. The alert closes, everyone alerted is told "Found safe", and the **child's photo is hidden from public view** | P0 |
| FR-8.6 | **Immediate and retractable** (decision D1): the SOS goes out immediately and is flagged "Pending review" in the admin queue. An admin can retract it | P0 |
| FR-8.7 | **No anonymous SOS** (decision D3): the anonymous toggle is disabled for Missing child, with the explanation *"We need to reach you when someone spots your child."* | P0 |
| FR-8.8 | SOS pins sit above all other pins, and the SOS banner outranks every other notification | P0 |

See diagram: [05 SOS alert sequence](diagrams/05-sos-alert-sequence.png)

### 6.9 Anonymous reporting (accepted expansion, refined)

| ID | Requirement | Pri |
|---|---|---|
| FR-9.1 | Anonymous means **anonymous to the public only**. `reporter_id` is **always stored**. | P0 |
| FR-9.2 | Public views (map, feed, detail, thread, dashboard) show "Anonymous" and never include the reporter's identity. **This is enforced server-side, not just hidden in the UI** | P0 |
| FR-9.3 | Admins and the assigned authority see the real reporter, marked with an "Anonymous to public" tag | P0 |
| FR-9.4 | The toggle's copy spells out who can see the reporter: *"Your name is hidden from the public. ShoMap moderators and the assigned authority can still see it."* | P0 |
| FR-9.5 | Anonymous reports count toward rate limits, and abuse flags hold the real account accountable | P1 |

### 6.10 Area watch zones (accepted expansion)

| ID | Requirement | Pri |
|---|---|---|
| FR-10.1 | A user creates up to 5 watch zones: a label ("Home", "Office", "Child's school"), a centre (tap the map or use the current location), and a radius (500 m / 1 km / 2 km / 5 km) | P0 |
| FR-10.2 | Each zone has a **minimum urgency** for notifications (default: High) | P0 |
| FR-10.3 | A new incident in a zone at or above its minimum urgency creates a notification. **Verified** status changes on incidents in the zone create a notification | P0 |
| FR-10.4 | Watch zones feed the area feed (FR-5.6) and the dashboard scope (FR-7.1) | P0 |
| FR-10.5 | Users can edit, rename, and delete zones | P1 |

### 6.11 Notifications

| ID | Requirement | Pri |
|---|---|---|
| FR-11.1 | An in-app alerts inbox with an unread badge. Types: `sos`, `watch_zone`, `status_change`, `reply`, `sighting` | P0 |
| FR-11.2 | Real-time in-app toast or banner while the app is open | P0 |
| FR-11.3 | Tapping a notification opens the related incident, and the notification is marked read | P0 |
| FR-11.4 | Users are notified about their own reports' status changes and replies to their comments | P0 |

### 6.12 Admin and moderation

| ID | Requirement | Pri |
|---|---|---|
| FR-12.1 | The **review queue** has tabs: *SOS pending review*, *Disputed*, *Flagged*, *Redirected by authority* | P0 |
| FR-12.2 | Admin actions: verify, remove (reason required), hide a comment, refer manually to any authority, retract an SOS | P0 |
| FR-12.3 | Every admin action writes an audit event (`STATUS_EVENT`, or a flag state change) | P0 |
| FR-12.4 | **Reset demo** restores the seeded dataset in under 10 seconds | P0 |

### 6.13 Language (English + Bangla)

| ID | Requirement | Pri |
|---|---|---|
| FR-13.1 | Every UI string exists in English and Bangla. The `EN / বাং` toggle sits in the top bar at every width and switches instantly, with no reload | P0 |
| FR-13.2 | Category and area names come from the data (`name_en` / `name_bn`) | P0 |
| FR-13.3 | Numbers and dates are localised in Bangla mode (১২৩, relative times such as "৫ মিনিট আগে") | P1 |
| FR-13.4 | User-generated text is shown as written, with no machine translation | P0 |

### 6.14 Seed data (demo realism)

| ID | Requirement | Pri |
|---|---|---|
| FR-14.1 | 12 Dhaka areas: Mirpur, Uttara, Gulshan, Banani, Mohakhali, Farmgate, Dhanmondi, Mohammadpur, Motijheel, Jatrabari, Badda, and Old Dhaka. Each has EN/BN names and a centroid | P0 |
| FR-14.2 | Authorities: one police thana per area, DMP Traffic (all areas), DNCC (north areas), DSCC (south areas), and WASA | P0 |
| FR-14.3 | About 80 incidents over the last 14 days, weighted to be realistic (e.g. snatching clusters at Farmgate and Mohakhali bus stands, waterlogging in Motijheel), in a mix of statuses | P0 |
| FR-14.4 | 15 or more seeded citizens with EN/BN names, comments, and verifications, so threads look lived-in | P0 |
| FR-14.5 | A scripted "hero incident" and a hero SOS for the demo script (§11) | P0 |

## 7. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | **Performance** | The map with 500 pins becomes interactive in ≤ 2 s on mid-range Android over 4G. Report submission is acknowledged in ≤ 1 s |
| NFR-2 | **Real-time** | New incidents, status changes, and SOS alerts reach connected clients in ≤ 5 s |
| NFR-3 | **Responsive (web app)** | **Desktop-first** web app, designed for a 1280–1920 px laptop or projector. It must remain fully usable in a mobile browser down to 360 px (layout in §12.2). No native app |
| NFR-4 | **Accessibility** | Targets WCAG 2.1 AA: 4.5:1 text contrast, **urgency never shown by colour alone** (shape, icon, and label too), 44 px touch targets, full keyboard navigation, screen-reader labels on pins and buttons |
| NFR-5 | **Localisation** | Full EN/BN parity. The Bangla font renders conjuncts correctly (e.g. Noto Sans Bengali / Hind Siliguri). Layouts tolerate text about 30% longer |
| NFR-6 | **Privacy** | Anonymous reporter identity never appears in any public API response. Photo EXIF is stripped. SOS child photos are hidden once found or expired. No real personal data in the seed |
| NFR-7 | **Security** | Role-based authorization is checked server-side on every write. Input is validated and sanitised (no XSS in comments). Rate limits per FR-2.8. Secrets are not committed |
| NFR-8 | **Reliability (demo)** | The demo must not depend on any paid or fragile third-party API except map tiles. Map tiles have a fallback (a cached or offline style, or a static screenshot mode). The live demo has a rehearsed backup video |
| NFR-9 | **Integrity / auditability** | Every state change is recorded in `STATUS_EVENT` with the actor and time, and is never deleted. "Removed" is a soft delete |
| NFR-10 | **Usability** | A first-time user can file a report in ≤ 60 s with no instructions. At most 3 required fields |
| NFR-11 | **Observability (demo-grade)** | Server errors are logged with request IDs. The admin view shows a live event log (last 50 events) to prove activity during the demo. Every user-facing error has a clear message and a retry (§9) |
| NFR-12 | **Portability** | Stack-agnostic. Must run in current Chrome (Android and desktop) and Safari (iOS). No native app required |
| NFR-13 | **Deployability** | One command or action seeds or resets the data. Deployed at a public URL judges can open on their own phones |

## 8. Out of scope (for the demo)

| Item | Why it's out | Future? |
|---|---|---|
| Reporting serious or violent crime | Safety and legal risk; redirected to 999 / 109 instead | No (by design) |
| Real SMS OTP, native push notifications, SMS/USSD reporting | Cost and setup time; in-app notifications prove the concept | Yes, v1 |
| Real integration with 999, DMP, or City Corporation systems | Needs official partnerships; authority accounts are simulated | Yes, partnership track |
| Native iOS / Android apps | A mobile web app is enough for the demo | Yes |
| Cities beyond Dhaka | Seed data focus | Yes |
| **Reporter trust score** | Offered in the CEO review, not selected. Hard to explain in 3 minutes | Deferred |
| **Duplicate report merging** | Offered, not selected. Matching edge cases | Deferred |
| **AI category / urgency suggestion** | Offered, not selected. Live API dependency on demo day | Deferred |
| **Authority accountability board** (public response-time league table) | Offered, not selected. `REFERRAL` timestamps already capture the data | Deferred; the data model supports it |
| **Hotspot heatmap layer** | Offered, not selected. Pin clustering covers density for now | Deferred |
| Location check for verifiers (must be nearby to confirm) | Needs a location-trust design | Deferred |
| Face or number-plate blurring in photos | ML dependency | Deferred |
| Direct messages between users | Harassment risk; the thread is enough | No |
| Video or audio evidence | Storage and moderation cost | Deferred |
| Donations or payments | Not core | No |
| Data export / open-data API | Post-demo | Deferred |
| Offline-first mode | Complexity | Deferred |
| Machine translation of user posts | Accuracy and cost | Deferred |

## 9. Error and edge-case handling (zero silent failures)

| Situation | Trigger | Handling | What the user sees |
|---|---|---|---|
| GPS denied or unavailable | Browser permission off | Fall back to the home-area centroid with a draggable pin | "Couldn't get your location. Drag the pin to where it happened." |
| Pin outside the seeded areas | Pin dropped outside Dhaka | Block submit | "ShoMap's demo covers Dhaka only. Move the pin inside the highlighted area." |
| Photo too large or wrong type | > 5 MB, or not an image | Reject that file and keep the others | Inline error on that thumbnail |
| Network drops during submit | Request fails | Keep the form state; retry with backoff; don't submit twice (idempotency key) | "Not sent yet. Retrying…" then success, or a "Try again" button |
| Rate limit hit | 6th report within an hour | Reject | "You've sent 5 reports this hour. Thank you. Please try again in N min." |
| Self-verification or double vote | Reporter votes, or a second vote | Button disabled, with a tooltip | "You reported this" / "You already confirmed" |
| Real-time connection lost | Socket disconnects | Auto-reconnect; fetch missed events | Small "Reconnecting…" pill; the map catches up |
| No authority for the area | Jurisdiction gap | Incident goes to the admin queue (Redirected tab) | Detail shows "Awaiting assignment" |
| Authority redirects | Wrong jurisdiction | Back to the admin queue, with the reason logged | Timeline shows "Redirected by X: reason" |
| SOS retracted by admin | Suspected fake | Alert cancelled; all recipients notified | "This alert was withdrawn by moderators." |
| SOS expires | 72 h pass without Found | Alert state `expired`; photo hidden; incident stays referred | Reporter prompted: "Still missing? Re-issue the alert." |
| Map tiles fail to load | Tile provider down | Plain vector or basemap fallback; pins still render | Subtle banner: "Map background unavailable" |
| Empty area | No incidents in scope | Empty state (see the design review) | Warm message plus a "Report something" call to action |
| Blocked category | Serious crime chosen | No incident created | Full-screen hotline card with tap-to-call |

## 10. Diagrams

All sources are editable mermaid (`.mmd`) files. Each is rendered to `.svg`, `.png`, and `.excalidraw` (open the last at excalidraw.com → File → Open).

| # | Diagram | File |
|---|---|---|
| 01 | System context: actors and external systems | [diagrams/01-system-context.png](diagrams/01-system-context.png) |
| 02 | Report → Receive → Respond core flow | [diagrams/02-report-receive-respond.png](diagrams/02-report-receive-respond.png) |
| 03 | Incident lifecycle (state machine) | [diagrams/03-incident-lifecycle.png](diagrams/03-incident-lifecycle.png) |
| 04 | Verification logic | [diagrams/04-verification-logic.png](diagrams/04-verification-logic.png) |
| 05 | Missing-child SOS alert (sequence) | [diagrams/05-sos-alert-sequence.png](diagrams/05-sos-alert-sequence.png) |
| 06 | **ERD**: data model | [diagrams/06-erd.png](diagrams/06-erd.png) |
| 07 | Screen map / information architecture | [diagrams/07-screen-map.png](diagrams/07-screen-map.png) |

### 10.1 ERD notes

- **Status and verification are two separate fields.** `INCIDENT.status` holds the lifecycle (open → referred → acknowledged → in_progress → resolved → closed | removed). `INCIDENT.verification` holds trust (unverified | verified | disputed). An SOS can be `referred` while still `unverified`.
- `INCIDENT.reporter_id` is always set. `is_anonymous` only controls public projection (FR-9.1).
- `confirm_count` and `dispute_count` are denormalised copies of `VERIFICATION` counts, so pins render fast. `VERIFICATION` is unique on (`incident_id`, `user_id`).
- `REFERRAL` timestamps (`referred_at`, `acknowledged_at`, `resolved_at`) provide response-time data, which is enough to build the deferred accountability board later without schema changes.
- `JURISDICTION` is many-to-many: DMP Traffic covers every area; each thana covers one.
- `STATUS_EVENT` is append-only (NFR-9).
- `CATEGORY.is_blocked` and `redirect_hotline` drive the serious-crime redirect as data, not code.

## 11. Demo script (3 minutes, two screens)

| Time | Screen | Beat |
|---|---|---|
| 0:00 | Deck | Problem: "We hear about incidents. Then we forget." |
| 0:20 | Phone A (Citizen: Rahim, Farmgate) | The map is alive with Dhaka pins. Toggle to বাংলা and back. |
| 0:40 | Phone A | **Report**: phone snatching at the Farmgate bus stand. Anonymous on. Pin appears. |
| 1:00 | Laptop (switch to Citizens Nila and Tanvir) | Pin appears live. Two neighbours **Confirm**, plus one seeded confirm, and the incident is **Verified by 3 neighbours**. |
| 1:20 | Laptop (Authority: Tejgaon Thana) | The console shows the new referral at the top with a timer. **Acknowledge → In progress**. Official update posted. |
| 1:40 | Phone A | Rahim gets the notification; the timeline shows the official update. Admin view shows the reporter's real name; the public view shows "Anonymous". |
| 2:00 | Phone A (Parent) | **Missing child** SOS in Mirpur 10. |
| 2:10 | Laptop (Citizen with a Mirpur watch zone) | Full-width SOS banner arrives in under 5 s. Post a **Sighting** with a pin. |
| 2:30 | Phone A | Parent sees the sighting and marks **Found**. Everyone gets "Found safe"; the photo is hidden. |
| 2:45 | Laptop | **Dashboard**: Farmgate high-urgency count ticks up; resolved count visible. Close with "Report. Receive. Respond." |

## 12. UX and design specification

*Added by the design review. Every item below was approved individually.*

### 12.1 Visual direction: "Civic and calm"

The product should feel like a trustworthy public notice board kept by neighbours. It should not feel like a panic app or a startup landing page.

**Banned:** gradient hero sections, 3-column feature grids, stock photos, glassmorphism, and red used anywhere except SOS and Critical.

| Token | Value | Use |
|---|---|---|
| `--brand` | `#006A4E` (Bangladesh green) | Primary buttons, active nav, the verified badge |
| `--brand-ink` | `#004D38` | Text and icons on light green |
| `--sos` | `#F42A41` (Bangladesh red) | **Only** for SOS and Critical. Red always means "act now" |
| `--paper` | `#FAF8F3` | App background (warm off-white) |
| `--surface` | `#FFFFFF` | Cards, panels |
| `--ink` | `#1F2421` | Body text (≥ 12:1 contrast on paper) |
| `--ink-muted` | `#5B635E` | Secondary text (≥ 4.5:1) |
| `--line` | `#E4E1D8` | Dividers, borders |
| `--official` | `#1E4E8C` | Authority `official` comments and the authority badge |

- **Type:** Inter for Latin text and Hind Siliguri for Bangla, chosen per language. Scale: 12 / 14 / 16 (body) / 20 / 24 / 32. Line height 1.5 for Bangla (conjuncts need the room) and 1.4 for Latin.
- **Spacing:** a 4 px base (4, 8, 12, 16, 24, 32, 48). Radius is 8 px on cards and 999 px on chips. Shadows are one soft level for floating elements only.
- **Icons:** one outline icon set at 1.5 px stroke, with one glyph per category, shared by pins, chips, and cards.
- **Map:** a **muted light basemap** (low-saturation grey/beige) so pins are the loudest thing on screen. Area labels follow the current language where the tile provider supports it.

### 12.2 Urgency encoding (colour-blind safe)

| Urgency | Colour | Pin shape | Label | Extra |
|---|---|---|---|---|
| Low | Grey-blue `#6B7F99` | Circle | "Low" / "কম" | — |
| Medium | Amber `#C98A00` | Rounded square | "Medium" / "মাঝারি" | — |
| High | Orange `#D9560B` | Triangle | "High" / "বেশি" | Pulses for its first hour |
| Critical / SOS | Red `#F42A41` | Octagon | "SOS" / "জরুরি" | Continuous pulse; always drawn on top |

Every pin carries its category glyph. Verification state is shown on the pin's outline: **unverified** is a dashed outline, **verified** is a solid outline with a ✓, and **disputed** is the whole pin at 40% opacity. Every card and list row repeats the text label. **Colour is never the only signal (NFR-4).** Motion honours `prefers-reduced-motion`, which replaces the pulse with a static ring.

### 12.3 Layout and navigation (desktop-first web app)

**Desktop and projector (≥ 1024 px)**

```
┌────────────────────────────────────────────────────────────────────┐
│ ShoMap  Map  Feed  Dashboard  Alerts(3)        EN|বাং   [Rahim ▾] │  top bar
├──────────────────────┬─────────────────────────────────────────────┤
│ Filter chips         │ ▓ SOS: Missing child, Mirpur 10 · 12 min ▓  │  SOS banner (only when active)
│ ─────────────────    │                                             │
│ Incident list        │                MAP                          │
│ (sorted by urgency,  │         (pins, clusters, zones)             │
│  then recency)       │                                             │
│ ...                  │  7d: 42 reported · 9 high+ · 18 resolved    │  counts strip
│                      │                          [ + Report ]       │  floating button
└──────────────────────┴─────────────────────────────────────────────┘
```

- **Map screen hierarchy:** (1) pins and the SOS banner, (2) filter chips and the list, (3) the counts strip. The Report button is always visible, bottom right.
- **Incident detail** opens as a 480 px right-hand panel over the map, so the pin stays in view. It has its own URL so it can be shared. Hierarchy: (1) title, urgency, verification badge, and the **Confirm / Dispute** buttons, (2) the status tracker and photos, (3) the thread.
- **Report flow** is a centred 560 px modal with 3 steps and a progress indicator.
- **Authority console** and **Admin queue** are full-width tables, with the incident panel opening on the right. They're reached from the profile menu, visible only to those roles.

**Mobile browser (< 768 px)**

- The top bar collapses to logo, language, and avatar. The nav becomes a **bottom bar**: Map · Feed · **(＋ Report, raised centre button)** · Alerts · Me.
- The list becomes a **bottom sheet** over the map with three positions (peek / half / full).
- Incident detail and the report flow open full-screen with a back arrow.
- Touch targets are ≥ 44 px, and the primary action sits in the bottom third of the screen, reachable with one hand.

**768–1023 px:** the desktop layout with the list panel collapsible to an icon rail.

### 12.4 Key moments (journey and emotional arc)

| Moment | Design |
|---|---|
| **First 5 seconds** (landing on the map) | An alive map of their area with pins already visible, plus a one-line headline: *"42 things neighbours reported in Farmgate this week."* No splash screen and no tour. |
| **First run** | A two-question card over the map: language and home area. Nothing else is required before browsing. Login is asked for only when the user reports, verifies, or comments. |
| **After submitting a report** | A "you started something" confirmation: *"Thank you. 23 neighbours near Farmgate will be asked if they've seen this too."* A **4-step tracker** follows: Reported ✓ → Verified → Referred → Resolved. The same tracker appears on the incident and in "My reports". |
| **Being asked to verify** | Card copy: *"Seen this too?"* with **[Yes, I've seen it]** and **[Something's not right]**. It's one tap each; a note is optional. |
| **Getting an official response** | A toast with the authority badge: *"Tejgaon Thana is on it."* The tracker advances with a small check animation. |
| **SOS received** | A full-width red banner with the child's photo, age, and last-seen place and time. Actions: **[I saw this child]** and **[Share]**. It can't be dismissed while the viewer is inside the radius, but it can be collapsed. |
| **Found** | A green banner for everyone alerted: *"Found safe. Thank you, Mirpur."* The photo is removed. |
| **Ongoing relationship** | Watch-zone digests in the alerts inbox, plus "Nothing gets forgotten": resolved incidents stay on the map, faded. |

### 12.5 Interaction state matrix (English copy; Bangla copy written natively)

| Screen | Loading | Empty | Error | Success | Partial data |
|---|---|---|---|---|---|
| **Map** | Basemap first, then pins fade in; the list shows 5 skeleton rows | "Quiet in {area} this week 🌿. Seen something? **[Report it]**" | "Couldn't load incidents. **[Try again]**" (the basemap still shows) | Pins plus the counts strip | Tiles failed: plain background with pins and the note "Map background unavailable" |
| **Feed** | Skeleton cards | "No updates in your areas yet. **[Add a watch zone]** to follow the places you care about." | "Feed didn't load. **[Retry]**" | Cards, newest first | Some photos failed: grey placeholder with a camera-off icon; the text still shows |
| **Incident detail** | Header skeleton; thread spinner below | Thread: "No comments yet. Be the first to share an update." | "This report couldn't be opened. It may have been removed." **[Back to map]** | Full detail | The authority isn't assigned yet: "Awaiting assignment" in the tracker |
| **Report flow** | Submit button shows "Sending…" and is disabled (no double submit) | — | Per-field inline errors; network failure: "Not sent yet. Retrying…" then **[Try again]**, with the form kept | "You started something" confirmation (§12.4) | 1 of 3 photos failed: "2 photos attached, 1 couldn't upload. **[Retry]** or continue without it" |
| **Dashboard** | Number placeholders shimmer | "No reports in {scope} in the last 7 days." | "Stats unavailable right now. **[Retry]**" | Counts, breakdowns, trend | The trend chart failed but counts loaded: the chart area says "Trend unavailable" |
| **Alerts** | Skeleton rows | "You're all caught up. We'll tell you when something happens in your watch zones." | "Couldn't load alerts. **[Retry]**" | List with unread dots | — |
| **Authority console** | Table skeleton | "No open referrals for {authority}. Nice work." | "Queue unavailable. **[Retry]**" | Rows sorted by urgency and age, with timers | — |
| **Admin queue** | Table skeleton | "Nothing to review 🎉" per tab | "Queue unavailable. **[Retry]**" | Rows by tab | — |
| **Watch zones** | — | "Follow places you care about: home, office, your child's school. **[Add a zone]**" | "Zone not saved. **[Retry]**" | "Now watching {label}" | — |

Disabled states always explain themselves on hover and on tap: *"You reported this, so neighbours need to confirm it"*, *"You already confirmed"*, *"Log in to confirm"*.

### 12.6 Tone of voice: neighbourly and plain

- Use second person, short sentences, and verbs people actually say: "Seen this too?", not "Verify incident"; "Report it", not "Submit incident".
- Stay calm everywhere except SOS. There, be urgent but never graphic.
- Don't blame victims. The report form never asks "why were you there?" or anything similar.
- Bangla copy is written natively by the team, not machine-translated. Keep English terms people commonly use in Bangla ("SOS", "OTP").

### 12.7 Accessibility specifics

- All interactive elements are reachable by keyboard in visual order. Focus rings are 2 px `--brand` plus a 2 px offset.
- Map pins are focusable, and each has an accessible name: *"High urgency, Mugging, Verified, Farmgate, 20 minutes ago"*. The list panel is the screen-reader equivalent of the map.
- The SOS banner uses `role="alert"`. Toasts use `aria-live="polite"`.
- Text contrast is ≥ 4.5:1 and UI component contrast ≥ 3:1. Urgency is never conveyed by colour alone (§12.2).
- `lang` switches between `en` and `bn` on the root element, so screen readers use the right voice.

## 13. Open questions

1. Verification threshold: is 3 right for a live demo? (It's a config value, so it can be lowered to 2 for the stage.)
2. Which map tile provider can we use, given no stack has been chosen? Its rate limits and attribution matter for NFR-8.
3. Do we want a "judge mode" QR code on the final slide so judges can file a report themselves during Q&A?

---


## CEO REVIEW REPORT

**Mode:** B, Selective Expansion. The pitch-deck scope (interactive map, verified reporting, community thread, dashboard) is the floor. Each expansion was offered neutrally and accepted or rejected by the team.

**Scope decisions**

| Decision | Outcome | Rationale |
|---|---|---|
| Authority side | **Added**: a simple role view (console) | Without it "Respond" is just a badge, and the loop never closes on stage |
| Language | **Added**: EN + Bangla toggle | A strong local signal; costs about one string file |
| Anonymous reporting | **Added, refined**: anonymous to the public, visible to admins and the assigned authority | Protects extortion and harassment reporters without creating unaccountable spam |
| Scope boundary | **Clarified**: light crimes and civic issues only; serious crime redirects to 999 / 109 | A public pin for a violent crime can endanger the victim, and the platform can't handle live danger |
| Missing-child SOS alert radius | **Added** | The emotional peak of the demo; backed by the 15,717 figure |
| Area watch zones | **Added** | Turns "my area" into something personal; powers the feed, alerts, and dashboard scope |
| D1: SOS gating | **Immediate, retractable** by an admin | Minutes matter; fake alerts are handled after the fact |
| D2: Community reopen | **Yes**: 3+ "Still happening" reopens a resolved incident | Makes "authorities are held accountable" something you can see, not just a slogan |
| D3: Anonymous SOS | **Not allowed** | Sightings must reach the parent, and every alert must be traceable |
| Trust score, duplicate merging, AI suggestion, accountability board, heatmap | **Rejected**, recorded in §8 as deferred | Team choice; the data model (`REFERRAL` timestamps) keeps the accountability board cheap later |

**Audit notes (from step 1)**

- The pitch says "referred to nearby authorities" but never names who. The PRD now fixes routing as data: category → authority type, and area → jurisdiction.
- The pitch's "dynamic dashboard sorted by urgency" had no scope (whose area?). It's now tied to home area, watch zone, or all of Dhaka.
- The pitch has no stated verification rule. The PRD sets 3 confirms and ≥ 2× disputes, configurable.

**Biggest remaining risk:** **demo fragility on stage.** Real-time sync between two screens, map tiles over venue Wi-Fi, and a live SOS are three moving parts in one 3-minute window. Mitigations: NFR-8 (tile fallback), FR-12.4 (one-click reset), and a recorded backup video. Rehearse the §11 script at least 5 times on venue-like Wi-Fi or a phone hotspot.

**Verdict:** ambitious enough to be worth building. The accepted expansions (SOS and watch zones) add emotional weight and personal relevance without breaking the one-week budget, and the core loop is a genuine story, not a feature list.

## DESIGN REVIEW REPORT

| Pass | Before | After | What changed |
|---|---|---|---|
| 1. Information architecture | 4 | **9** | Desktop-first top bar with a list and map split; mobile bottom bar and bottom sheet; primary/secondary/tertiary set for the map and detail screens (§12.3) |
| 2. Interaction state coverage | 4 | **9** | A full state matrix with copy for 9 screens, plus disabled-state explanations (§12.5) |
| 3. Journey & emotional arc | 6 | **9** | First 5 seconds, first run, the post-submit tracker, verification ask, official response, SOS, and Found moments designed (§12.4) |
| 4. AI-slop risk | 3 | **8** | "Civic and calm" direction with named tokens and a list of banned patterns (§12.1) |
| 5. Design system alignment | 2 | **8** | Colour, type, spacing, radius, and icon tokens defined; urgency encoding specified (§12.1–12.2). No existing system to align to (the repo is empty) |
| 6. Responsive & accessibility | 6 | **9** | Three breakpoints, each designed on purpose; keyboard, screen-reader, contrast, reduced-motion, and `lang` specifics (§12.3, §12.7) |
| 7. Unresolved design decisions | 5 | **8** | Tone of voice and map style decided (§12.6, §12.1) |

**Decisions made:** desktop-first web app that works in a mobile browser · full state matrix with copy · "Civic and calm" visual direction · urgency as colour + shape + label · post-submit progress tracker · neighbourly, plain voice · muted light basemap.

**Still unresolved, and why**

- **Logo and wordmark.** The deck has one; it isn't carried into the PRD. The team owns the brand asset.
- **Specific icon set and map tile provider.** Both depend on the tech stack, which is intentionally undecided (see §13).
- **Final Bangla copy.** It must be written natively by the team; machine translation is explicitly ruled out.
- **Pixel-level mockups.** Out of scope for a plan review. Build the map screen first and review it live.

**Verdict:** ready to build against. The remaining gaps are asset or stack choices, not missing design thinking.
