"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { archiveCampusAction } from "@/app/(app)/campuses/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CampusActionState } from "@/lib/campuses/types";

const initialState: CampusActionState = {};

export function CampusArchiveCard({
  campusId,
  campusName,
  isPrimary,
}: {
  campusId: string;
  campusName: string;
  isPrimary: boolean;
}) {
  const router = useRouter();
  const bound = archiveCampusAction.bind(null, campusId);
  const [state, formAction, pending] = useActionState(bound, initialState);
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Archive campus</CardTitle>
        <CardDescription>
          Prefer deactivation or archive over permanent deletion. Historical
          incidents, training, membership, and audit records stay linked.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-3">
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          {isPrimary ? (
            <p className="text-sm text-muted-foreground">
              Set another campus as primary before archiving {campusName}.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Archive {campusName}? This may affect member assignments,
                security roles, incident history, training records, schedules,
                hardware, cameras, and reports. Data is preserved.
              </p>
              <div className="space-y-2">
                <Label htmlFor="confirm_archive">Type ARCHIVE to confirm</Label>
                <Input
                  id="confirm_archive"
                  name="confirm_archive"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                className="h-11"
                disabled={pending || confirm !== "ARCHIVE"}
              >
                {pending ? "Archiving…" : `Archive ${campusName}`}
              </Button>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
