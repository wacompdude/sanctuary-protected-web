import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SMS_CONSENT_CHECKBOX_LABEL,
  SMS_CONSENT_FREQUENCY,
  SMS_CONSENT_HELP,
  SMS_CONSENT_NOT_REQUIRED,
  SMS_CONSENT_RATES,
  SMS_CONSENT_STOP,
  SMS_CONSENT_STOP_HELP,
  SMS_ENABLE_BUTTON_LABEL,
  SMS_PHONE_SAVE_HELPER,
  SMS_SECTION_HELPER,
  SMS_SECTION_INTRO,
  smsHelpReply,
  smsOptInConfirmation,
} from "../lib/sms/consent-copy";

function readRepo(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test.describe("SMS enrollment disclosures", () => {
  test("profile enrollment source includes required consent chrome", () => {
    const source = readRepo("components/sms/sms-consent-disclosure.tsx");
    expect(source).toContain("SMS Consent");
    expect(source).toContain("SMS_CONSENT_BODY");
    expect(source).toContain("SMS_CONSENT_FREQUENCY");
    expect(source).toContain("SMS_CONSENT_RATES");
    expect(source).toContain("SMS_CONSENT_STOP_HELP");
    expect(source).toContain("SMS_CONSENT_NOT_REQUIRED");
    expect(source).toContain("SMS_CONSENT_CHECKBOX_LABEL");
    expect(source).toContain("href={SMS_PRIVACY_HREF}");
    expect(source).toContain("href={SMS_TERMS_HREF}");
    expect(source).toContain('type="checkbox"');
    expect(source).not.toContain("defaultChecked");
    expect(readRepo("components/profile/profile-sms-enrollment.tsx")).toContain(
      "disabled={!agreed || !phoneValid",
    );
    expect(readRepo("components/profile/profile-sms-enrollment.tsx")).not.toContain(
      "ProfileMfaSettings",
    );
    expect(readRepo("components/profile/profile-sms-enrollment.tsx")).not.toContain(
      "SmsAutomatedReplies",
    );
  });

  test("consent copy includes brand and carrier disclosures", () => {
    expect(SMS_SECTION_INTRO).toContain("two-factor authentication");
    expect(SMS_CONSENT_FREQUENCY.toLowerCase()).toContain("frequency varies");
    expect(SMS_CONSENT_RATES.toLowerCase()).toContain("message and data rates");
    expect(SMS_CONSENT_STOP).toContain("STOP");
    expect(SMS_CONSENT_HELP).toContain("HELP");
    expect(SMS_CONSENT_STOP_HELP).toContain("STOP");
    expect(SMS_CONSENT_NOT_REQUIRED.toLowerCase()).toContain("not a condition");
    expect(SMS_CONSENT_CHECKBOX_LABEL).toBe(
      "I agree to receive SMS messages from Sanctuary Protected LLC.",
    );
    expect(smsOptInConfirmation()).toBe(
      "Sanctuary Protected LLC: You are enrolled in SMS notifications. Msg frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.",
    );
    expect(smsHelpReply()).toBe(
      "Sanctuary Protected LLC: For help, contact support@sanctuaryprotected.com. Reply STOP to opt out.",
    );
  });

  test("public /sms opt-in page is visible without login", async ({ page }) => {
    const response = await page.goto("/sms");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: "SMS Messaging" }).first()).toBeVisible();
    await expect(page.getByText(/SMS messaging is optional and separate/i)).toBeVisible();
    await expect(page.getByText(SMS_SECTION_HELPER)).toBeVisible();
    await expect(page.getByText(SMS_PHONE_SAVE_HELPER).first()).toBeVisible();
    await expect(page.getByLabel("Mobile Phone")).toBeVisible();
    await expect(page.getByText("Not Enrolled")).toBeVisible();
    await expect(page.getByText("SMS Consent")).toBeVisible();
    await expect(page.getByText(/Message frequency varies/i).first()).toBeVisible();
    await expect(page.getByText(/Message and data rates may apply/i).first()).toBeVisible();
    await expect(page.getByText(/Reply STOP/).first()).toBeVisible();
    await expect(page.getByText(/HELP for help/i).first()).toBeVisible();
    await expect(page.getByText(/not a condition of purchase/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy Policy" }).first()).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(page.getByRole("link", { name: "Terms of Service" }).first()).toHaveAttribute(
      "href",
      "/terms",
    );
    const checkbox = page.getByRole("checkbox", {
      name: /I agree to receive SMS messages from Sanctuary Protected LLC/i,
    });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();
    const enable = page.getByRole("button", { name: SMS_ENABLE_BUTTON_LABEL });
    await expect(enable).toBeDisabled();
    await checkbox.check();
    await expect(enable).toBeDisabled();
    await page.getByLabel("Mobile Phone").fill("425-555-1234");
    await expect(enable).toBeEnabled();
    await expect(page.getByText(/Automated replies/i)).toHaveCount(0);
    await expect(page.getByText(/You are enrolled in SMS notifications/)).toHaveCount(0);
    await expect(page.getByText(/Toll-free carriers/i)).toHaveCount(0);

    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    });
    await expect(page.getByRole("heading", { name: "SMS Messaging" }).first()).toBeVisible();
    await expect(checkbox).toBeVisible();
  });
});
