import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HELP_MIGRATION_HINT } from "@/lib/help/constants";

export function HelpEmptyState({
  title = "Help Center",
  description = "No published help articles are available yet. Check back soon, or contact support if you need assistance.",
  showMigrationHint = false,
}: {
  title?: string;
  description?: string;
  showMigrationHint?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {showMigrationHint ? HELP_MIGRATION_HINT : description}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
