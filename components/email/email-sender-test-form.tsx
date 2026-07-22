"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ActionState } from "@/lib/church/types";
import type { EmailSenderStatusRow } from "@/lib/email";
import { sendEmailSenderTestAction } from "@/app/(app)/notifications/actions";

const initialState: ActionState = {};

export function EmailSenderTestForm({
  rows,
  canSend,
}: {
  rows: EmailSenderStatusRow[];
  canSend: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    sendEmailSenderTestAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  const configured = rows.filter((row) => row.status === "configured");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sender category test</CardTitle>
        <CardDescription>
          Sends a test message to your verified account email using the selected
          platform sender. Arbitrary From addresses are not allowed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-3">
          {state.error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              Sender test queued and dispatched to your email.
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="sender_category">Sender category</Label>
            <select
              id="sender_category"
              name="sender_category"
              defaultValue="alerts"
              disabled={!canSend || pending || configured.length === 0}
              className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:h-9 md:min-h-0 md:text-sm"
            >
              {configured.map((row) => (
                <option key={row.category} value={row.category}>
                  {row.label} — {row.address}
                </option>
              ))}
            </select>
          </div>

          <Button
            type="submit"
            variant="outline"
            disabled={!canSend || pending || configured.length === 0}
            className="h-11 w-full sm:w-auto"
          >
            {pending ? "Sending..." : "Send sender test"}
          </Button>

          {!canSend ? (
            <p className="text-sm text-muted-foreground">
              Only owners and administrators can send sender tests.
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
