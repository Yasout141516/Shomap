import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";
import { openDb } from "../../src/db/client.js";
import { seed, staffIdFor } from "../../src/db/seed.js";
import { buildApp } from "../../src/app.js";
import { Clock } from "../../src/clock.js";
import type { Ctx } from "../../src/services/context.js";

const NOW = Date.parse("2026-10-02T12:00:00Z");
const FARMGATE = { lat: 23.7579, lng: 90.3901 };

let app: FastifyInstance;
let ctx: Ctx;
let clock: Clock;

beforeEach(async () => {
  const handle = openDb(":memory:");
  clock = new Clock(() => NOW);
  seed(handle.db, NOW);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shomap-test-"));
  ({ app, ctx } = await buildApp({ handle, clock, cfg: { dataDir, offlineDir: path.join(dataDir, "none"), webDist: path.join(dataDir, "none") } }));
});

async function loginAs(userId: string): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/demo/switch-role", payload: { userId } });
  expect(res.statusCode).toBe(200);
  const c = res.cookies.find((c) => c.name === "shomap_sid")!;
  return `shomap_sid=${c.value}`;
}

let keyN = 0;
function multipart(data: object, photos: Buffer[] = []) {
  const boundary = "----shomaptest" + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${JSON.stringify(data)}\r\n`));
  photos.forEach((p, i) => {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="p${i}.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`));
    parts.push(p, Buffer.from("\r\n"));
  });
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

async function report(cookie: string, data: Record<string, unknown>, photos: Buffer[] = []) {
  const body = multipart(
    { categoryId: "cat-mugging", ...FARMGATE, description: "Phone snatched at the bus stand by two men on a bike.", isAnonymous: false, idempotencyKey: `key-${++keyN}-${Math.random()}`, ...data },
    photos,
  );
  return app.inject({ method: "POST", url: "/api/incidents", payload: body.payload, headers: { ...body.headers, cookie } });
}

const confirm = (cookie: string, id: string) =>
  app.inject({ method: "POST", url: `/api/incidents/${id}/votes`, payload: { vote: "confirm" }, headers: { cookie } });

describe("auth", () => {
  it("rejects a wrong OTP and asks new users for a name", async () => {
    const bad = await app.inject({ method: "POST", url: "/api/auth/login", payload: { phone: "01799999999", otp: "0000" } });
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toMatchObject({ code: "invalid_otp", messageKey: "errors.invalid_otp" });
    const noName = await app.inject({ method: "POST", url: "/api/auth/login", payload: { phone: "01799999999", otp: "1234" } });
    expect(noName.json().details).toMatchObject({ needsName: true });
    const ok = await app.inject({ method: "POST", url: "/api/auth/login", payload: { phone: "01799999999", otp: "1234", displayName: "New Neighbour" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ isNew: true, me: { role: "citizen" } });
  });

  it("requires login to report and the right role for staff routes", async () => {
    expect((await report("", {})).statusCode).toBe(401);
    const citizen = await loginAs("u-rahim");
    expect((await app.inject({ method: "GET", url: "/api/authority/queue", headers: { cookie: citizen } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/admin/queue", headers: { cookie: citizen } })).statusCode).toBe(403);
  });
});

describe("reporting", () => {
  it("redirects blocked categories without creating anything", async () => {
    const c = await loginAs("u-rahim");
    const res = await report(c, { categoryId: "cat-violent_crime" });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "blocked_category", details: { hotline: "999" } });
  });

  it("rejects pins outside Dhaka but accepts the boundary edge", async () => {
    const c = await loginAs("u-rahim");
    expect((await report(c, { lat: 22.35, lng: 91.78 })).json().code).toBe("out_of_area");
    expect((await report(c, { lat: 23.68, lng: 90.3 })).statusCode).toBe(201);
  });

  it("is idempotent for the same key", async () => {
    const c = await loginAs("u-rahim");
    const a = await report(c, { idempotencyKey: "same-key-123" });
    const b = await report(c, { idempotencyKey: "same-key-123" });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(200);
    expect(b.json().id).toBe(a.json().id);
  });

  it("rejects another user's idempotency key instead of failing", async () => {
    const a = await report(await loginAs("u-rahim"), { idempotencyKey: "shared-key-123" });
    expect(a.statusCode).toBe(201);
    const b = await report(await loginAs("u-nila"), { idempotencyKey: "shared-key-123" });
    expect(b.statusCode).toBe(400);
  });

  it("rate-limits the 6th report in an hour", async () => {
    const c = await loginAs("u-nusrat");
    for (let i = 0; i < 5; i++) expect((await report(c, {})).statusCode).toBe(201);
    const sixth = await report(c, {});
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().details.retryAfterMin).toBeGreaterThan(0);
  });

  it("strips photo metadata", async () => {
    const c = await loginAs("u-rahim");
    const withExif = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: "secret-location" } } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const res = await report(c, {}, [withExif]);
    expect(res.statusCode).toBe(201);
    const url: string = res.json().incident.media[0].url;
    const saved = fs.readFileSync(path.join(ctx.cfg.dataDir, "uploads", path.basename(url)));
    expect((await sharp(saved).metadata()).exif).toBeUndefined();
  });
});

