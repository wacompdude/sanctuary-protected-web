"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  completePasswordRecoveryAction,
  type UpdatePasswordActionState,
} from "@/app/auth/update-password/actions";
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
import { BrandLogo } from "@/components/brand-logo";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/validation";
import Link from "next/link";

const initialState: UpdatePasswordActionState = {};

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const router = useRouter();
  const [state, action, isLoading] = useActionState(
    completePasswordRecoveryAction,
    initialState,
  );

  useEffect(() => {
    if (!state.success) return;
    router.replace("/login?reset=1");
  }, [state.success, router]);

  if (state.success) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardHeader className="space-y-4 text-center">
            <BrandLogo
              href="/"
              size={36}
              className="mx-auto justify-center"
              wordmarkClassName="text-xl font-semibold"
            />
            <div className="space-y-1.5">
              <CardTitle className="text-2xl">Password updated</CardTitle>
              <CardDescription>
                Sign in with your new password. Verification may be required.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/login?reset=1">Continue to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="space-y-4 text-center">
          <BrandLogo
            href="/"
            size={36}
            className="mx-auto justify-center"
            wordmarkClassName="text-xl font-semibold"
          />
          <div className="space-y-1.5">
            <CardTitle className="text-2xl">Reset Your Password</CardTitle>
            <CardDescription>
              Choose a new password (at least {MIN_PASSWORD_LENGTH} characters).
              This ends other trusted browser sessions.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form action={action}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                  aria-invalid={!!state.fieldErrors?.password}
                />
                {state.fieldErrors?.password ? (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.password}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                  aria-invalid={!!state.fieldErrors?.confirmPassword}
                />
                {state.fieldErrors?.confirmPassword ? (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.confirmPassword}
                  </p>
                ) : null}
              </div>
              {state.error ? (
                <p className="text-sm text-destructive">{state.error}</p>
              ) : null}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Saving..." : "Save new password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
