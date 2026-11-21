import { expect, test } from "@playwright/test";

test.describe("throwaway-event E2E user journeys", () => {
  test("showcases the pre-seeded demo weekend and host ZIP export", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /One secret link for the whole weekend/i }),
    ).toBeVisible();
    await expect(page.getByText("Big Sur Redwood Weekend")).toBeVisible();

    await page.getByRole("link", { name: /Open Demo Room/i }).click();
    await expect(page).toHaveURL(/\/e\/big-sur-weekend$/);

    await expect(page.getByTestId("countdown-timer")).toBeVisible();
    await expect(page.getByText(/No Social Posting · Offline Pact Active/i)).toBeVisible();

    // Enter as Demo Host (Maya)
    await page.getByRole("button", { name: /Enter as Maya \(Host\)/i }).click();
    await expect(page.getByText(/Signed in as Maya/i)).toBeVisible();

    // Check all 4 micro-modules
    await expect(page.getByText("Cabin Check-In & Cedar Deck Aperitivo")).toBeVisible();

    await page.getByRole("button", { name: /Quick Polls/i }).click();
    await expect(page.getByText("Saturday night dinner plan?")).toBeVisible();

    await page.getByRole("button", { name: /Split-the-Tab/i }).click();
    await expect(page.getByTestId("settlement-transfer").first()).toBeVisible();

    await page.getByRole("button", { name: /Photo Wall/i }).click();
    await expect(page.getByText(/Cameras Down \/ Private Room Photo Wall/i)).toBeVisible();
    const archiveLink = page.getByRole("link", { name: /Download All \(\.zip\)/i });
    await expect(archiveLink).toBeVisible();

    const href = await archiveLink.getAttribute("href");
    const zipResponse = await page.request.get(href!);
    expect(zipResponse.status()).toBe(200);
    expect(zipResponse.headers()["content-type"]).toContain("application/zip");
  });

  test("spins up a PIN-protected room, blocks wrong PINs, and settles expenses across two users", async ({
    page,
    browser,
  }) => {
    await page.goto("/");

    await page.getByLabel(/Event Title/i).fill("Alpine Lake Offsite");
    await page.getByLabel(/Your First Name \(Host\)/i).fill("Taylor");
    await page.getByLabel(/Location/i).fill("Bend, OR");
    await page.getByLabel(/Optional Room PIN/i).fill("7788");

    await page.getByRole("button", { name: /Create Secret Event Link/i }).click();
    await expect(page).toHaveURL(/\/e\/alpine-lake-offsite-[a-z2-9]+\?created=1$/);

    const roomUrl = new URL(page.url()).pathname;
    await expect(page.getByText(/Save your Host Passkey/i)).toBeVisible();
    await expect(page.getByText(/Signed in as Taylor/i)).toBeVisible();

    // Host adds an itinerary activity
    await page.getByRole("button", { name: /Add Activity/i }).click();
    await page.getByLabel(/Activity Title/i).fill("Kayak Launch");
    await page.getByLabel(/Time Label/i).fill("10:00 AM");
    await page.getByRole("button", { name: /Save to Timeline/i }).click();
    await expect(page.getByText("Kayak Launch")).toBeVisible();

    // Second browser context (guest without cookie) hits PIN gate
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(roomUrl);

    await expect(
      guestPage.getByRole("heading", { name: "Alpine Lake Offsite", exact: true }),
    ).toBeVisible();
    await expect(guestPage.getByText("Kayak Launch")).toHaveCount(0);

    // Wrong PIN fails cleanly
    await guestPage.getByLabel(/First Name/i).fill("Robin");
    await guestPage.getByLabel(/Room PIN/i).fill("1111");
    await guestPage.getByRole("button", { name: /Enter Room/i }).click();
    await expect(guestPage.getByText(/Incorrect room PIN/i)).toBeVisible();

    // Correct PIN unlocks room
    await guestPage.getByLabel(/Room PIN/i).fill("7788");
    await guestPage.getByRole("button", { name: /Enter Room/i }).click();
    await expect(guestPage.getByText(/Signed in as Robin/i)).toBeVisible();
    await expect(guestPage.getByText("Kayak Launch")).toBeVisible();

    // Guest logs a $50 shared expense and verifies settlement summary
    await guestPage.getByRole("button", { name: /Split-the-Tab/i }).click();
    await guestPage.getByRole("button", { name: /Log Shared Expense/i }).click();
    await guestPage.getByLabel(/What was it for/i).fill("Paddleboard rental");
    await guestPage.getByLabel(/Amount \(USD\)/i).fill("50");
    await guestPage.getByRole("button", { name: /Save Expense/i }).click();

    await expect(guestPage.getByTestId("settlement-transfer").first()).toContainText("Taylor");
    await expect(guestPage.getByTestId("settlement-transfer").first()).toContainText("Robin");
    await expect(guestPage.getByTestId("settlement-transfer").first()).toContainText("$25");

    await guestContext.close();
  });
});
