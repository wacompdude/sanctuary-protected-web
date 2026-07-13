import { Activity } from "lucide-react";
import { RoleGuardedPlaceholderPage } from "@/components/role-guarded-placeholder";

export default function AccountStatusPage() {
  return (
    <RoleGuardedPlaceholderPage
      title="Account status"
      description="Trial, active, suspended, and closed account state."
      placeholderBody="Church account status and lifecycle controls will appear here."
      minRole="owner"
      icon={Activity}
    />
  );
}
