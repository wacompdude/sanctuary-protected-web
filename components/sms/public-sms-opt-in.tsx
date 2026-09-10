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
import { SmsConsentDisclosure } from "@/components/sms/sms-consent-disclosure";
import { PRODUCT_NAME } from "@/lib/legal/config";

export function PublicSmsOptInForm() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold leading-none tracking-tight">
            Mobile Phone
          </h2>
          <CardDescription>
            Saving a mobile number does not enroll you in SMS messaging.
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
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold leading-none tracking-tight">
            SMS Messaging
          </h2>
          <CardDescription>
            Separate from your mobile number and from two-factor authentication.{" "}
            {PRODUCT_NAME} only sends application texts after you opt in here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!agreed) return;
              router.push("/login");
            }}
          >
            <div>
              <p className="text-sm font-medium">Status</p>
              <p className="text-sm text-muted-foreground">Not Enrolled</p>
            </div>

            <SmsConsentDisclosure agreed={agreed} onAgreedChange={setAgreed} />

            <Button type="submit" disabled={!agreed}>
              Verify Number & Enable SMS
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
