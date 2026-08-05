/**
 * Storage object prefix for new tenant-scoped uploads.
 * Keep `churches/` until objects are moved with the Storage move/copy API.
 * (SQL UPDATE on storage.objects.name does not rename the underlying blob.)
 */
export const STORAGE_TENANT_PREFIX = "churches";

/** Also accepted by validators / RLS dual-read helpers. */
export const STORAGE_TENANT_PREFIX_LEGACY = "organizations";

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
