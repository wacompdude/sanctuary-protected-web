import { AppSidebarNav } from "@/components/app-sidebar-nav";
import { requireChurchMembership } from "@/lib/organization/context";
import { ChurchAccessError } from "@/lib/organization/errors";
import { isNextControlFlowError } from "@/lib/organization/access-guard";
import {
  getNavSectionsForRole,
  hasMinRole,
} from "@/lib/organization/navigation";
import type { MembershipRole } from "@/lib/organization/types";
import { getNavFeatureAccess } from "@/lib/subscriptions/enforcement";
import type { FeatureLockSummary } from "@/lib/subscriptions/feature-access";
import { NAV_ENTITLEMENT_FEATURE_KEYS } from "@/lib/subscriptions/nav-features";

export async function AppSidebar() {
  let churches: { id: string; name: string; role: string }[] = [];
  let activeOrganizationId: string | null = null;
  let role: MembershipRole | null = null;
  let enabledFeatures: Set<string> | undefined;
  let lockSummaries: Record<string, FeatureLockSummary> = {};

  try {
    const { church, memberships, membership } = await requireChurchMembership();
    activeOrganizationId = church.id;
    role = membership.role;
    churches = memberships.map((item) => ({
      id: item.organization_id,
      name: item.church.name,
      role: item.role,
    }));
    const access = await getNavFeatureAccess(
      church.id,
      NAV_ENTITLEMENT_FEATURE_KEYS,
    );
    enabledFeatures = access.enabled;
    lockSummaries = access.locks;
  } catch (error) {
    if (isNextControlFlowError(error)) {
      throw error;
    }
    if (!(error instanceof ChurchAccessError)) {
      throw error;
    }
  }

  const navSections = getNavSectionsForRole(role, {
    enabledFeatures,
    keepSafetyConcernsAvailable: role
      ? hasMinRole(role, "security_leader")
      : false,
  });

  return (
    <AppSidebarNav
      churches={churches}
      activeOrganizationId={activeOrganizationId}
      role={role}
      navSections={navSections}
      lockSummaries={lockSummaries}
    />
  );
}
