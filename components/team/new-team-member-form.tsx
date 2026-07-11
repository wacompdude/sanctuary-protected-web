"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTeamMember } from "@/app/(app)/team/actions";
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
import type { ActionState } from "@/lib/church/types";

const initialState: ActionState = {};

export function NewTeamMemberForm() {
  const [state, formAction, pending] = useActionState(
    createTeamMember,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Team Member</CardTitle>
        <CardDescription>
          Team members can be linked to certifications.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              Team member added successfully.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              name="full_name"
              placeholder="Full name"
              aria-invalid={!!state.fieldErrors?.full_name}
            />
            {state.fieldErrors?.full_name && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.full_name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Security Lead"
              aria-invalid={!!state.fieldErrors?.title}
            />
            {state.fieldErrors?.title && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.title}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="name@example.com"
              aria-invalid={!!state.fieldErrors?.email}
            />
            {state.fieldErrors?.email && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.email}
              </p>
            )}
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Add Team Member"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
