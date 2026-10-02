import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const CHILD_PHOTO = path.resolve("assets/demo/sample-child.jpg");
const REALTIME_MS = 5_000; // PRD NFR-2 / S4

async function as(ctx: BrowserContext, userId: string) {
  const res = await ctx.request.post("/api/demo/switch-role", { data: { userId } });
  expect(res.ok()).toBeTruthy();
}

async function openFresh(ctx: BrowserContext, url = "/"): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(url);
  return page;
}

test("PRD §11: report → verify → refer → respond, then SOS → sighting → found", async ({ browser }) => {
  const a = await browser.newContext(); // presenter phone
  const b = await browser.newContext(); // laptop
  const guest = await browser.newContext();
  expect((await a.request.post("/api/demo/reset")).ok()).toBeTruthy();

  // --- Rahim reports a snatching at Farmgate, anonymously.
  await as(a, "u-rahim");
  await as(b, "u-nila");
  const pa = await openFresh(a);
  const pb = await openFresh(b);
  await expect(pa.locator(".pin").first()).toBeVisible();

  await pa.getByRole("button", { name: "Report", exact: true }).click();
  await pa.getByRole("button", { name: "Mugging / snatching" }).click();
  await pa.getByRole("button", { name: "Next" }).click();
  await pa.locator("#report-description").fill("Two men on a bike snatched a phone at the bus stand.");
  await pa.locator("#report-landmark").fill("Farmgate bus stand");
  // Review Focus 5: switching language mid-flow keeps what was typed.
  await pa.getByRole("dialog").getByRole("button", { name: "বাং" }).click();
  await expect(pa.locator("#report-description")).toHaveValue("Two men on a bike snatched a phone at the bus stand.");
  await pa.getByRole("dialog").getByRole("button", { name: "EN" }).click();
  await expect(pa.locator("#report-anonymous")).not.toBeChecked();
  await pa.locator("#report-anonymous").check();
  await pa.getByRole("button", { name: "Send report" }).click();
  await expect(pa.getByText("Thank you. You started something.")).toBeVisible();
  await pa.getByRole("button", { name: "View your report" }).click();
  await expect(pa).toHaveURL(/\/incident\//);
  const incidentId = pa.url().split("/incident/")[1];

  // --- It appears live on the laptop (no reload).
  await expect(pb.locator(`a[href="/incident/${incidentId}"]`)).toBeVisible({ timeout: REALTIME_MS });

  // --- Nila confirms, plus two simulated neighbours → verified and referred.
  await pb.locator(`a[href="/incident/${incidentId}"]`).click();
  await pb.getByRole("button", { name: "Yes, I've seen it" }).click();
  await expect(pb.getByText("You confirmed this")).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await pb.getByRole("button", { name: "Demo: add a neighbour's confirmation" }).click();
    await expect(pb.getByText(/confirmed it$/).last()).toBeVisible();
  }
  await expect(pb.locator(".incident-panel").getByText("Verified by 3 neighbours")).toBeVisible({ timeout: REALTIME_MS });
  await expect(pb.locator(".incident-panel").getByText("Assigned to Tejgaon Thana")).toBeVisible();

  // --- Public sees "Anonymous"; the reporter sees it's theirs.
  const pg = await openFresh(guest, `/incident/${incidentId}`);
  await expect(pg.locator(".facts")).toContainText("Anonymous");
  await expect(pg.locator(".incident-panel")).not.toContainText("Rahim");
  await expect(pa.locator(".facts")).toContainText("You · hidden from public", { timeout: REALTIME_MS });

  // --- Tejgaon Thana acknowledges and starts work; Rahim sees it live.
  await as(b, "u-staff-thana-tejgaon");
  await pb.goto("/authority");
  const row = pb.locator("tr", { has: pb.locator(`a[href="/incident/${incidentId}"]`) });
  await expect(row).toContainText("Rahim Uddin"); // assigned authority can see who reported
  await row.getByRole("button", { name: "Acknowledge" }).click();
  await expect(row.getByRole("button", { name: "Start work" })).toBeVisible();
  await expect(pa.locator(".toasts")).toContainText("Tejgaon Thana is on it", { timeout: REALTIME_MS });
  await row.getByRole("button", { name: "Start work" }).click();
  await expect(pa.locator(".timeline")).toContainText("In progress", { timeout: REALTIME_MS });
  await expect(pa.locator(".kind-official").first()).toContainText("Received");

  // --- Admin sees the real reporter.
  await as(b, "u-admin");
  await pb.goto(`/incident/${incidentId}`);
  await expect(pb.locator(".facts")).toContainText("Rahim Uddin");
  await expect(pb.locator(".facts")).toContainText("Anonymous to public");

  // --- SOS: Shirin reports a missing child in Mirpur 10; Arif (watching Mirpur 10) gets the banner.
  await as(a, "u-shirin");
  await as(b, "u-arif");
  await pa.goto("/");
  await pb.goto("/");
  await expect(pb.locator(".sos-banner")).toHaveCount(0);
  await pa.getByRole("button", { name: "Report", exact: true }).click();
  await pa.getByRole("button", { name: "Missing child" }).click();
  await pa.locator("#jump-area").selectOption("mirpur");
  await pa.getByRole("button", { name: "Next" }).click();
  await pa.locator("#child-name").fill("Rafi");
  await pa.locator("#child-age").fill("7");
  await pa.locator("#child-clothing").fill("Blue school uniform, red backpack");
  await pa.locator("#report-description").fill("My son went missing near the Mirpur 10 roundabout after school.");
  await pa.locator("#report-photos").setInputFiles(CHILD_PHOTO);
  await expect(pa.locator("#report-anonymous")).toHaveCount(0); // SOS can't be anonymous
  const sent = Date.now();
  await pa.getByRole("button", { name: "Send SOS alert" }).click();
  await expect(pb.locator(".sos-banner")).toContainText("Rafi", { timeout: REALTIME_MS });
  expect(Date.now() - sent).toBeLessThan(REALTIME_MS + 1000);

  // --- Arif reports a sighting; Shirin marks the child found; everyone sees "Found safe".
  await pb.locator(".sos-banner").getByRole("button", { name: "I saw this child" }).click();
  await pb.locator("#comment-body").fill("Saw a boy in a blue uniform near Shah Ali market, walking towards the stadium.");
  await pb.getByRole("button", { name: "Send", exact: true }).click();
  await expect(pb.locator(".kind-sighting")).toBeVisible();
  await expect(pa.locator(".toasts")).toContainText("New sighting reported for Rafi", { timeout: REALTIME_MS });

  await pa.getByRole("button", { name: "View your report" }).click();
  await pa.getByRole("button", { name: "My child has been found" }).click();
  await expect(pb.locator(".sos-banner-found")).toContainText("Found safe", { timeout: REALTIME_MS });

  // --- Dashboard opens with numbers.
  await pb.goto("/dashboard");
  await expect(pb.locator(".stat-n").first()).toBeVisible();

  await Promise.all([a.close(), b.close(), guest.close()]);
});

