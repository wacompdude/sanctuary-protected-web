import { expect, test, type Page } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

async function expectPolicyChrome(page: Page, heading: string | RegExp) {
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(page.getByText(/Effective:/)).toBeVisible();
  await expect(page.getByText(/Last updated:/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Legal documents" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign out" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
}

test.describe("public legal pages", () => {
  test("/terms loads without authentication", async ({ page }) => {
    const response = await page.goto("/terms");
    expect(response?.ok()).toBeTruthy();
    expect(page.url()).toMatch(/\/terms$/);
    await expectPolicyChrome(page, "Terms of Service");
    await expect(page.getByRole("heading", { name: /Not an Emergency Dispatch Service/ })).toBeVisible();
    await expect(page.getByText(/not 911/i)).toBeVisible();

    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
  });

  test("privacy SMS section is public and names opt-out", async ({ page }) => {
    const response = await page.goto("/privacy");
    expect(response?.ok()).toBeTruthy();
    expect(page.url()).toMatch(/\/privacy$/);
    await expectPolicyChrome(page, "Privacy Policy");
    await expect(page.getByRole("heading", { name: /Trusted Devices/ })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /SMS Messaging and Mobile Numbers/ }),
    ).toBeVisible();
    await expect(page.getByText(/Reply STOP/)).toBeVisible();
    await expect(
      page.getByText(/not sell, rent, or share SMS opt-in/i).first(),
    ).toBeVisible();

    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    });
    await expect(
      page.getByRole("heading", { name: /SMS Messaging and Mobile Numbers/ }),
    ).toBeVisible();
  });

  test("terms SMS section discloses STOP, HELP, and rates", async ({ page }) => {
    const response = await page.goto("/terms");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: /SMS and Electronic Communications/ })).toBeVisible();
    await expect(page.getByText(/Reply STOP/)).toBeVisible();
    await expect(page.getByText(/Reply HELP/)).toBeVisible();
    await expect(page.getByText(/Message and data rates may apply/i)).toBeVisible();
    await expect(page.getByText(/not a condition of purchasing/i)).toBeVisible();
  });

  test("/billing loads without authentication", async ({ page }) => {
    const response = await page.goto("/billing");
    expect(response?.ok()).toBeTruthy();
    expect(page.url()).toMatch(/\/billing$/);
    await expectPolicyChrome(page, /Billing, Subscription, Cancellation/);
    await expect(page.getByText("[BUSINESS/LEGAL DECISION REQUIRED — REFUND POLICY]")).toBeVisible();
  });

  test("legal navigation moves between public policies", async ({ page }) => {
    await page.goto("/terms");
    await page.getByRole("navigation", { name: "Legal documents" }).first().getByRole("link", { name: "Privacy Policy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await page.getByRole("navigation", { name: "Legal documents" }).first().getByRole("link", { name: "Billing" }).click();
    await expect(page).toHaveURL(/\/billing$/);
  });

  test("table of contents anchors scroll to a section", async ({ page }) => {
    await page.goto("/terms");
    const mobileToc = page.locator("details").filter({ hasText: "Contents" });
    if (await mobileToc.isVisible()) {
      await mobileToc.locator("summary").click();
      await mobileToc.getByRole("link", { name: /Not an Emergency Dispatch Service/ }).click();
    } else {
      await page
        .getByRole("navigation", { name: "Table of contents" })
        .getByRole("link", { name: /Not an Emergency Dispatch Service/ })
        .click();
    }
    await expect(page).toHaveURL(/#not-dispatch/);
    await expect(page.locator("#not-dispatch")).toBeVisible();
  });

  test("landing footer links reach the policies", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("contentinfo").getByRole("link", { name: "Terms" }).click();
    await expect(page).toHaveURL(/\/terms$/);
  });

  test("public homepage does not mention Platform", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Platform" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /\/platform/i })).toHaveCount(0);
    await expect(page.locator("a[href='/platform']")).toHaveCount(0);
    await expect(page.locator("a[href='#platform']")).toHaveCount(0);
    await expect(page.locator("#platform")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  });

  test("login page links open policies without signing in", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await page.getByRole("link", { name: "Terms of Service" }).first().click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
  });

  test("registration references Terms and Privacy", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByText(/By creating an account/)).toBeVisible();
    const terms = page.getByRole("link", { name: "Terms of Service" }).first();
    await expect(terms).toHaveAttribute("href", "/terms");
    await expect(page.getByRole("link", { name: "Privacy Policy" }).first()).toHaveAttribute("href", "/privacy");
  });

  test("mobile layout exposes a contents control", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/privacy");
    await expect(page.locator("summary").filter({ hasText: "Contents" })).toBeVisible();
    await expect(page.locator("html")).toHaveCSS("overflow-x", /visible|auto|hidden/);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });

  test("print media hides chrome and keeps policy text", async ({ page }) => {
    await page.goto("/terms");
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("header")).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
    await expect(page.locator("#not-dispatch")).toBeVisible();
  });
});
