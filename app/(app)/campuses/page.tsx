import { Building2 } from "lucide-react";
import { RoleGuardedPlaceholderPage } from "@/components/role-guarded-placeholder";

export default function CampusesPage() {
  return (
    <RoleGuardedPlaceholderPage
      title="Campuses"
      description="Campus information for your active church."
      placeholderBody="Assigned campus details and campus management tools will appear here."
      minRole="security_member"
      icon={Building2}
    />
  );
}
