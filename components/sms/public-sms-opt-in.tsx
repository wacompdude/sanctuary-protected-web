"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { PublicSignInVerificationCard } from "@/components/mfa/sign-in-verification-card";
import { SmsConsentDisclosure } from "@/components/sms/sms-consent-disclosure";
import { SmsMessagingCard } from "@/components/sms/sms-messaging-card";
import {
  SMS_ENABLE_BUTTON_LABEL,
  SMS_PHONE_SAVE_HELPER,
} from "@/lib/sms/consent-copy";
import { inspectMobileNumber } from "@/lib/sms/phone";

export function PublicSmsOptInForm() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [phone, setPhone] = useState("");
  const phoneValid = inspectMobileNumber(phone).supported;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold leading-none tracking-tight">
            Mobile Phone
          </h2>
          <CardDescription>
            {SMS_PHONE_SAVE_HELPER}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="public_sms_phone">Mobile Phone</Label>
            <Input
              id="public_sms_phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+1 (425) 555-1234"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <SmsMessagingCard statusLabel="Not Enrolled">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!agreed || !phoneValid) return;
            router.push("/login");
          }}
        >
          <SmsConsentDisclosure agreed={agreed} onAgreedChange={setAgreed} />
          <Button type="submit" disabled={!agreed || !phoneValid}>
            {SMS_ENABLE_BUTTON_LABEL}
          </Button>
        </form>
      </SmsMessagingCard>

      <PublicSignInVerificationCard />
    </div>
  );
}
