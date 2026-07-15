import { Suspense } from "react";
import Link from "next/link";
import { ProvisionMemberForm } from "@/components/team/provision-member-form";
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
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import { ArrowLeft } from "lucide-react";

async function AddMemberContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();

  if (!canInviteMembers(membership.role)) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Only owners, administrators, and security leaders can add members with
          login credentials.
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
        <h1 className="text-3xl font-bold tracking-tight">Add member</h1>
        <p className="mt-1 text-muted-foreground">
          Manually create a login for {church.name} and assign a security role.
          Prefer invitations when the person should set their own password.
        </p>
      </div>

      {!isServiceRoleConfigured() && (
        <Card>
          <CardContent className="py-4 text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">Service role key required</p>
            <p className="mt-1 text-muted-foreground">
              Add <code>SUPABASE_SERVICE_ROLE_KEY</code> to the server environment
              (never <code>NEXT_PUBLIC_*</code>) so administrators can create
              Auth users. Also run{" "}
              <code>supabase/migrations/020_provision_church_member.sql</code>.
            </p>
          </CardContent>
        </Card>
      )}

      <ProvisionMemberForm allowedRoles={allowedRoles} />
    </>
  );
}

async function AddMemberWrapper() {
  try {
    return <AddMemberContent />;
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

export default function AddMemberPage() {
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
        <AddMemberWrapper />
      </Suspense>
    </div>
  );
}
