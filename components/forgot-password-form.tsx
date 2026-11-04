"use client";

import { useActionState } from "react";
import { cn } from "@/lib/utils";
import {
  requestPasswordResetAction,
  type ForgotPasswordActionState,
} from "@/app/auth/forgot-password/actions";
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
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

const initialState: ForgotPasswordActionState = {};

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [state, action, isLoading] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {state.submitted ? (
        <Card>
          <CardHeader className="space-y-4 text-center">
            <BrandLogo
              href="/"
              size={36}
              className="mx-auto justify-center"
              wordmarkClassName="text-xl font-semibold"
            />
            <div className="space-y-1.5">
              <CardTitle className="text-2xl">Check your email</CardTitle>
              <CardDescription>
                Password reset instructions
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If an account exists for that email address, password-reset
              instructions will be sent.
            </p>
            <Button asChild className="w-full" variant="outline">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="space-y-4 text-center">
            <BrandLogo
              href="/"
              size={36}
              className="mx-auto justify-center"
              wordmarkClassName="text-xl font-semibold"
            />
            <div className="space-y-1.5">
              <CardTitle className="text-2xl">Reset your password</CardTitle>
              <CardDescription>
                Enter your email and we will send reset instructions if an
                account exists.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form action={action} noValidate>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@church.org"
                    required
                    aria-invalid={!!state.fieldError}
                  />
                  {state.fieldError ? (
                    <p className="text-sm text-destructive">{state.fieldError}</p>
                  ) : null}
                </div>
                {state.error ? (
                  <p className="text-sm text-destructive">{state.error}</p>
                ) : null}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Submitting..." : "Send reset link"}
                </Button>
              </div>
              <div className="mt-4 text-center text-sm">
                Remember your password?{" "}
                <Link href="/login" className="underline underline-offset-4">
                  Sign in
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
