import { expect, test, type Page } from "@playwright/test";

async function isSignedIn(page: Page): Promise<boolean> {
  await page.goto("/dashboard");
  await page.waitForLoadState("domcontentloaded");
  return !page.url().includes("/login");
}

test.describe("app sidebar shell", () => {
  test("desktop sidebar footer stays in the viewport on a long page", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name.startsWith("mobile"), "desktop layout");
    const signedIn = await isSignedIn(page);
    test.skip(!signedIn, "requires an authenticated session");

    const sidebar = page.getByTestId("app-sidebar");
    const footer = page.getByTestId("app-sidebar-footer");
    const main = page.getByTestId("app-main");
    const signOut = page.getByRole("button", { name: "Sign out" });

    await expect(sidebar).toBeVisible();
    await expect(footer).toBeVisible();
    await expect(signOut).toBeVisible();

    await main.evaluate((el) => {
      const spacer = document.createElement("div");
      spacer.setAttribute("data-testid", "long-page-spacer");
      spacer.style.height = "4000px";
      el.appendChild(spacer);
      el.scrollTop = 2800;
    });

    const footerBox = await footer.boundingBox();
    const viewport = page.viewportSize();
    expect(footerBox).toBeTruthy();
    expect(viewport).toBeTruthy();
    expect(footerBox!.y).toBeGreaterThanOrEqual(0);
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(
      viewport!.height + 1,
    );
    await expect(signOut).toBeVisible();

    const before = footerBox!.y;
    await main.evaluate((el) => {
      el.scrollTop = 0;
    });
    const after = await footer.boundingBox();
    expect(Math.abs((after?.y ?? 0) - before)).toBeLessThan(2);
  });

  test("navigation can scroll without moving the footer", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name.startsWith("mobile"), "desktop layout");
    const signedIn = await isSignedIn(page);
    test.skip(!signedIn, "requires an authenticated session");

    const footer = page.getByTestId("app-sidebar-footer");
    const nav = page.locator("[data-sidebar-nav]");
    await expect(footer).toBeVisible();

    const before = await footer.boundingBox();
    await nav.evaluate((el) => {
      const extra = document.createElement("div");
      extra.style.height = "2000px";
      extra.setAttribute("data-testid", "long-nav-spacer");
      el.appendChild(extra);
      el.scrollTop = 600;
    });
    const after = await footer.boundingBox();
    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
  });

  test("mobile drawer keeps sign out visible while nav is long", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "mobile layout");
    const signedIn = await isSignedIn(page);
    test.skip(!signedIn, "requires an authenticated session");

    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const footer = page.getByTestId("app-sidebar-footer");
    const signOut = page.getByRole("button", { name: "Sign out" });
    await expect(footer).toBeVisible();
    await expect(signOut).toBeVisible();

    const nav = page.locator("[data-sidebar-nav]");
    await nav.evaluate((el) => {
      const extra = document.createElement("div");
      extra.style.height = "2000px";
      el.appendChild(extra);
      el.scrollTop = 800;
    });

    const footerBox = await footer.boundingBox();
    const viewport = page.viewportSize();
    expect(footerBox).toBeTruthy();
    expect(viewport).toBeTruthy();
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(
      viewport!.height + 8,
    );
    await expect(signOut).toBeVisible();
  });
});
