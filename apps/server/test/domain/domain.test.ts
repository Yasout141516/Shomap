import { describe, expect, it } from "vitest";
import { haversineM, inBounds, nearestArea, circlesOverlap, canTransition, type Actor } from "@shomap/shared";
import { evaluateVerification } from "../../src/domain/verification.js";
import { routeReferral } from "../../src/domain/referral.js";
import { sosRecipients } from "../../src/domain/sos.js";
import { zonesMatching } from "../../src/domain/watchZones.js";
import { withinRateLimit } from "../../src/domain/rateLimit.js";
import type { Status } from "@shomap/shared";

const cfg = { confirmThreshold: 3, disputeThreshold: 3, reopenThreshold: 3 };
const BOUNDS: [number, number, number, number] = [90.3, 23.68, 90.5, 23.9];
const farmgate = { lat: 23.7575, lng: 90.3897 };
const mohakhali = { lat: 23.778, lng: 90.405 };

describe("geo", () => {
  it("measures Farmgate to Mohakhali at roughly 2.7 km", () => {
    const d = haversineM(farmgate, mohakhali);
    expect(d).toBeGreaterThan(2500);
    expect(d).toBeLessThan(2900);
  });
  it("treats the bounding-box edge as inside", () => {
    expect(inBounds({ lat: 23.68, lng: 90.3 }, BOUNDS)).toBe(true);
    expect(inBounds({ lat: 23.9, lng: 90.5 }, BOUNDS)).toBe(true);
    expect(inBounds({ lat: 23.679, lng: 90.4 }, BOUNDS)).toBe(false);
    expect(inBounds({ lat: 23.8, lng: 90.51 }, BOUNDS)).toBe(false);
  });
  it("finds the nearest area", () => {
    const areas = [
      { id: "farmgate", ...farmgate },
      { id: "mohakhali", ...mohakhali },
    ];
    expect(nearestArea({ lat: 23.776, lng: 90.404 }, areas).id).toBe("mohakhali");
  });
  it("counts circles touching at the boundary as overlapping only when strictly closer", () => {
    const d = haversineM(farmgate, mohakhali);
    expect(circlesOverlap(farmgate, d / 2 + 1, mohakhali, d / 2)).toBe(true);
    expect(circlesOverlap(farmgate, d / 2 - 1, mohakhali, d / 2)).toBe(false);
  });
});

describe("evaluateVerification", () => {
  const cases: [number, number, "unverified" | "verified" | "disputed"][] = [
    [2, 0, "unverified"],
    [3, 0, "verified"],
    [3, 1, "verified"],
    [3, 2, "unverified"],
    [4, 2, "verified"],
    [3, 3, "unverified"],
    [0, 3, "disputed"],
    [2, 3, "disputed"],
    [0, 2, "unverified"],
  ];
  it.each(cases)("%i confirms / %i disputes → %s", (confirms, disputes, expected) => {
    expect(evaluateVerification({ confirms, disputes, current: "unverified" }, cfg)).toBe(expected);
  });
  it("keeps a verified incident verified unless the dispute rule fires", () => {
    expect(evaluateVerification({ confirms: 3, disputes: 2, current: "verified" }, cfg)).toBe("verified");
    expect(evaluateVerification({ confirms: 3, disputes: 4, current: "verified" }, cfg)).toBe("disputed");
  });
});

describe("canTransition", () => {
  const legal: [Status, Status, Actor][] = [
    ["open", "referred", "system"],
    ["open", "referred", "admin"],
    ["open", "removed", "admin"],
    ["open", "removed", "system"],
    ["referred", "acknowledged", "authority"],
    ["referred", "open", "authority"],
    ["acknowledged", "in_progress", "authority"],
    ["acknowledged", "resolved", "authority"],
    ["in_progress", "resolved", "authority"],
    ["resolved", "closed", "system"],
    ["resolved", "in_progress", "community"],
    ["referred", "removed", "admin"],
    ["in_progress", "removed", "admin"],
    ["closed", "removed", "admin"],
  ];
  it.each(legal)("%s → %s by %s is allowed", (from, to, actor) => {
    expect(canTransition(from, to, actor)).toBe(true);
  });
  const illegal: [Status, Status, Actor][] = [
    ["open", "acknowledged", "authority"],
    ["open", "resolved", "authority"],
    ["referred", "acknowledged", "citizen"],
    ["referred", "resolved", "authority"],
    ["resolved", "in_progress", "authority"],
    ["closed", "in_progress", "community"],
    ["removed", "open", "admin"],
    ["resolved", "closed", "citizen"],
    ["open", "referred", "citizen"],
  ];
  it.each(illegal)("%s → %s by %s is rejected", (from, to, actor) => {
    expect(canTransition(from, to, actor)).toBe(false);
  });
});

