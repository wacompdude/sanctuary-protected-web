import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SMS_CONSENT_FREQUENCY,
  SMS_CONSENT_HELP,
  SMS_CONSENT_NOT_REQUIRED,
  SMS_CONSENT_RATES,
  SMS_CONSENT_STOP,
} from "../lib/sms/consent-copy";

function readRepo(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test.describe("SMS enrollment disclosures", () => {
  test("profile enrollment source includes required consent chrome", () => {
    const source = readRepo("components/sms/sms-consent-disclosure.tsx");
    expect(source).toContain("SMS_CONSENT_FREQUENCY");
    expect(source).toContain("SMS_CONSENT_RATES");
    expect(source).toContain("SMS_CONSENT_STOP");
    expect(source).toContain("SMS_CONSENT_HELP");
    expect(source).toContain("SMS_CONSENT_NOT_REQUIRED");
    expect(source).toContain("href={SMS_PRIVACY_HREF}");
    expect(source).toContain("href={SMS_TERMS_HREF}");
    expect(source).toContain('type="checkbox"');
    expect(source).not.toContain("defaultChecked");
    expect(readRepo("components/profile/profile-sms-enrollment.tsx")).toContain(
      "disabled={!agreed",
    );
    expect(readRepo("components/profile/profile-sms-enrollment.tsx")).not.toContain(
      "ProfileMfaSettings",
    );
  });

  test("consent copy includes brand and carrier disclosures", () => {
    expect(SMS_CONSENT_FREQUENCY.toLowerCase()).toContain("frequency varies");
    expect(SMS_CONSENT_RATES.toLowerCase()).toContain("message and data rates");
    expect(SMS_CONSENT_STOP).toContain("STOP");
    expect(SMS_CONSENT_HELP).toContain("HELP");
    expect(SMS_CONSENT_NOT_REQUIRED.toLowerCase()).toContain("not a condition");
  });

  test("public /sms opt-in page is visible without login", async ({ page }) => {
    const response = await page.goto("/sms");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: "SMS Messaging" }).first()).toBeVisible();
    await expect(page.getByText("Sanctuary Protected").first()).toBeVisible();
    await expect(page.getByLabel("Mobile Phone")).toBeVisible();
    await expect(page.getByText("Not Enrolled")).toBeVisible();
    await expect(page.getByText(/Message frequency varies/i).first()).toBeVisible();
    await expect(page.getByText(/Message and data rates may apply/i).first()).toBeVisible();
    await expect(page.getByText(/Reply STOP/).first()).toBeVisible();
    await expect(page.getByText(/Reply HELP/).first()).toBeVisible();
    await expect(page.getByText(/not a condition of purchase/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy Policy" }).first()).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(page.getByRole("link", { name: "Terms of Service" }).first()).toHaveAttribute(
      "href",
      "/terms",
    );
    const checkbox = page.getByRole("checkbox", { name: /I agree to the SMS messaging terms above/i });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Verify Number & Enable SMS" })).toBeDisabled();
    await expect(page.getByText(/Sanctuary Protected Help:/)).toBeVisible();
    await expect(page.getByText(/Welcome to Sanctuary Protected Alerts!/)).toBeVisible();
    await expect(page.getByText(/Msg&Data Rates May Apply/i).first()).toBeVisible();

    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    });
    await expect(page.getByRole("heading", { name: "SMS Messaging" }).first()).toBeVisible();
    await expect(checkbox).toBeVisible();
  });
});
