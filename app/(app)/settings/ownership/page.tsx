import { Crown } from "lucide-react";
import { RoleGuardedPlaceholderPage } from "@/components/role-guarded-placeholder";

export default function OwnershipSettingsPage() {
  return (
    <RoleGuardedPlaceholderPage
      title="Ownership"
      description="Owner controls for this church account."
      placeholderBody="Ownership transfer and owner-only controls will be available here."
      minRole="owner"
      icon={Crown}
    />
  );
}
