import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatChurchDateTime } from "@/lib/datetime/format";
import { labelForAuditAction } from "@/lib/audit/actions";

export async function CampusAuditPanel({
  organizationId,
  campusId,
  timezone,
}: {
  organizationId: string;
  campusId: string;
  timezone?: string | null;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, metadata, created_at, user_id")
    .eq("organization_id", organizationId)
    .or(`entity_id.eq.${campusId},metadata->>campus_id.eq.${campusId}`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Audit history</CardTitle>
          <CardDescription>Unable to load campus audit records.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const rows = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit history</CardTitle>
        <CardDescription>
          Campus security and membership changes for this location.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No campus audit records yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rows.map((row) => (
              <li key={row.id} className="px-3 py-3 text-sm">
                <p className="font-medium">
                  {labelForAuditAction(String(row.action))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatChurchDateTime(String(row.created_at), {
                    timeZone: timezone ?? undefined,
                  })}
                  {row.entity_type ? ` · ${row.entity_type}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
