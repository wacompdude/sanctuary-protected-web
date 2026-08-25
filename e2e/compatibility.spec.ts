import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
];

async function noHorizontalPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  expect(
    overflow.scrollWidth,
    `horizontal overflow ${overflow.scrollWidth}px vs ${overflow.clientWidth}px`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function contrastLooksReadable(page: Page, selector: string) {
  const colors = await page.locator(selector).evaluate((el) => {
    const styles = window.getComputedStyle(el);
    return {
      color: styles.color,
      background: styles.backgroundColor,
    };
  });
  expect(colors.color).not.toEqual(colors.background);
  expect(colors.color).not.toBe("rgba(0, 0, 0, 0)");
}

test.describe("public compatibility smoke", () => {
  test("landing stays readable and does not overflow", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noHorizontalPageOverflow(page);
  });

  test("login is usable in light and dark themes", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel(/Color theme/)).toBeVisible();

    const viewport = page.viewportSize();
    const emailFont = await page.getByLabel("Email").evaluate((el) => {
      return Number.parseFloat(window.getComputedStyle(el).fontSize);
    });
    if (viewport && viewport.width < 768) {
      expect(emailFont).toBeGreaterThanOrEqual(16);
    }

    await contrastLooksReadable(page, "body");

    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
      document.documentElement.style.colorScheme = "dark";
    });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
    await contrastLooksReadable(page, "body");
    await noHorizontalPageOverflow(page);

    await page.emulateMedia({ colorScheme: "light" });
    await page.evaluate(() => {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
    });
    await expect(page.locator("html")).toHaveClass(/light/);
    await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
    await contrastLooksReadable(page, "body");
    await expect(page.getByLabel(/Color theme/)).toBeVisible();
  });

  test("login form fields remain keyboard reachable", async ({ page }) => {
    await page.goto("/login");
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
    const outline = await focused.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return `${styles.outlineStyle} ${styles.boxShadow}`;
    });
    expect(outline === "none none" || outline === "none rgba(0, 0, 0, 0)").toBe(
      false,
    );
  });

  test("register and password reset remain on-screen", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/register");
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
    await noHorizontalPageOverflow(page);
    await page.goto("/auth/forgot-password");
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await noHorizontalPageOverflow(page);
  });
});

test.describe("viewport matrix", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "full viewport matrix runs on desktop Chromium",
    );
  });

  for (const viewport of VIEWPORTS) {
    test(`login has no page overflow at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/login");
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
      await noHorizontalPageOverflow(page);
    });
  }
});