describe("anonymity over HTTP", () => {
  it("hides an anonymous reporter from other citizens but shows the admin and the reporter", async () => {
    const rahim = await loginAs("u-rahim");
    const id = (await report(rahim, { isAnonymous: true })).json().id;
    const nila = await loginAs("u-nila");
    const asNila = await app.inject({ method: "GET", url: `/api/incidents/${id}`, headers: { cookie: nila } });
    expect(asNila.json().incident.reporter).toBeNull();
    expect(asNila.body).not.toContain("u-rahim");
    const list = await app.inject({ method: "GET", url: "/api/incidents", headers: { cookie: nila } });
    const inList = list.json().incidents.find((i: { id: string }) => i.id === id);
    expect(inList.reporter).toBeNull();
    expect(JSON.stringify(inList)).not.toContain("u-rahim");
    const guest = await app.inject({ method: "GET", url: `/api/incidents/${id}` });
    expect(guest.body).not.toContain("Rahim");

    const admin = await loginAs("u-admin");
    expect((await app.inject({ method: "GET", url: `/api/incidents/${id}`, headers: { cookie: admin } })).json().incident.reporter.id).toBe("u-rahim");
    const self = (await app.inject({ method: "GET", url: `/api/incidents/${id}`, headers: { cookie: rahim } })).json().incident;
    expect(self.reporterIsYou).toBe(true);
  });
});