describe("routeReferral", () => {
  const authorities = [
    { id: "thana-tejgaon", type: "police" as const },
    { id: "dmp-traffic", type: "traffic" as const },
    { id: "dncc", type: "city_corp" as const },
  ];
  const jurisdictions = [
    { authorityId: "thana-tejgaon", areaId: "farmgate" },
    { authorityId: "dmp-traffic", areaId: "farmgate" },
    { authorityId: "dmp-traffic", areaId: "motijheel" },
    { authorityId: "dncc", areaId: "farmgate" },
  ];
  it("routes by authority type and area jurisdiction", () => {
    expect(routeReferral("police", "farmgate", jurisdictions, authorities)).toBe("thana-tejgaon");
    expect(routeReferral("traffic", "motijheel", jurisdictions, authorities)).toBe("dmp-traffic");
  });
  it("returns null when no authority covers the area", () => {
    expect(routeReferral("police", "motijheel", jurisdictions, authorities)).toBeNull();
  });
  it("returns null for community-only categories", () => {
    expect(routeReferral(null, "farmgate", jurisdictions, authorities)).toBeNull();
  });
});

describe("sosRecipients", () => {
  const alert = { ...farmgate, radiusM: 3000 };
  it("includes users whose home is inside the radius or whose zone overlaps, without duplicates or the reporter", () => {
    const users = [
      { id: "reporter", home: farmgate },
      { id: "near-home", home: mohakhali }, // ~2.7 km
      { id: "far", home: { lat: 23.87, lng: 90.4 } }, // Uttara, ~12 km
      { id: "far-with-zone", home: { lat: 23.87, lng: 90.4 } },
      { id: "no-home", home: null },
    ];
    const zones = [
      { userId: "far-with-zone", lat: 23.785, lng: 90.39, radiusM: 1000 }, // ~3.1 km away, overlaps
      { userId: "near-home", lat: 23.76, lng: 90.39, radiusM: 500 },
    ];
    expect(sosRecipients(alert, users, zones, "reporter").sort()).toEqual(["far-with-zone", "near-home"]);
  });
});

describe("zonesMatching", () => {
  const zones = [
    { id: "z1", userId: "u1", lat: farmgate.lat, lng: farmgate.lng, radiusM: 1000, minUrgency: "high" as const },
    { id: "z2", userId: "u2", lat: farmgate.lat, lng: farmgate.lng, radiusM: 1000, minUrgency: "low" as const },
    { id: "z3", userId: "u3", lat: mohakhali.lat, lng: mohakhali.lng, radiusM: 500, minUrgency: "low" as const },
  ];
  it("matches zones containing the point at or above their minimum urgency", () => {
    expect(zonesMatching(farmgate, "medium", zones).map((z) => z.id)).toEqual(["z2"]);
    expect(zonesMatching(farmgate, "high", zones).map((z) => z.id)).toEqual(["z1", "z2"]);
  });
});

describe("withinRateLimit", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  const hour = 3600_000;
  it("allows the 5th report in an hour and blocks the 6th", () => {
    const four = [1, 2, 3, 4].map((m) => now - m * 60_000);
    expect(withinRateLimit(four, now, 5, hour)).toBe(true);
    expect(withinRateLimit([...four, now - 30_000], now, 5, hour)).toBe(false);
  });
  it("ignores reports older than the window", () => {
    const old = [1, 2, 3, 4, 5].map((m) => now - hour - m * 60_000);
    expect(withinRateLimit(old, now, 5, hour)).toBe(true);
  });
});