test("blocked categories redirect to the hotline and create nothing", async ({ browser }) => {
  const ctx = await browser.newContext();
  await as(ctx, "u-rahim");
  const page = await openFresh(ctx);
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await page.getByRole("button", { name: /violent crime/ }).click();
  await expect(page.getByText("Please call 999 now")).toBeVisible();
  await expect(page.locator(".hotline-number")).toHaveText("999");
  await ctx.close();
});

test("reconnecting shows a pill and catches up on missed events (Review Focus 3)", async ({ browser }) => {
  const watcher = await browser.newContext();
  const reporter = await browser.newContext();
  await as(watcher, "u-nila");
  await as(reporter, "u-rafiq");
  const page = await openFresh(watcher);
  await expect(page.locator(".pin").first()).toBeVisible();
  type W = { __shomapSocket: { disconnect(): void; connect(): void } };
  await page.evaluate(() => (window as unknown as W).__shomapSocket.disconnect());
  await expect(page.getByText("Reconnecting…")).toBeVisible();
  const res = await reporter.request.post("/api/incidents", {
    multipart: {
      data: JSON.stringify({ categoryId: "cat-garbage", lat: 23.7578, lng: 90.3899, description: "Garbage piled outside the school gate again.", isAnonymous: false, idempotencyKey: `e2e-${Date.now()}` }),
    },
  });
  expect(res.ok()).toBeTruthy();
  const { id } = await res.json();
  await expect(page.locator(`a[href="/incident/${id}"]`)).toHaveCount(0); // missed while disconnected
  await page.evaluate(() => (window as unknown as W).__shomapSocket.connect());
  await expect(page.getByText("Reconnecting…")).toHaveCount(0);
  await expect(page.locator(`a[href="/incident/${id}"]`)).toBeVisible({ timeout: 10_000 });
  await Promise.all([watcher.close(), reporter.close()]);
});