describe("verification → referral → response loop", () => {
  it("runs the PRD §11 loop and refers exactly once", async () => {
    const rahim = await loginAs("u-rahim");
    const id = (await report(rahim, {})).json().id;

    expect((await confirm(rahim, id)).json().code).toBe("self_vote");
    const nila = await loginAs("u-nila");
    expect((await confirm(nila, id)).statusCode).toBe(200);
    expect((await confirm(nila, id)).json().code).toBe("duplicate_vote");
    await confirm(await loginAs("u-tanvir"), id);

    // Two neighbours cast the 3rd and 4th confirmations back to back.
    const [r3, r4] = await Promise.all([confirm(await loginAs("u-rafiq"), id), confirm(await loginAs("u-habib"), id)]);
    expect(r3.statusCode).toBe(200);
    expect(r4.statusCode).toBe(200);
    const inc = (await app.inject({ method: "GET", url: `/api/incidents/${id}`, headers: { cookie: rahim } })).json().incident;
    expect(inc.verification).toBe("verified");
    expect(inc.status).toBe("referred");
    expect(inc.referral.authorityId).toBe("thana-tejgaon");
    expect(inc.events.filter((e: { toStatus: string }) => e.toStatus === "referred")).toHaveLength(1);

    const staff = await loginAs(staffIdFor("thana-tejgaon"));
    const queue = (await app.inject({ method: "GET", url: "/api/authority/queue", headers: { cookie: staff } })).json().incidents;
    const mine = queue.find((q: { id: string }) => q.id === id);
    expect(mine).toBeDefined();

    const refId = mine.referral.id;
    const act = (action: string, note?: string) =>
      app.inject({ method: "POST", url: `/api/referrals/${refId}/actions`, payload: { action, note }, headers: { cookie: staff } });
    expect((await act("start")).json().code).toBe("invalid_transition");
    expect((await act("acknowledge")).statusCode).toBe(200);
    expect((await act("start")).statusCode).toBe(200);
    expect((await act("resolve")).statusCode).toBe(400); // note required
    expect((await act("resolve", "Patrol increased at the bus stand.")).statusCode).toBe(200);

    const other = await loginAs(staffIdFor("thana-mirpur"));
    expect((await app.inject({ method: "POST", url: `/api/referrals/${refId}/actions`, payload: { action: "acknowledge" }, headers: { cookie: other } })).statusCode).toBe(403);

    const comments = (await app.inject({ method: "GET", url: `/api/incidents/${id}/comments` })).json().comments;
    expect(comments.filter((c: { kind: string }) => c.kind === "official")).toHaveLength(3);

    const notes = (await app.inject({ method: "GET", url: "/api/notifications", headers: { cookie: rahim } })).json().notifications;
    const keys = notes.map((n: { titleKey: string }) => n.titleKey);
    expect(keys).toEqual(expect.arrayContaining(["notifications.status_verified", "notifications.status_referred", "notifications.status_acknowledged", "notifications.status_resolved"]));

    // FR-6.7: 3 "still happening" reopens.
    for (const u of ["u-nila", "u-tanvir", "u-rafiq"]) {
      const r = await app.inject({ method: "POST", url: `/api/incidents/${id}/still-happening`, headers: { cookie: await loginAs(u) } });
      expect(r.statusCode).toBe(200);
    }
    const reopened = (await app.inject({ method: "GET", url: `/api/incidents/${id}` })).json().incident;
    expect(reopened.status).toBe("in_progress");
  });

  it("auto-closes resolved incidents after 72 hours", async () => {
    const before = (await app.inject({ method: "GET", url: "/api/incidents" })).json().incidents.filter((i: { status: string }) => i.status === "resolved").length;
    const ff = await app.inject({ method: "POST", url: "/api/demo/fast-forward", payload: { hours: 80 } });
    expect(ff.json().closed).toBeGreaterThanOrEqual(before);
    clock.setOffsetHours(0);
  });
});

