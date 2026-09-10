"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ActionState } from "@/lib/organization/types";
import type { NotificationEndpoint } from "@/lib/notifications/endpoints/types";
import { maskDestination } from "@/lib/notifications/endpoints/normalize";
import { labelForNotificationChannel } from "@/lib/notifications/constants";
import {
  disableEndpointAction,
  setPrimaryEndpointAction,
  syncMyEndpointsAction,
} from "@/app/(app)/notifications/preference-actions";

function EndpointActions({
  endpoint,
}: {
  endpoint: NotificationEndpoint;
}) {
  const router = useRouter();
  const [primaryState, primaryAction, primaryPending] = useActionState(
    setPrimaryEndpointAction,
    {},
  );
  const [disableState, disableAction, disablePending] = useActionState(
    disableEndpointAction,
    {},
  );

  useEffect(() => {
    if (primaryState.success || disableState.success) {
      router.refresh();
    }
  }, [primaryState.success, disableState.success, router]);

  return (
    <div className="space-y-2">
      {(primaryState.error || disableState.error) && (
        <p className="text-xs text-destructive">
          {primaryState.error || disableState.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!endpoint.is_primary && endpoint.status !== "disabled" ? (
          <form action={primaryAction}>
            <input type="hidden" name="endpoint_id" value={endpoint.id} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="h-10"
              disabled={primaryPending}
            >
              Make primary
            </Button>
          </form>
        ) : null}
        {endpoint.status !== "disabled" ? (
          <form action={disableAction}>
            <input type="hidden" name="endpoint_id" value={endpoint.id} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="h-10"
              disabled={disablePending}
            >
              Disable
            </Button>
          </form>
        ) : null}
      </div>

      {endpoint.channel === "sms" ? (
        <p className="text-xs text-muted-foreground">
          SMS consent is managed on your{" "}
          <Link href="/profile" className="underline underline-offset-4">
            profile
          </Link>
          . A stored mobile number is not SMS enrollment. Status:{" "}
          {endpoint.consent_status}
          {endpoint.consent_disclosure_version
            ? ` · ${endpoint.consent_disclosure_version}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}

async function syncEndpointsFormAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _formData;
  return syncMyEndpointsAction();
}

function SyncButton() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    syncEndpointsFormAction,
    {},
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <form action={formAction}>
      {state.error ? (
        <p className="mb-2 text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" variant="outline" className="h-11" disabled={pending}>
        {pending ? "Syncing…" : "Sync from profile"}
      </Button>
    </form>
  );
}

export function NotificationEndpointsPanel({
  endpoints,
  tablesAvailable,
}: {
  endpoints: NotificationEndpoint[];
  tablesAvailable: boolean;
}) {
  if (!tablesAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Delivery methods</CardTitle>
          <CardDescription>
            Run <code>029_notification_groups.sql</code> to enable delivery
            endpoints.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delivery methods</CardTitle>
        <CardDescription>
          Verified destinations for email. SMS enrollment is on your profile and
          is separate from storing a mobile number. Addresses are shown masked.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SyncButton />
        {endpoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No endpoints yet. Sync from your account email and{" "}
            <Link href="/profile" className="underline">
              profile phone
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-3">
            {endpoints.map((endpoint) => (
              <li
                key={endpoint.id}
                className="rounded-md border border-border px-3 py-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {labelForNotificationChannel(endpoint.channel)}
                      {endpoint.is_primary ? " · Primary" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {maskDestination(
                        endpoint.channel,
                        endpoint.normalized_destination,
                      )}
                      {endpoint.label ? ` · ${endpoint.label}` : ""}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>Status: {endpoint.status}</p>
                    <p>
                      {endpoint.is_verified ? "Verified" : "Unverified"}
                    </p>
                  </div>
                </div>
                {endpoint.channel === "push" ? (
                  <p className="text-xs text-muted-foreground">
                    Push devices are not registered yet.
                  </p>
                ) : (
                  <EndpointActions endpoint={endpoint} />
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Push notifications: no devices registered (coming soon).
        </p>
      </CardContent>
    </Card>
  );
}
