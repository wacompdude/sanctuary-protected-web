import { Suspense } from "react";
import Link from "next/link";
import { InviteMemberForm } from "@/components/team/invite-member-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  canInviteMembers,
  rolesInviterMayAssign,
} from "@/lib/church/invitations";
import { ArrowLeft } from "lucide-react";

async function InviteMemberContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();

  // Nav may hide this for security leaders; they can still invite via Team.
  // Server-side permission remains the source of truth.
  if (!canInviteMembers(membership.role)) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Only owners, administrators, and security leaders can invite members.
        </CardContent>
      </Card>
    );
  }

  const allowedRoles = rolesInviterMayAssign(membership.role);

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/team">
            <ArrowLeft className="h-4 w-4" />
            Back to Team
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Invite member</h1>
        <p className="mt-1 text-muted-foreground">
          Invite someone to join {church.name} with a secure link.
        </p>
      </div>

      <InviteMemberForm
        allowedRoles={allowedRoles}
        showInvitationUrl={process.env.NODE_ENV === "development"}
      />
    </>
  );
}

async function InviteMemberWrapper() {
  try {
    return <InviteMemberContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load this page.";
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}

export default function InviteMemberPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <InviteMemberWrapper />
      </Suspense>
    </div>
  );
}
