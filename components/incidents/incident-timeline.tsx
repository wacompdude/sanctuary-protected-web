import { formatDateTime, labelForEnum } from "@/lib/incidents/format";
import { INCIDENT_STATUSES } from "@/lib/incidents/constants";
import type { IncidentUpdate } from "@/lib/incidents/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function updateTitle(update: IncidentUpdate) {
  switch (update.update_type) {
    case "created":
      return "Incident created";
    case "status_change":
      return "Status updated";
    default:
      return "Comment added";
  }
}

export function IncidentTimeline({
  updates,
  timeZone,
}: {
  updates: IncidentUpdate[];
  timeZone?: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
        <CardDescription>
          Activity and status changes for this incident.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {updates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No updates yet.</p>
        ) : (
          <ol className="space-y-6">
            {updates.map((update) => (
              <li key={update.id} className="relative border-l border-border pl-4">
                <div className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-primary" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{updateTitle(update)}</p>
                  <time className="text-xs text-muted-foreground">
                    {formatDateTime(update.created_at, null, timeZone)}
                  </time>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{update.content}</p>
                {update.update_type === "status_change" &&
                  update.previous_status &&
                  update.new_status && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {labelForEnum(INCIDENT_STATUSES, update.previous_status)} →{" "}
                      {labelForEnum(INCIDENT_STATUSES, update.new_status)}
                    </p>
                  )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
