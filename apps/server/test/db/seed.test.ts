import { describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { openDb } from "../../src/db/client.js";
import { seed } from "../../src/db/seed.js";
import * as s from "../../src/db/schema.js";

const NOW = Date.parse("2026-10-02T12:00:00Z");

describe("seed", () => {
  it("is deterministic and produces a lived-in Dhaka", () => {
    const a = openDb(":memory:");
    const b = openDb(":memory:");
    const sa = seed(a.db, NOW);
    const sb = seed(b.db, NOW);
    expect(sa).toEqual(sb);
    expect(sa.incidents).toBe(78);

    const rowsA = a.db.select().from(s.incidents).all();
    const rowsB = b.db.select().from(s.incidents).all();
    expect(rowsA).toEqual(rowsB);

    const [areas] = a.db.select({ n: count() }).from(s.areas).all();
    expect(areas.n).toBe(12);
    const verified = rowsA.filter((r) => r.verification === "verified").length;
    expect(verified).toBeGreaterThan(40);
    expect(rowsA.filter((r) => r.verification === "disputed").length).toBeGreaterThan(0);
    expect(rowsA.some((r) => r.status === "resolved" || r.status === "closed")).toBe(true);
  });

  it("keeps vote rows consistent with the denormalised counts", () => {
    const { db } = openDb(":memory:");
    seed(db, NOW);
    for (const inc of db.select().from(s.incidents).all()) {
      const votes = db.select().from(s.verifications).where(eq(s.verifications.incidentId, inc.id)).all();
      expect(votes.filter((v) => v.vote === "confirm").length).toBe(inc.confirmCount);
      expect(votes.filter((v) => v.vote === "dispute").length).toBe(inc.disputeCount);
      expect(votes.some((v) => v.userId === inc.reporterId)).toBe(false);
    }
  });

  it("can reseed over existing data (demo reset)", () => {
    const { db } = openDb(":memory:");
    seed(db, NOW);
    expect(() => seed(db, NOW + 3_600_000)).not.toThrow();
    const [inc] = db.select({ n: count() }).from(s.incidents).all();
    expect(inc.n).toBe(78);
  });
});
