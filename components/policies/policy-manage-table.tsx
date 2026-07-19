import Link from "next/link";
import { PolicyStatusBadge } from "@/components/policies/policy-status-badge";
import { Button } from "@/components/ui/button";
import { formatChurchDateTime } from "@/lib/datetime/format";
import { labelForPolicyDocumentType } from "@/lib/policies/constants";
import type { PolicyDocumentListItem } from "@/lib/policies/types";

export function PolicyManageTable({
  items,
  timeZone,
}: {
  items: PolicyDocumentListItem[];
  timeZone?: string | null;
}) {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        <p>No policies match these filters.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/policies/new">Create the first policy</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-3 pr-4 font-medium text-muted-foreground">
                Title
              </th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground">
                Type
              </th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground">
                Status
              </th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground">
                Version
              </th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground">
                Category
              </th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground">
                Campus
              </th>
              <th className="pb-3 font-medium text-muted-foreground">
                Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border/60">
                <td className="py-3 pr-4">
                  <Link
                    href={`/policies/${item.id}/edit`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {item.title}
                  </Link>
                  {item.is_emergency_document ? (
                    <span className="ml-2 text-xs text-red-600">Emergency</span>
                  ) : null}
                </td>
                <td className="py-3 pr-4">
                  {labelForPolicyDocumentType(item.document_type)}
                </td>
                <td className="py-3 pr-4">
                  <PolicyStatusBadge status={item.status} />
                </td>
                <td className="py-3 pr-4">
                  {item.version_label ? `v${item.version_label}` : "—"}
                </td>
                <td className="py-3 pr-4">{item.category_label ?? "—"}</td>
                <td className="py-3 pr-4">{item.campus_name ?? "Church-wide"}</td>
                <td className="py-3">
                  {formatChurchDateTime(item.updated_at, { timeZone })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/policies/${item.id}/edit`}
            className="block rounded-lg border border-border p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{item.title}</p>
              <PolicyStatusBadge status={item.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {labelForPolicyDocumentType(item.document_type)}
              {item.version_label ? ` · v${item.version_label}` : ""}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
