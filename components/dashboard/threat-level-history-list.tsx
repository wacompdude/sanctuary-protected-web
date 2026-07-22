import {
  formatThreatWeek,
  labelForThreatLevel,
  threatLevelBadgeClassName,
  threatLevelBadgeStyle,
  type ChurchThreatLevelHistoryEntry,
} from "@/lib/church/threat-levels";
import { formatDateTime } from "@/lib/incidents/format";

export function ThreatLevelHistoryList({
  entries,
  timeZone,
  emptyMessage = "No threat level history has been recorded yet.",
}: {
  entries: ChurchThreatLevelHistoryEntry[];
  timeZone: string;
  emptyMessage?: string;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="rounded-md border border-border px-3 py-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={threatLevelBadgeClassName(entry.threat_level)}
              style={threatLevelBadgeStyle(entry.threat_level)}
            >
              {labelForThreatLevel(entry.threat_level)}
            </span>
            <p className="text-sm font-medium">
              Week of {formatThreatWeek(entry.week_start, timeZone)}
            </p>
          </div>
          {entry.notes ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
              {entry.notes}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No notes recorded.
            </p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            Changed by {entry.changed_by_name}
            {entry.changed_by_email ? ` (${entry.changed_by_email})` : ""} on{" "}
            {formatDateTime(entry.created_at, null, timeZone)}.
          </p>
        </li>
      ))}
    </ul>
  );
}
