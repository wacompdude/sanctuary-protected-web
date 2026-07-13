"use client";

import { useActionState } from "react";
import Link from "next/link";
import { acceptChurchInvitation } from "@/app/invitations/actions";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { InviteActionState } from "@/lib/church/invitations";

const initialState: InviteActionState = {};

export function AcceptInvitationForm({
  token,
  userEmail,
}: {
  token: string;
  userEmail: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    acceptChurchInvitation,
    initialState,
  );

  const next = `/invitations/accept?token=${encodeURIComponent(token)}`;

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid invitation</CardTitle>
          <CardDescription>
            This invitation link is missing a token.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!userEmail) {
    return (
      <Card>
        <CardHeader className="space-y-4">
          <BrandLogo href="/" size={32} wordmarkClassName="text-lg font-semibold" />
          <div>
            <CardTitle>Accept invitation</CardTitle>
            <CardDescription>
              Sign in or create an account with the invited email address to
              join this church.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/register?next=${encodeURIComponent(next)}`}>
              Create account
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-4">
        <BrandLogo href="/" size={32} wordmarkClassName="text-lg font-semibold" />
        <div>
          <CardTitle>Accept invitation</CardTitle>
          <CardDescription>
            Signed in as {userEmail}. You can only accept this invitation if it
            was sent to this email.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Accepting…" : "Accept invitation"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
