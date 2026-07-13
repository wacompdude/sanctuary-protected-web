"use client";

import { cn } from "@/lib/utils";
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
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { validateEmail } from "@/lib/auth/validation";

/**
 * Password reset placeholder.
 * Full email delivery depends on Supabase Auth email settings.
 * The form captures intent and shows a confirmation message without
 * requiring the service-role key.
 */
export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const emailError = validateEmail(email);
    setFieldError(emailError);
    if (emailError) return;

    setIsLoading(true);
    try {
      // Placeholder: request is acknowledged in-app.
      // Wire to supabase.auth.resetPasswordForEmail when email templates are configured.
      await new Promise((resolve) => setTimeout(resolve, 400));
      setSubmitted(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to start password reset right now.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {submitted ? (
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
                Password reset instructions (placeholder)
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If an account exists for{" "}
              <span className="font-medium text-foreground">{email.trim()}</span>
              , reset instructions will be sent when email delivery is enabled
              for this project.
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
                Enter your email. Full reset email delivery will be enabled in a
                later step.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleForgotPassword} noValidate>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@church.org"
                    value={email}
                    aria-invalid={!!fieldError}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  {fieldError && (
                    <p className="text-sm text-red-500">{fieldError}</p>
                  )}
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Submitting..." : "Continue"}
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
