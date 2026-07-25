import { signOutToLoginAction } from "@/app/auth/sign-out/actions";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Server-action sign out — clears cookies reliably, then redirects to /login.
 * Use this when a client-side signOut + soft navigation can race with the
 * signed-in → /home → onboarding redirect loop.
 */
export function SignOutFormButton({
  children = "Sign out",
  next,
  ...props
}: ButtonProps & { next?: string }) {
  return (
    <form action={signOutToLoginAction}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Button type="submit" {...props}>
        {children}
      </Button>
    </form>
  );
}
