/**
 * components/security/audit-log-tab.tsx
 * View and filter security audit logs.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listSecurityAuditLogsAction,
  type AuditLogRow,
} from "@/app/(app)/settings/security/actions";
import type { SecurityAuditEventType } from "@/lib/security/types";

const EVENT_LABELS: Record<string, string> = {
  "security_group.created": "Group Created",
  "security_group.updated": "Group Updated",
  "security_group.deactivated": "Group Deactivated",
  "security_group.deleted": "Group Deleted",
  "security_group_member.added": "Member Added",
  "security_group_member.removed": "Member Removed",
  "security_group_member.expired": "Member Expired",
  "security_group_member.updated": "Assignment Updated",
  "security_group_member.extended": "Access Extended",
  "security_group_member.revoked": "Access Revoked",
  "user_permission.granted": "Permission Granted",
  "user_permission.denied": "Permission Denied",
  "user_permission.revoked": "Permission Revoked",
  "user_permission.expired": "Permission Expired",
  "security_audit_log.viewed": "Audit Log Viewed",
  "security.preview_access_used": "Access Preview Used",
  "tier.changed": "Tier Changed",
  "tier.downgrade": "Tier Downgrade",
};

export function AuditLogTab() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterEventType, setFilterEventType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"all" | "success" | "failure">("all");
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    void loadLogs();
  }, [filterEventType, filterStatus]);

  async function loadLogs() {
    try {
      setLoading(true);
      setError(null);
      const result = await listSecurityAuditLogsAction({
        eventType: (filterEventType || undefined) as SecurityAuditEventType | undefined,
        result: filterStatus === "all" ? undefined : filterStatus,
        limit: 150,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setLogs(result.logs || []);
    } catch (err) {
      console.error("Error loading audit logs:", err);
      setError("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return logs;
    return logs.filter((log) => {
      return (
        log.actorLabel.toLowerCase().includes(query) ||
        log.actorName.toLowerCase().includes(query) ||
        (log.actorEmail || "").toLowerCase().includes(query) ||
        (log.targetLabel || "").toLowerCase().includes(query) ||
        (log.targetName || "").toLowerCase().includes(query) ||
        (log.targetEmail || "").toLowerCase().includes(query) ||
        log.eventType.toLowerCase().includes(query) ||
        (log.reason || "").toLowerCase().includes(query)
      );
    });
  }, [logs, searchQuery]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Audit Log</h2>
        <p className="text-sm text-muted-foreground">Immutable record of security actions</p>
      </div>

      {error && (
        <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-950 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by actor, target, or reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <select
            className="px-3 py-2 border rounded-md text-sm bg-background"
            value={filterEventType}
            onChange={(e) => setFilterEventType(e.target.value)}
          >
            <option value="">All Actions</option>
            {Object.entries(EVENT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          {(["all", "success", "failure"] as const).map((status) => (
            <Button
              key={status}
              variant={filterStatus === status ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus(status)}
              className="capitalize"
            >
              {status === "all" ? "All Status" : status}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading audit logs...</div>
      ) : filteredLogs.length === 0 ? (
        <div className="p-8 text-center border border-dashed rounded-lg">
          <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">
            {logs.length === 0
              ? "No audit logs yet. Security actions will appear here."
              : "No logs match your filter criteria."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log) => (
            <Card
              key={log.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200">
                        {EVENT_LABELS[log.eventType] || log.eventType}
                      </span>
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium capitalize ${
                          log.result === "success"
                            ? "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200"
                            : "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200"
                        }`}
                      >
                        {log.result}
                      </span>
                    </div>
                    <p className="text-sm">
                      <strong>{log.actorLabel}</strong>
                      {log.targetLabel ? (
                        <>
                          {" "}
                          → <strong>{log.targetLabel}</strong>
                        </>
                      ) : null}
                    </p>
                    {log.reason && (
                      <p className="text-sm text-muted-foreground mt-1">{log.reason}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(log.createdAt).toLocaleString()}
                    </p>

                    {expandedLog === log.id && (
                      <div className="mt-4 pt-4 border-t space-y-3 text-sm">
                        {(log.previousValue || log.newValue) && (
                          <pre className="bg-muted p-2 rounded text-xs overflow-auto">
                            {JSON.stringify(
                              {
                                previousValue: log.previousValue,
                                newValue: log.newValue,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        )}
                        <p className="font-mono text-xs text-muted-foreground">Log ID: {log.id}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
