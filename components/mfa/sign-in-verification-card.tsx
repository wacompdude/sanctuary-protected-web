import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MFA_EMAIL_CODE_BODY,
  MFA_EMAIL_CODE_TITLE,
  MFA_NO_BACKUP_NUMBER,
  MFA_PHONE_FIELD_HELPER,
  MFA_PUBLIC_MANAGE_HELPER,
  MFA_SECTION_INTRO,
  MFA_SECTION_TITLE,
  MFA_SEND_VERIFICATION_LABEL,
  MFA_SMS_BACKUP_BODY,
  MFA_SMS_BACKUP_TITLE,
} from "@/lib/mfa/copy";

export function SignInVerificationCard({
  policyNotice,
  backupStatus,
  children,
}: {
  policyNotice?: string | null;
  backupStatus?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{MFA_SECTION_TITLE}</CardTitle>
        <CardDescription>{MFA_SECTION_INTRO}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {policyNotice ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {policyNotice}
          </p>
        ) : null}

        <div className="rounded-md border border-border px-3 py-3 text-sm">
          <p className="font-medium">{MFA_EMAIL_CODE_TITLE}</p>
          <p className="mt-1 text-muted-foreground">{MFA_EMAIL_CODE_BODY}</p>
        </div>

        <div className="rounded-md border border-border px-3 py-3 text-sm">
          <p className="font-medium">{MFA_SMS_BACKUP_TITLE}</p>
          <p className="mt-1 text-muted-foreground">{MFA_SMS_BACKUP_BODY}</p>
          {backupStatus ?? (
            <p className="mt-2 text-muted-foreground">{MFA_NO_BACKUP_NUMBER}</p>
          )}
        </div>

        {children}
      </CardContent>
    </Card>
  );
}

/** Public /sms evidence of the 2FA program. Does not send authentication texts. */
export function PublicSignInVerificationCard() {
  return (
    <SignInVerificationCard>
      <p className="text-pretty text-sm text-muted-foreground">
        {MFA_PUBLIC_MANAGE_HELPER}
      </p>
      <div className="space-y-2">
        <Label htmlFor="public_mfa_phone">Mobile number</Label>
        <Input
          id="public_mfa_phone"
          name="mfa_phone"
          type="tel"
          autoComplete="off"
          placeholder="+14255551234"
          disabled
        />
        <p className="text-xs text-muted-foreground">{MFA_PHONE_FIELD_HELPER}</p>
      </div>
      <Button asChild>
        <Link href="/login?next=/profile">{MFA_SEND_VERIFICATION_LABEL}</Link>
      </Button>
    </SignInVerificationCard>
  );
}
