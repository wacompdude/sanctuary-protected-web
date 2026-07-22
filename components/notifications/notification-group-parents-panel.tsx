import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { NotificationGroupNestingSummary } from "@/lib/notifications/groups/types";
import {
  labelForGroupStatus,
  labelForGroupType,
} from "@/lib/notifications/groups/constants";

export function NotificationGroupParentsPanel({
  parents,
}: {
  parents: NotificationGroupNestingSummary[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Parent groups</CardTitle>
        <CardDescription>
          Groups that include this group. Changes here affect those parents&apos;
          effective membership.
          {parents.length > 0 ? ` · ${parents.length}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {parents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This group is not included in any other group.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {parents.map((row) => (
              <li key={row.id} className="px-3 py-2">
                {row.parent_group ? (
                  <>
                    <Link
                      href={`/notification-groups/${row.parent_group.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {row.parent_group.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {labelForGroupType(row.parent_group.group_type)} ·{" "}
                      {labelForGroupStatus(row.parent_group.status)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Unknown group</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
