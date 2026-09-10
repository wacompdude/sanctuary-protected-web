"use client";

import Link from "next/link";
import { Label } from "@/components/ui/label";
import {
  SMS_CONSENT_CHECKBOX_LABEL,
  SMS_CONSENT_FREQUENCY,
  SMS_CONSENT_HELP,
  SMS_CONSENT_NOT_REQUIRED,
  SMS_CONSENT_RATES,
  SMS_CONSENT_STOP,
  SMS_PRIVACY_HREF,
  SMS_TERMS_HREF,
} from "@/lib/sms/consent-copy";

export function SmsConsentDisclosure({
  agreed,
  onAgreedChange,
  consentId = "sms_consent",
}: {
  agreed: boolean;
  onAgreedChange: (next: boolean) => void;
  consentId?: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-pretty text-sm leading-relaxed">
        {SMS_CONSENT_CHECKBOX_LABEL}
      </p>
      <p className="text-pretty text-sm text-muted-foreground">
        {SMS_CONSENT_FREQUENCY} {SMS_CONSENT_RATES} {SMS_CONSENT_STOP}{" "}
        {SMS_CONSENT_HELP} {SMS_CONSENT_NOT_REQUIRED}
      </p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link
          href={SMS_PRIVACY_HREF}
          className="underline underline-offset-4"
          target="_blank"
          rel="noreferrer"
        >
          Privacy Policy
        </Link>
        <Link
          href={SMS_TERMS_HREF}
          className="underline underline-offset-4"
          target="_blank"
          rel="noreferrer"
        >
          Terms of Service
        </Link>
      </div>

      <div className="flex items-start gap-3">
        <input
          id={consentId}
          name="sms_consent"
          type="checkbox"
          value="on"
          checked={agreed}
          required
          aria-required="true"
          autoComplete="off"
          onChange={(event) => onAgreedChange(event.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 rounded border-input accent-primary"
        />
        <Label htmlFor={consentId} className="text-sm font-normal leading-relaxed">
          I agree to the SMS messaging terms above.
        </Label>
      </div>
    </div>
  );
}
