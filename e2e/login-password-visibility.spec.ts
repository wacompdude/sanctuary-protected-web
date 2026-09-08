import { expect, test, type Page } from "@playwright/test";

async function openLogin(page: Page) {
  await page.goto("/login");
  const toggle = page.getByTestId("toggle-password-visibility");
  const password = page.getByLabel("Password", { exact: true });
  await expect(toggle).toBeVisible();
  await expect(password).toHaveAttribute("type", "password");
  return { password, toggle };
}

async function fillPassword(password: ReturnType<Page["getByLabel"]>) {
  await expect(async () => {
    await password.fill("Sanctuary123!");
    await expect(password).toHaveValue("Sanctuary123!");
  }).toPass();
}

test.describe("login password visibility", () => {
  test("password starts hidden and toggles without submitting", async ({
    page,
  }) => {
    const { password, toggle } = await openLogin(page);
    await expect(password).toHaveAttribute("autocomplete", "current-password");
    await expect(toggle).toHaveAttribute("type", "button");
    await expect(toggle).toHaveAttribute("aria-label", "Show password");
    await fillPassword(password);

    await expect(async () => {
      if ((await password.getAttribute("type")) !== "text") {
        await toggle.click();
      }
      await expect(password).toHaveAttribute("type", "text");
    }).toPass();

    await expect(password).toHaveValue("Sanctuary123!");
    await expect(toggle).toHaveAttribute("aria-label", "Hide password");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

    await toggle.click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveValue("Sanctuary123!");
    await expect(toggle).toHaveAttribute("aria-label", "Show password");
  });

  test("visibility resets after reload and leaving the page", async ({
    page,
  }) => {
    const { password, toggle } = await openLogin(page);
    await fillPassword(password);
    await expect(async () => {
      if ((await password.getAttribute("type")) !== "text") {
        await toggle.click();
      }
      await expect(password).toHaveAttribute("type", "text");
    }).toPass();

    await page.reload();
    await expect(page.getByTestId("toggle-password-visibility")).toHaveAttribute(
      "aria-label",
      "Show password",
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
      "type",
      "password",
    );

    await page.goto("/register");
    await page.goto("/login");
    await expect(page.getByTestId("toggle-password-visibility")).toHaveAttribute(
      "aria-label",
      "Show password",
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
      "type",
      "password",
    );
  });

  test("eye control is keyboard accessible", async ({ page }) => {
    const { password, toggle } = await openLogin(page);
    await fillPassword(password);
    await toggle.focus();
    await expect(async () => {
      if ((await password.getAttribute("type")) !== "text") {
        await page.keyboard.press("Enter");
      }
      await expect(password).toHaveAttribute("type", "text");
    }).toPass();
    await page.keyboard.press(" ");
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveValue("Sanctuary123!");
  });

  test("toggle remains usable on a narrow screen and in dark mode", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { password, toggle } = await openLogin(page);
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    });
    await fillPassword(password);

    const box = await toggle.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(40);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);

    await expect(async () => {
      if ((await password.getAttribute("type")) !== "text") {
        await toggle.click();
      }
      await expect(password).toHaveAttribute("type", "text");
    }).toPass();
  });
});
