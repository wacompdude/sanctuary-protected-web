import { Church } from "lucide-react";
import { RoleGuardedPlaceholderPage } from "@/components/role-guarded-placeholder";

export default function ChurchSettingsPage() {
  return (
    <RoleGuardedPlaceholderPage
      title="Church settings"
      description="Organization profile and contact details."
      placeholderBody="Church profile editing and organization preferences will be available here."
      minRole="administrator"
      icon={Church}
    />
  );
}
