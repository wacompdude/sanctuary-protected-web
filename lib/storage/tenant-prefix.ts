/**
 * Storage object prefix for new tenant-scoped uploads.
 * Dual-read validators still accept the legacy `churches/` prefix.
 */
export const STORAGE_TENANT_PREFIX = "organizations";

/** Legacy prefix — still accepted by validators / RLS dual-read helpers. */
export const STORAGE_TENANT_PREFIX_LEGACY = "churches";

export function storageTenantObjectPath(
  organizationId: string,
  relativePath: string,
): string {
  const rel = relativePath.replace(/^\/+/, "");
  return `${STORAGE_TENANT_PREFIX}/${organizationId}/${rel}`;
}

/** True if path is under organizations/{id}/… or churches/{id}/… plus relative prefix. */
export function isStorageTenantPath(
  path: string,
  organizationId: string,
  relativePrefix: string,
): boolean {
  const rel = relativePrefix.replace(/^\/+/, "");
  return (
    path.startsWith(`${STORAGE_TENANT_PREFIX}/${organizationId}/${rel}`) ||
    path.startsWith(
      `${STORAGE_TENANT_PREFIX_LEGACY}/${organizationId}/${rel}`,
    )
  );
}
