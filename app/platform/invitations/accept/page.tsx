import { Suspense } from "react";
import Link from "next/link";
import { PlatformAcceptInvitationForm } from "@/components/platform/platform-accept-invitation-form";
import { getPlatformInvitationByToken } from "@/lib/platform/invitation-service";
import { createClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";

async function AcceptContent({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = String(params.token ?? "").trim();

  if (!token) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-slate-800 p-6 text-sm text-slate-300">
        Missing invitation token. Use the link from your invitation email.
      </div>
    );
  }

  if (!isServiceRoleConfigured()) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-rose-800 p-6 text-sm text-rose-200">
        Platform invitations are unavailable: service role is not configured.
      </div>
    );
  }

  let invitation;
  try {
    invitation = await getPlatformInvitationByToken(token);
  } catch (error) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-rose-800 p-6 text-sm text-rose-200">
        {error instanceof Error
          ? error.message
          : "Unable to load this invitation."}
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-slate-800 p-6 text-sm text-slate-300">
        Invitation not found.
      </div>
    );
  }

  if (invitation.status !== "pending") {
    return (
      <div className="mx-auto max-w-lg space-y-3 rounded-lg border border-slate-800 p-6 text-sm text-slate-300">
        <p>This invitation is {invitation.status}.</p>
        <Link href="/login" className="text-amber-300 hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <PlatformAcceptInvitationForm
      token={token}
      email={invitation.email}
      displayName={invitation.display_name}
      roleKeys={invitation.role_keys}
      signedIn={Boolean(user)}
      signedInEmail={user?.email ?? null}
    />
  );
}

export default function PlatformAcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="text-center text-slate-400">Loading invitation…</div>
      }
    >
      <AcceptContent searchParams={searchParams} />
    </Suspense>
  );
}
