import { CreditCard } from "lucide-react";
import { RoleGuardedPlaceholderPage } from "@/components/role-guarded-placeholder";

export default function BillingPage() {
  return (
    <RoleGuardedPlaceholderPage
      title="Billing"
      description="Subscription and billing for this church."
      placeholderBody="Billing, invoices, and plan management are placeholders for a future release."
      minRole="owner"
      icon={CreditCard}
    />
  );
}
