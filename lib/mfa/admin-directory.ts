export const MFA_POLICY_PAGE_SIZE_DEFAULT = 50;
export const MFA_POLICY_PAGE_SIZES = [25, 50, 100] as const;
export type MfaPolicyPageSize = (typeof MFA_POLICY_PAGE_SIZES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function clampMfaPolicyPage(page: unknown): number {
  const n = Number(page);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function clampMfaPolicyPageSize(value: unknown): MfaPolicyPageSize {
  const n = Number(value);
  if (n === 25 || n === 50 || n === 100) return n;
  return MFA_POLICY_PAGE_SIZE_DEFAULT;
}

export function sanitizeOrganizationSearch(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(/[%_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function isUuidSearch(value: string): boolean {
  return UUID_RE.test(value);
}

export function organizationSearchOrFilter(q: string): string | null {
  const value = sanitizeOrganizationSearch(q);
  if (!value) return null;
  if (isUuidSearch(value)) {
    return `id.eq.${value},name.ilike.%${value}%,slug.ilike.%${value}%`;
  }
  return `name.ilike.%${value}%,slug.ilike.%${value}%`;
}

export function pageWindow(input: {
  page: number;
  pageSize: number;
  total: number;
}): {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
} {
  const pageSize = clampMfaPolicyPageSize(input.pageSize);
  const total = Math.max(0, Number.isFinite(input.total) ? input.total : 0);
  if (total === 0) {
    return { page: 1, pageSize, total: 0, totalPages: 1, from: 0, to: 0 };
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, clampMfaPolicyPage(input.page)), totalPages);
  return {
    page,
    pageSize,
    total,
    totalPages,
    from: (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, total),
  };
}
