"use client";

import { createClient } from "@/lib/supabase/client";
import { Button, type ButtonProps } from "@/components/ui/button";

export function LogoutButton({
  children = "Sign out",
  ...props
}: ButtonProps) {
  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Hard navigation avoids soft-router races where a still-signed-in
    // session redirects /login → /home → church onboarding.
    window.location.assign("/login");
  };

  return (
    <Button onClick={logout} {...props}>
      {children}
    </Button>
  );
}
