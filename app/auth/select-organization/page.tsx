import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthPageShell } from "@/components/auth-page-shell";
import { SelectOrganizationForMfaForm } from "@/components/mfa/select-organization-for-mfa-form";
import { getLoginMfaContext, safeMfaNextPath } from "@/lib/mfa/login";
import { getUserMemberships } from "@/lib/organization/auth";

async function SelectOrganizationContent({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeMfaNextPath(params.next);
  const ctx = await getLoginMfaContext();
  if (!ctx) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const memberships = await getUserMemberships(ctx.userId).catch(() => []);
  if (memberships.length <= 1) {
    redirect(`/auth/mfa/continue?next=${encodeURIComponent(nextPath)}`);
  }

  return (
    <SelectOrganizationForMfaForm
      nextPath={nextPath}
      organizations={memberships.map((membership) => ({
        id: membership.organization_id,
        name: membership.church.name,
      }))}
    />
  );
}

export default function SelectOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <AuthPageShell>
      <Suspense>
        <SelectOrganizationContent searchParams={searchParams} />
      </Suspense>
    </AuthPageShell>
  );
}