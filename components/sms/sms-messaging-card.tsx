"use client";

import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { SMS_SECTION_HELPER, SMS_SECTION_INTRO } from "@/lib/sms/consent-copy";

export function SmsMessagingCard({
  statusLabel,
  showHelper = true,
  children,
}: {
  statusLabel: string;
  showHelper?: boolean;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-semibold leading-none tracking-tight">
          SMS Messaging
        </h2>
        <CardDescription>{SMS_SECTION_INTRO}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium">Status</p>
          <p className="text-sm text-muted-foreground">{statusLabel}</p>
        </div>
        {showHelper ? (
          <p className="text-pretty text-sm text-muted-foreground">
            {SMS_SECTION_HELPER}
          </p>
        ) : null}
        {children}
      </CardContent>
    </Card>
  );
}