describe("SOS", () => {
  const sosDetails = { childName: "Rafi", childAge: 7, clothing: "Blue school uniform, red bag", lastSeenAt: "2026-10-02T11:30:00.000Z" };
  const photo = () => sharp({ create: { width: 20, height: 20, channels: 3, background: "#ccc" } }).jpeg().toBuffer();

  it("requires a photo and refuses anonymity", async () => {
    const shirin = await loginAs("u-shirin");
    const mirpur = { lat: 23.807, lng: 90.3688 };
    expect((await report(shirin, { categoryId: "cat-missing_child", ...mirpur, sos: sosDetails })).json().details.field).toBe("photos");
    expect((await report(shirin, { categoryId: "cat-missing_child", ...mirpur, sos: sosDetails, isAnonymous: true }, [await photo()])).json().code).toBe("sos_not_anonymous");
  });

  it("alerts the radius, refers immediately, and closes with Found", async () => {
    const shirin = await loginAs("u-shirin");
    const res = await report(shirin, { categoryId: "cat-missing_child", lat: 23.807, lng: 90.3688, description: "My son went missing near the Mirpur 10 roundabout.", sos: sosDetails }, [await photo()]);
    expect(res.statusCode).toBe(201);
    const inc = res.json().incident;
    expect(inc.urgency).toBe("critical");
    expect(inc.status).toBe("referred");
    expect(inc.sos.pendingReview).toBe(true);

    const arif = await loginAs("u-arif"); // lives in Uttara, watches Mirpur 10
    const arifNotes = (await app.inject({ method: "GET", url: "/api/notifications", headers: { cookie: arif } })).json().notifications;
    expect(arifNotes[0]).toMatchObject({ type: "sos", titleKey: "notifications.sos" });
    const jahid = await loginAs("u-jahid"); // lives in Uttara, no Mirpur zone
    const jahidNotes = (await app.inject({ method: "GET", url: "/api/notifications", headers: { cookie: jahid } })).json().notifications;
    expect(jahidNotes.some((n: { type: string }) => n.type === "sos")).toBe(false);

    expect((await app.inject({ method: "POST", url: `/api/sos/${inc.sos.id}/found`, headers: { cookie: arif } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `/api/sos/${inc.sos.id}/found`, headers: { cookie: shirin } })).statusCode).toBe(200);

    const after = (await app.inject({ method: "GET", url: `/api/incidents/${inc.id}`, headers: { cookie: arif } })).json().incident;
    expect(after.sos.state).toBe("found");
    expect(after.media).toHaveLength(0); // photo hidden from the public
    // ...and its old URL no longer serves the file to the public, only to the family.
    const photoUrl: string = inc.media[0].url;
    expect((await app.inject({ method: "GET", url: photoUrl, headers: { cookie: arif } })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: photoUrl })).statusCode).toBe(404);
    const own = await app.inject({ method: "GET", url: photoUrl, headers: { cookie: shirin } });
    expect(own.statusCode).toBe(200);
    expect(own.headers["content-type"]).toContain("image/jpeg");
    const found = (await app.inject({ method: "GET", url: "/api/notifications", headers: { cookie: arif } })).json().notifications;
    expect(found[0].titleKey).toBe("notifications.sos_found");
    expect((await app.inject({ method: "GET", url: "/api/sos/active" })).json().incidents).toHaveLength(0);
  });
});

describe("verification timeline notes", () => {
  it("records a cleared dispute as cleared, not as disputed", async () => {
    const id = (await report(await loginAs("u-rahim"), {})).json().id;
    for (const u of ["u-nila", "u-tanvir", "u-rafiq"]) {
      await app.inject({ method: "POST", url: `/api/incidents/${id}/votes`, payload: { vote: "dispute" }, headers: { cookie: await loginAs(u) } });
    }
    for (const u of ["u-habib", "u-kamal", "u-mitu"]) await confirm(await loginAs(u), id);
    const inc = (await app.inject({ method: "GET", url: `/api/incidents/${id}` })).json().incident;
    const trust = inc.events.filter((e: { kind: string }) => e.kind === "verification");
    expect(trust.map((e: { toStatus: string; noteKey: string }) => [e.toStatus, e.noteKey])).toEqual([
      ["disputed", "disputedBy"],
      ["unverified", "disputeCleared"],
    ]);
  });
});

describe("admin", () => {
  it("lists disputed incidents and can remove one with a reason", async () => {
    const admin = await loginAs("u-admin");
    const items = (await app.inject({ method: "GET", url: "/api/admin/queue", headers: { cookie: admin } })).json().items;
    const disputed = items.find((i: { reason: string }) => i.reason === "disputed");
    expect(disputed).toBeDefined();
    const noReason = await app.inject({ method: "POST", url: `/api/admin/incidents/${disputed.incident.id}/actions`, payload: { action: "remove" }, headers: { cookie: admin } });
    expect(noReason.statusCode).toBe(400);
    const ok = await app.inject({ method: "POST", url: `/api/admin/incidents/${disputed.incident.id}/actions`, payload: { action: "remove", note: "False report." }, headers: { cookie: admin } });
    expect(ok.statusCode).toBe(200);
    const guest = await app.inject({ method: "GET", url: `/api/incidents/${disputed.incident.id}` });
    expect(guest.statusCode).toBe(404);
    // The thread goes with it.
    expect((await app.inject({ method: "GET", url: `/api/incidents/${disputed.incident.id}/comments` })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/incidents/${disputed.incident.id}/comments`, headers: { cookie: admin } })).statusCode).toBe(200);
  });
});
