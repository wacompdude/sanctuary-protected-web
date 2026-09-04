"use client";

import { useActionState, useState, useTransition } from "react";
import { signOutAndForgetDeviceAction } from "@/app/auth/sign-out/actions";
import {
  revokeAllOwnTrustedDevicesAction,
  revokeOwnTrustedDeviceAction,
  type TrustedDeviceActionState,
} from "@/app/(app)/profile/trusted-device-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { TrustedDeviceListItem } from "@/lib/mfa/types";

const initialState: TrustedDeviceActionState = {};

function formatFriendlyDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThatDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfThatDay.getTime()) / 86_400_000,
  );
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function TrustedDevicesCard({
  devices,
}: {
  devices: TrustedDeviceListItem[];
}) {
  const [state, revokeAction, pendingRevoke] = useActionState(
    revokeOwnTrustedDeviceAction,
    initialState,
  );
  const [removeAllError, setRemoveAllError] = useState<string | null>(null);
  const [removingAll, startRemoveAll] = useTransition();

  const current = devices.filter((device) => device.isCurrent);
  const others = devices.filter((device) => !device.isCurrent);
  const error = state.error ?? removeAllError;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trusted devices</CardTitle>
        <CardDescription>
          Trusted browsers can skip the extra verification code at sign-in
          until they expire or you remove them. Do not trust a public or shared
          computer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {state.success ? (
          <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            Trusted device removed.
          </p>
        ) : null}

        {devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No trusted devices. After you verify your identity at sign-in, you
            can choose Trust this device on a computer you own.
          </p>
        ) : (
          <div className="space-y-4">
            {current.length > 0 ? (
              <DeviceList
                title="This device"
                devices={current}
                revokeAction={revokeAction}
                pendingRevoke={pendingRevoke}
              />
            ) : null}
            {others.length > 0 ? (
              <DeviceList
                title="Other devices"
                devices={others}
                revokeAction={revokeAction}
                pendingRevoke={pendingRevoke}
              />
            ) : null}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {devices.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              disabled={removingAll}
              onClick={() => {
                setRemoveAllError(null);
                startRemoveAll(async () => {
                  const result = await revokeAllOwnTrustedDevicesAction();
                  if (result.error) setRemoveAllError(result.error);
                });
              }}
            >
              {removingAll ? "Removing..." : "Remove all trusted devices"}
            </Button>
          ) : null}
          <form action={signOutAndForgetDeviceAction}>
            <Button type="submit" variant="ghost">
              Log out and forget this device
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function DeviceList({
  title,
  devices,
  revokeAction,
  pendingRevoke,
}: {
  title: string;
  devices: TrustedDeviceListItem[];
  revokeAction: (formData: FormData) => void;
  pendingRevoke: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-3">
        {devices.map((device) => (
          <li
            key={device.id}
            className="rounded-md border border-border px-3 py-3 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {device.isCurrent
                    ? "This device"
                    : device.deviceName ?? "Unknown device"}
                </p>
                {device.isCurrent && device.deviceName ? (
                  <p className="text-muted-foreground">{device.deviceName}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  Last used: {formatFriendlyDate(device.lastUsedAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Trusted: {formatFriendlyDate(device.firstTrustedAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {device.isExpired
                    ? "Expired"
                    : `Expires: ${formatFriendlyDate(device.expiresAt)}`}
                </p>
              </div>
              <form action={revokeAction}>
                <input type="hidden" name="device_id" value={device.id} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={pendingRevoke}
                >
                  Remove
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
