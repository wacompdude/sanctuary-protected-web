import { Badge } from "@/components/ui/badge";
import { labelForPolicyDocumentStatus } from "@/lib/policies/constants";

export function PolicyStatusBadge({ status }: { status: string }) {
  const variant =
    status === "published"
      ? "default"
      : status === "draft" || status === "under_review"
        ? "secondary"
        : status === "archived" || status === "retired"
          ? "outline"
          : "secondary";

  return <Badge variant={variant}>{labelForPolicyDocumentStatus(status)}</Badge>;
}

export function EmergencyPolicyBadge() {
  return (
    <Badge className="border-red-700 bg-red-600 text-white hover:bg-red-600">
      Emergency
    </Badge>
  );
}
