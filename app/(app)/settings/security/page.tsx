import { Shield } from "lucide-react";
import { RoleGuardedPlaceholderPage } from "@/components/role-guarded-placeholder";

export default function SecuritySettingsPage() {
  return (
    <RoleGuardedPlaceholderPage
      title="Security settings"
      description="Configure security operations for your church."
      placeholderBody="Security policies, escalation rules, and device defaults will be managed here."
      minRole="security_leader"
      icon={Shield}
    />
  );
}
