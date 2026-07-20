import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatChurchDateTime } from "@/lib/datetime/format";
import {
  labelForScheduleEventStatus,
  labelForScheduleEventType,
} from "@/lib/schedule/constants";
import type { ScheduleEvent } from "@/lib/schedule/types";

export function ScheduleEventList({
  items,
  timeZone,
}: {
  items: ScheduleEvent[];
  timeZone: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No events match these filters.{" "}
        <Link href="/schedule/events/new" className="underline">
          Create an event
        </Link>
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Event</th>
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Campus</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-0">
              <td className="px-3 py-3">
                <Link
                  href={`/schedule/events/${item.id}`}
                  className="font-medium hover:underline"
                >
                  {item.title}
                </Link>
                {item.recurrence_rule ? (
                  <p className="text-xs text-muted-foreground">Recurring</p>
                ) : null}
              </td>
              <td className="px-3 py-3 text-muted-foreground">
                {item.all_day
                  ? formatChurchDateTime(item.start_at, { timeZone }).split(
                      " ",
                    )[0]
                  : `${formatChurchDateTime(item.start_at, { timeZone })} – ${formatChurchDateTime(item.end_at, { timeZone })}`}
              </td>
              <td className="px-3 py-3">
                <Badge variant="secondary">
                  {labelForScheduleEventType(item.event_type)}
                </Badge>
              </td>
              <td className="px-3 py-3">
                <Badge
                  variant={
                    item.status === "cancelled" ? "destructive" : "outline"
                  }
                >
                  {labelForScheduleEventStatus(item.status)}
                </Badge>
              </td>
              <td className="px-3 py-3 text-muted-foreground">
                {item.campus_name ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
