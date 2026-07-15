import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  SENSITIVE_NETWORK_FIELDS,
  fieldsForDetailTable,
  labelForDetailOption,
  titleForDetailTable,
  type CategoryDetailRecord,
  type CategoryDetailTable,
} from "@/lib/security-hardware/category-details";
import { formatEquipmentDate } from "@/lib/security-hardware/constants";

export function CategoryDetailsView({
  table,
  values,
  canViewSensitive,
}: {
  table: CategoryDetailTable;
  values: CategoryDetailRecord;
  canViewSensitive: boolean;
}) {
  const fields = fieldsForDetailTable(table);
  const visible = fields.filter((field) => {
    const raw = values[field.key];
    if (raw === null || raw === undefined || raw === "") return false;
    if (typeof raw === "boolean" && raw === false) {
      // Still show false for important capability flags? Prefer hide empty false.
      return true;
    }
    return true;
  });

  if (visible.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Technical details</CardTitle>
          <CardDescription>
            No {titleForDetailTable(table).toLowerCase()} have been saved yet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Technical details</CardTitle>
        <CardDescription>{titleForDetailTable(table)}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {visible.map((field) => {
          const raw = values[field.key];
          const isSensitive =
            field.sensitive || SENSITIVE_NETWORK_FIELDS.has(field.key);

          let display: string;
          if (isSensitive && !canViewSensitive) {
            display = "Restricted";
          } else if (field.kind === "date") {
            display = formatEquipmentDate(
              raw != null ? String(raw) : null,
            );
          } else {
            display = labelForDetailOption(field, raw);
          }

          return (
            <div key={field.key}>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {field.label}
              </p>
              <p className="mt-1 text-sm">
                {display}
                {isSensitive && !canViewSensitive ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (security leaders and above)
                  </span>
                ) : null}
              </p>
              {field.hint && canViewSensitive && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {field.hint}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
