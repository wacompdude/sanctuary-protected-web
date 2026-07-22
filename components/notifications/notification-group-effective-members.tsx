import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { EffectiveGroupUser } from "@/lib/notifications/groups/types";
import { labelForMembershipRole } from "@/lib/church/invitations";

function membershipSourceLabel(user: EffectiveGroupUser): string {
  const inherited = user.sources.filter((source) => source.type === "inherited");
  const direct = user.sources.some((source) => source.type === "direct");

  if (direct && inherited.length === 0) return "Direct member";
  if (!direct && inherited.length === 1) {
    return `Inherited through ${inherited[0].groupName}`;
  }
  if (!direct && inherited.length > 1) {
    return `Inherited through ${inherited.map((source) => source.groupName).join(" and ")}`;
  }
  if (direct && inherited.length > 0) {
    return `Direct member · also via ${inherited.map((source) => source.groupName).join(", ")}`;
  }
  return "Member";
}

export function NotificationGroupEffectiveMembersPanel({
  users,
}: {
  users: EffectiveGroupUser[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Effective members</CardTitle>
        <CardDescription>
          Deduplicated people who receive notifications when this group is
          targeted
          {users.length > 0
            ? ` · ${users.length} unique member${users.length === 1 ? "" : "s"}`
            : ""}
          . Inherited members cannot be removed here — change the source group
          instead.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No effective members yet. Add direct members or include groups.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {users.map((user) => {
              const inheritedLinks = user.sources.filter(
                (source) => source.type === "inherited",
              );
              return (
                <li key={user.userId} className="px-3 py-2">
                  <p className="text-sm font-medium">{user.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.role ? labelForMembershipRole(user.role) : "Member"}
                    {" · "}
                    {membershipSourceLabel(user)}
                  </p>
                  {inheritedLinks.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Source{" "}
                      {inheritedLinks.map((source, index) => (
                        <span key={source.groupId}>
                          {index > 0 ? ", " : ""}
                          <Link
                            href={`/notification-groups/${source.groupId}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {source.groupName}
                          </Link>
                        </span>
                      ))}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
