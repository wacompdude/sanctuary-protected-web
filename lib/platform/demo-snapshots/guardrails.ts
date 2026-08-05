import { PlatformAccessError } from "@/lib/platform/errors";
import { requirePlatformAdminClient } from "@/lib/platform/queries";
import {
  DEMO_RESTORE_CONFIRMATION_PHRASE,
  DEMO_SNAPSHOT_STORAGE_BUCKET,
} from "@/lib/platform/demo-snapshots/snapshot-table-registry";

export type DemoOrganizationRecord = {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
  seed_source: string | null;
  is_demo_organization: boolean;
  demo_restore_enabled: boolean;
  demo_restore_locked: boolean;
  demo_maintenance_mode: boolean;
  demo_environment_label: string | null;
};

export { DEMO_RESTORE_CONFIRMATION_PHRASE, DEMO_SNAPSHOT_STORAGE_BUCKET };

export function isDemoRestoreEligible(org: {
  is_demo_organization: boolean;
  demo_restore_enabled: boolean;
  demo_restore_locked: boolean;
}): boolean {
  return (
    org.is_demo_organization === true &&
    org.demo_restore_enabled === true &&
    org.demo_restore_locked === false
  );
}

export async function getDemoOrganizationById(
  organizationId: string,
): Promise<DemoOrganizationRecord | null> {
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select(
      "id, name, slug, status, seed_source, is_demo_organization, demo_restore_enabled, demo_restore_locked, demo_maintenance_mode, demo_environment_label",
    )
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    if (/is_demo_organization|schema cache|column/i.test(error.message)) {
      throw new PlatformAccessError(
        "Demo organization columns are not available. Apply migrations 080 and 081.",
        "LOAD_FAILED",
      );
    }
    throw new PlatformAccessError(error.message, "LOAD_FAILED");
  }

  if (!data) return null;
  return data as DemoOrganizationRecord;
}

export async function requireDemoOrganization(
  organizationId: string,
): Promise<DemoOrganizationRecord> {
  const org = await getDemoOrganizationById(organizationId);
  if (!org) {
    throw new PlatformAccessError("Organization not found.", "LOAD_FAILED");
  }
  if (!org.is_demo_organization) {
    throw new PlatformAccessError(
      "This church is not marked as a demo organization.",
      "FORBIDDEN_PERMISSION",
    );
  }
  return org;
}

export async function requireDemoRestoreEligible(
  organizationId: string,
): Promise<DemoOrganizationRecord> {
  const org = await requireDemoOrganization(organizationId);
  if (!org.demo_restore_enabled) {
    throw new PlatformAccessError(
      "Demo restore is disabled for this church.",
      "FORBIDDEN_PERMISSION",
    );
  }
  if (org.demo_restore_locked) {
    throw new PlatformAccessError(
      "Demo restore is locked for this church.",
      "FORBIDDEN_PERMISSION",
    );
  }
  return org;
}

/** Church-app write guard when demo maintenance mode is on. */
export async function assertNotInDemoMaintenance(
  organizationId: string,
): Promise<void> {
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select("demo_maintenance_mode, is_demo_organization")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    // Columns missing → treat as not in maintenance (pre-migration).
    if (/demo_maintenance_mode|schema cache|column/i.test(error.message)) {
      return;
    }
    throw error;
  }

  if (data?.is_demo_organization && data?.demo_maintenance_mode) {
    throw new Error(
      "This demonstration environment is being reset. Please try again shortly.",
    );
  }
}

export async function listDemoOrganizations(): Promise<DemoOrganizationRecord[]> {
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select(
      "id, name, slug, status, seed_source, is_demo_organization, demo_restore_enabled, demo_restore_locked, demo_maintenance_mode, demo_environment_label",
    )
    .eq("is_demo_organization", true)
    .order("name", { ascending: true });

  if (error) {
    if (/is_demo_organization|schema cache|column/i.test(error.message)) {
      throw new PlatformAccessError(
        "Demo organization columns are not available. Apply migrations 080 and 081.",
        "LOAD_FAILED",
      );
    }
    throw new PlatformAccessError(error.message, "LOAD_FAILED");
  }

  return (data ?? []) as DemoOrganizationRecord[];
}

export async function findOrganizationBySeedSource(
  seedSource: string,
): Promise<{ id: string; name: string; seed_source: string | null } | null> {
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select("id, name, seed_source")
    .eq("seed_source", seedSource)
    .maybeSingle();

  if (error) throw new PlatformAccessError(error.message, "LOAD_FAILED");
  return data as { id: string; name: string; seed_source: string | null } | null;
}
