"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { createCertification } from "@/app/(app)/certifications/actions";
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
import { CERTIFICATION_TYPE_OPTIONS } from "@/lib/certifications/types";
import type { TeamMember } from "@/lib/certifications/types";
import type { ActionState } from "@/lib/church/types";
import { selectClassName } from "@/components/incidents/incident-badges";

const initialState: ActionState = {};

export function NewCertificationForm({
  teamMembers,
}: {
  teamMembers: TeamMember[];
}) {
  const [state, formAction, pending] = useActionState(
    createCertification,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  if (teamMembers.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Add a team member on the{" "}
          <Link href="/team/new" className="underline underline-offset-4">
            Team page
          </Link>{" "}
          before creating a certification.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Certification</CardTitle>
        <CardDescription>
          Link a certification to a team member for your church.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-6">
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="team_member_id">Team member</Label>
            <select
              id="team_member_id"
              name="team_member_id"
              defaultValue=""
              className={selectClassName}
              aria-invalid={!!state.fieldErrors?.team_member_id}
            >
              <option value="" disabled>
                Select team member
              </option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}
                  {member.title ? ` — ${member.title}` : ""}
                </option>
              ))}
            </select>
            {state.fieldErrors?.team_member_id && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.team_member_id}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="certification_type">Certification type</Label>
            <Input
              id="certification_type"
              name="certification_type"
              list="certification-type-options"
              placeholder="e.g. CPR & First Aid"
              aria-invalid={!!state.fieldErrors?.certification_type}
            />
            <datalist id="certification-type-options">
              {CERTIFICATION_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            {state.fieldErrors?.certification_type && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.certification_type}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="issuer">Issuer</Label>
            <Input
              id="issuer"
              name="issuer"
              placeholder="Issuing organization"
              aria-invalid={!!state.fieldErrors?.issuer}
            />
            {state.fieldErrors?.issuer && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.issuer}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="issue_date">Issue date</Label>
              <Input
                id="issue_date"
                name="issue_date"
                type="date"
                aria-invalid={!!state.fieldErrors?.issue_date}
              />
              {state.fieldErrors?.issue_date && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.issue_date}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiration_date">Expiration date</Label>
              <Input
                id="expiration_date"
                name="expiration_date"
                type="date"
                aria-invalid={!!state.fieldErrors?.expiration_date}
              />
              {state.fieldErrors?.expiration_date && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.expiration_date}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="certificate_number">Certificate number</Label>
            <Input
              id="certificate_number"
              name="certificate_number"
              placeholder="Certificate or license number"
              aria-invalid={!!state.fieldErrors?.certificate_number}
            />
            {state.fieldErrors?.certificate_number && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.certificate_number}
              </p>
            )}
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Add Certification"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
