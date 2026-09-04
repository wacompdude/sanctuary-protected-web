"use client";

import { useActionState } from "react";
import {
  selectOrganizationForMfaAction,
  type SelectOrganizationActionState,
} from "@/app/auth/select-organization/actions";
import { BrandLogo } from "@/components/brand-logo";
import { SignOutFormButton } from "@/components/sign-out-form-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initialState: SelectOrganizationActionState = {};

export function SelectOrganizationForMfaForm({
  nextPath,
  organizations,
}: {
  nextPath: string;
  organizations: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(
    selectOrganizationForMfaAction,
    initialState,
  );

  return (
    <Card>
      <CardHeader className="space-y-3 text-center">
        <BrandLogo
          href="/"
          size={40}
          className="mx-auto justify-center"
          wordmarkClassName="text-2xl font-semibold"
        />
        <CardTitle className="text-xl">Choose a church</CardTitle>
        <CardDescription>
          Sign-in verification depends on the church you are opening. This
          list only shows churches you belong to.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <ul className="space-y-2">
          {organizations.map((organization) => (
            <li key={organization.id}>
              <form action={action}>
                <input type="hidden" name="organization_id" value={organization.id} />
                <input type="hidden" name="next" value={nextPath} />
                <Button
                  type="submit"
                  variant="outline"
                  className="h-auto w-full justify-start px-4 py-3 text-left"
                  disabled={pending}
                >
                  {organization.name}
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <div className="pt-2 text-center">
          <SignOutFormButton variant="outline" size="sm">
            Use a different account
          </SignOutFormButton>
        </div>
      </CardContent>
    </Card>
  );
}
