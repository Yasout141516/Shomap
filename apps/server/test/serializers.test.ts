import { describe, expect, it } from "vitest";
import { serializeIncident, type IncidentBundle, type Viewer } from "../src/serializers/incident.js";
import { serializeComment } from "../src/serializers/comment.js";
import type { CommentRow, IncidentRow, ReferralRow } from "../src/db/schema.js";

const T = "2026-10-02T10:00:00.000Z";
const row: IncidentRow = {
  id: "inc-x",
  reporterId: "u-secret-reporter",
  categoryId: "cat-extortion",
  areaId: "jatrabari",
  description: "Men collecting money from tea stalls every week.",
  urgency: "high",
  status: "referred",
  verification: "verified",
  isAnonymous: true,
  lat: 23.71,
  lng: 90.43,
  addressText: null,
  confirmCount: 3,
  disputeCount: 0,
  stillCount: 0,
  redirected: false,
  redirectNote: null,
  idempotencyKey: null,
  occurredAt: T,
  createdAt: T,
  updatedAt: T,
  resolvedAt: null,
};
const referral: ReferralRow = {
  id: "r1",
  incidentId: "inc-x",
  authorityId: "thana-jatrabari",
  source: "auto",
  referredAt: T,
  acknowledgedAt: null,
  resolvedAt: null,
  resolutionNote: null,
};
const bundle = (over: Partial<IncidentBundle> = {}): IncidentBundle => ({
  row,
  reporter: { id: "u-secret-reporter", displayName: "Secret Person" },
  media: [
    { id: "m1", url: "/uploads/a.jpg", publicHidden: false },
    { id: "m2", url: "/uploads/b.jpg", publicHidden: true },
  ],
  referral,
  sos: null,
  commentCount: 0,
  myVote: null,
  myStill: false,
  alertedYou: false,
  ...over,
});

const citizen: Viewer = { id: "u-other", role: "citizen", authorityId: null };
const reporterSelf: Viewer = { id: "u-secret-reporter", role: "citizen", authorityId: null };
const admin: Viewer = { id: "u-admin", role: "admin", authorityId: null };
const assigned: Viewer = { id: "u-staff", role: "authority", authorityId: "thana-jatrabari" };
const otherAuthority: Viewer = { id: "u-staff2", role: "authority", authorityId: "thana-mirpur" };

describe("serializeIncident anonymity (PRD FR-9)", () => {
  it.each([
    ["another citizen", citizen],
    ["a guest", null],
    ["an unassigned authority", otherAuthority],
  ])("hides the reporter from %s, including the id anywhere in the payload", (_label, viewer) => {
    const dto = serializeIncident(bundle(), viewer);
    expect(dto.reporter).toBeNull();
    expect(dto.reporterIsYou).toBe(false);
    expect(JSON.stringify(dto)).not.toContain("u-secret-reporter");
    expect(JSON.stringify(dto)).not.toContain("Secret Person");
  });

  it.each([
    ["the reporter themselves", reporterSelf],
    ["an admin", admin],
    ["the assigned authority", assigned],
  ])("shows the reporter to %s", (_label, viewer) => {
    const dto = serializeIncident(bundle(), viewer);
    expect(dto.reporter).toEqual({ id: "u-secret-reporter", displayName: "Secret Person" });
  });

  it("marks the reporter's own anonymous report as theirs", () => {
    expect(serializeIncident(bundle(), reporterSelf).reporterIsYou).toBe(true);
  });

  it("shows the reporter of a non-anonymous incident to everyone", () => {
    const dto = serializeIncident(bundle({ row: { ...row, isAnonymous: false } }), null);
    expect(dto.reporter?.displayName).toBe("Secret Person");
  });

  it("drops publicly hidden media for the public but keeps it for privileged viewers", () => {
    expect(serializeIncident(bundle(), citizen).media.map((m) => m.id)).toEqual(["m1"]);
    expect(serializeIncident(bundle(), admin).media.map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});

describe("serializeComment anonymity", () => {
  const c: CommentRow = {
    id: "c1",
    incidentId: "inc-x",
    authorId: "u-commenter",
    parentId: null,
    kind: "comment",
    body: "I saw it too",
    isAnonymous: true,
    isHidden: false,
    lat: null,
    lng: null,
    createdAt: T,
  };
  const author = { id: "u-commenter", displayName: "Commenter", role: "citizen" as const, authorityId: null };

  it("hides an anonymous commenter from other citizens", () => {
    const dto = serializeComment(c, author, citizen, referral);
    expect(dto.author).toBeNull();
    expect(JSON.stringify(dto)).not.toContain("u-commenter");
  });
  it("shows an anonymous commenter to admins and the assigned authority", () => {
    expect(serializeComment(c, author, admin, referral).author?.id).toBe("u-commenter");
    expect(serializeComment(c, author, assigned, referral).author?.id).toBe("u-commenter");
  });
  it("tells authors their own anonymous comment is theirs", () => {
    const dto = serializeComment(c, author, { id: "u-commenter", role: "citizen", authorityId: null }, referral);
    expect(dto.authorIsYou).toBe(true);
  });
});
