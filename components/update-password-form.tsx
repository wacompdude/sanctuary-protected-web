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
    router.push("/home");
  }, [state.success, router]);

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
              Please enter your new password below. This signs you out of other
              trusted browsers.
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
                  placeholder="New password"
                  required
                />
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
