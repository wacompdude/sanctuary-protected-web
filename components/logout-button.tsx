"use client";

import { signOutToLoginAction } from "@/app/auth/sign-out/actions";
import { Button, type ButtonProps } from "@/components/ui/button";

export function LogoutButton({
  children = "Sign out",
  ...props
}: ButtonProps) {
  return (
    <form action={signOutToLoginAction} className="w-full">
      <Button type="submit" {...props}>
        {children}
      </Button>
    </form>
  );
}
