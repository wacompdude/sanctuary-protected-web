import { AppSidebarNav } from "@/components/app-sidebar-nav";
import { requireChurchMembership } from "@/lib/organization/context";
import { ChurchAccessError } from "@/lib/organization/errors";
import { isNextControlFlowError } from "@/lib/organization/access-guard";
import { getNavSectionsForRole } from "@/lib/organization/navigation";
import type { MembershipRole } from "@/lib/organization/types";
import {
  getEnabledFeatureKeys,
} from "@/lib/subscriptions/enforcement";
import { NAV_ENTITLEMENT_FEATURE_KEYS } from "@/lib/subscriptions/nav-features";

export async function AppSidebar() {
  let churches: { id: string; name: string; role: string }[] = [];
  let activeOrganizationId: string | null = null;
  let role: MembershipRole | null = null;
  let enabledFeatures: Set<string> | undefined;

  try {
    const { church, memberships, membership } = await requireChurchMembership();
    activeOrganizationId = church.id;
    role = membership.role;
    churches = memberships.map((item) => ({
      id: item.organization_id,
      name: item.church.name,
      role: item.role,
    }));
    enabledFeatures = await getEnabledFeatureKeys(
      church.id,
      NAV_ENTITLEMENT_FEATURE_KEYS,
    );
  } catch (error) {
    if (isNextControlFlowError(error)) {
      throw error;
    }
    // Profile (and similar) can render without church context; pages that need
    // membership still enforce via requireChurchMembership / access-guard.
    if (!(error instanceof ChurchAccessError)) {
      throw error;
    }
  }

  const navSections = getNavSectionsForRole(role, { enabledFeatures });

  return (
    <AppSidebarNav
      churches={churches}
      activeOrganizationId={activeOrganizationId}
      role={role}
      navSections={navSections}
    />
  );
}
