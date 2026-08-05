/** Current Storage object prefix for tenant-scoped files. */
export const STORAGE_TENANT_PREFIX = "organizations";

/** Legacy prefix kept for dual-read until objects are rewritten. */
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
