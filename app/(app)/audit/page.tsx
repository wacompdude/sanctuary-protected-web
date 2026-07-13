import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChurchAccessError,
  requireMinChurchRole,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { listRecentAuditLogs } from "@/lib/audit/queries";

async function AuditLogContent() {
  const { church } = await requireMinChurchRole("administrator");
  const logs = await listRecentAuditLogs(church.id, 75);

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit log</h1>
        <p className="mt-1 text-muted-foreground">
          Recent security and membership activity for {church.name}. Entries are
          append-only.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>
            {logs.length} event{logs.length === 1 ? "" : "s"} (newest first)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No audit events recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {logs.map((log) => (
                <li key={log.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{log.actionLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.entity_type ?? "system"}
                        {log.entity_id ? ` · ${log.entity_id.slice(0, 8)}…` : ""}
                        {log.user_id ? ` · user ${log.user_id.slice(0, 8)}…` : ""}
                      </p>
                      {Object.keys(log.metadata).length > 0 && (
                        <pre className="mt-2 max-w-full overflow-x-auto rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

async function AuditLogWrapper() {
  try {
    return <AuditLogContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

    if (error instanceof ChurchAccessError && error.code === "FORBIDDEN_ROLE") {
      return (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-destructive">
              You do not have permission to view the audit log.
            </p>
          </CardContent>
        </Card>
      );
    }

    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load audit log.";

    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
          {message.toLowerCase().includes("policy") ||
          message.toLowerCase().includes("permission") ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Run <code>supabase/migrations/016_audit_logging.sql</code> if
              audit policies are outdated.
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }
}

export default function AuditLogPage() {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading audit log…
            </CardContent>
          </Card>
        }
      >
        <AuditLogWrapper />
      </Suspense>
    </div>
  );
}
