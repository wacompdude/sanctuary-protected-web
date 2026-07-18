import Link from "next/link";
import { Crown } from "lucide-react";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChurchAccessError,
  requireMinChurchRole,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import { OwnershipTransferForm } from "@/components/settings/ownership-transfer-form";

async function OwnershipContent() {
  const { church, membership } = await requireMinChurchRole("owner");
  const members = await listChurchTeamMemberships(church.id);
  const candidates = members
    .filter(
      (member) => member.role === "co_owner" && member.status === "active",
    )
    .map((member) => ({
      membershipId: member.membershipId,
      name: member.name,
      email: member.email,
      role: member.role,
    }));

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ownership</h1>
        <p className="mt-1 text-muted-foreground">
          Owner and co-owner controls for {church.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Crown className="h-5 w-5 text-muted-foreground" />
          </div>
          <CardTitle>Co-owners</CardTitle>
          <CardDescription>
            Co-owners have the same administrative privileges as the primary
            owner. Assign the co-owner role from Team, then transfer primary
            ownership here when needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your current role:{" "}
            <span className="font-medium text-foreground">
              {membership.role === "owner" ? "Owner" : "Co-owner"}
            </span>
            . Multiple co-owners are allowed.
          </p>
          <Button asChild variant="outline">
            <Link href="/team">Manage team roles</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transfer ownership</CardTitle>
          <CardDescription>
            Promotes an active co-owner to primary owner and changes your role
            to co-owner. Historical records are preserved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OwnershipTransferForm
            churchName={church.name}
            isPrimaryOwner={membership.role === "owner"}
            candidates={candidates}
          />
        </CardContent>
      </Card>
    </>
  );
}

export default function OwnershipSettingsPage() {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <OwnershipWrapper />
      </Suspense>
    </div>
  );
}

async function OwnershipWrapper() {
  try {
    return <OwnershipContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    const message =
      error instanceof ChurchAccessError
        ? error.message
        : "Unable to load ownership settings.";
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}
