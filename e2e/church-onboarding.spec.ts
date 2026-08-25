import { expect, test, type Page } from "@playwright/test";
import {
  PHONE_HELP,
  PRIMARY_EMAIL_HELP,
  SLUG_HELP,
  TIMEZONE_HELP,
} from "../lib/organization/field-help";
import { SLUG_FIELD_LABEL, SLUG_HELP_LABEL } from "../lib/organization/slug";
import {
  slugAfterNameChange,
  slugifyOrganizationName,
} from "../lib/organization/slug";

async function contrastLooksReadable(page: Page, selector: string) {
  const colors = await page.locator(selector).first().evaluate((el) => {
    const styles = window.getComputedStyle(el);
    return {
      color: styles.color,
      background: styles.backgroundColor,
    };
  });
  expect(colors.color).not.toEqual(colors.background);
  expect(colors.color).not.toBe("rgba(0, 0, 0, 0)");
}

test.describe("organization slug helpers", () => {
  test("entering a name creates a lowercase hyphenated slug", () => {
    expect(slugifyOrganizationName("First Church")).toBe("first-church");
    expect(slugifyOrganizationName("Grace   Church")).toBe("grace-church");
    expect(slugifyOrganizationName("Church & Community Center")).toBe(
      "church-community-center",
    );
  });

  test("auto mode updates with the name; manual mode does not", () => {
    const auto = slugAfterNameChange(
      "auto",
      "First Church of the First Church",
      "",
    );
    expect(auto).toBe("first-church-of-the-first-church");
    const stillAuto = slugAfterNameChange(
      "auto",
      "First Church of the First Church - Main",
      auto,
    );
    expect(stillAuto).toBe("first-church-of-the-first-church-main");
    const manual = slugAfterNameChange(
      "manual",
      "First Church of the First Church - Main",
      "fcotfc",
    );
    expect(manual).toBe("fcotfc");
    const reset = slugAfterNameChange(
      "auto",
      "First Church of the First Church - Main",
      "fcotfc",
    );
    expect(reset).toBe("first-church-of-the-first-church-main");
  });
});

test.describe("church creation form", () => {
  test("help icons, slug auto-generation, and themes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/onboarding/church");
    if (page.url().includes("/login")) {
      test.skip(true, "onboarding form requires a signed-in session");
      return;
    }

    const emailHelp = page.getByRole("button", { name: "Primary Email help" });
    const phoneHelp = page.getByRole("button", { name: "Phone help" });
    const slugHelp = page.getByRole("button", { name: SLUG_HELP_LABEL });
    await expect(emailHelp).toBeVisible();
    await expect(phoneHelp).toBeVisible();
    await expect(slugHelp).toBeVisible();

    await emailHelp.click();
    await expect(page.getByRole("tooltip")).toContainText(
      PRIMARY_EMAIL_HELP.slice(0, 40),
    );
    await page.keyboard.press("Escape");

    await phoneHelp.focus();
    await expect(page.getByRole("tooltip")).toContainText(PHONE_HELP.slice(0, 40));
    await page.keyboard.press("Escape");

    await slugHelp.click();
    await expect(page.getByRole("tooltip")).toContainText(SLUG_HELP.slice(0, 40));
    await page.keyboard.press("Escape");

    const timezoneHelp = page.getByRole("button", { name: "Time zone help" });
    await expect(timezoneHelp).toBeVisible();
    await timezoneHelp.click();
    await expect(page.getByRole("tooltip")).toContainText(
      TIMEZONE_HELP.slice(0, 40),
    );
    await page.keyboard.press("Escape");

    const timezone = page.getByRole("combobox", { name: "Time zone" });
    await expect(timezone).toBeVisible();
    await expect(timezone).toHaveAttribute(
      "placeholder",
      "Search city or time zone...",
    );

    await timezone.click();
    await timezone.fill("Seattle");
    await expect(page.getByRole("option").first()).toContainText("Los Angeles");
    await page.getByRole("option").filter({ hasText: "Los Angeles" }).first().click();
    await expect(page.locator('input[name="timezone"]')).toHaveValue(
      "America/Los_Angeles",
    );

    await timezone.click();
    await timezone.fill("london");
    await page.keyboard.press("Enter");
    await expect(page.locator('input[name="timezone"]')).toHaveValue(
      "Europe/London",
    );

    await timezone.click();
    await timezone.fill("zzzz-not-a-timezone");
    await expect(page.getByText("No time zones found.")).toBeVisible();
    await page.keyboard.press("Escape");

    const name = page.getByLabel("Church name");
    const slug = page.getByLabel(SLUG_FIELD_LABEL);
    await name.fill("First Church of the First Church");
    await expect(slug).toHaveValue("first-church-of-the-first-church");
    await expect(page.getByText("Identifier: first-church-of-the-first-church")).toBeVisible();
    await name.fill("First Church of the First Church - Main");
    await expect(slug).toHaveValue("first-church-of-the-first-church-main");

    await slug.fill("fcotfc");
    await name.fill("First Church of the First Church");
    await expect(slug).toHaveValue("fcotfc");

    await page.getByRole("button", { name: "Generate from church name" }).click();
    await expect(slug).toHaveValue("first-church-of-the-first-church");

    await contrastLooksReadable(page, "body");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    });
    await emailHelp.click();
    await contrastLooksReadable(page, "[role='tooltip']");
    await timezone.click();
    await timezone.fill("Tokyo");
    await expect(page.getByRole("listbox")).toBeVisible();
    await contrastLooksReadable(page, "[role='listbox']");
    await contrastLooksReadable(page, "[role='option']");
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
