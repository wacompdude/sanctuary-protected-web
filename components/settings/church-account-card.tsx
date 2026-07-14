import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ChurchSettingsRecord } from "@/lib/church/settings";

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function ChurchAccountCard({
  church,
  isOwner,
}: {
  church: ChurchSettingsRecord;
  isOwner: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account status</CardTitle>
        <CardDescription>
          {isOwner
            ? "Account metadata for support and billing planning."
            : "Read-only account information. Only owners can change account status."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Account status
            </dt>
            <dd className="mt-1 font-medium capitalize">{church.status}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Current plan
            </dt>
            <dd className="mt-1 text-sm">
              {church.plan_name?.trim() ? (
                church.plan_name
              ) : (
                <span className="text-muted-foreground">
                  Placeholder — billing not configured
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Created
            </dt>
            <dd className="mt-1 text-sm">{formatDate(church.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Last updated
            </dt>
            <dd className="mt-1 text-sm">{formatDate(church.updated_at)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Trial expiration
            </dt>
            <dd className="mt-1 text-sm">
              {church.trial_ends_at ? (
                formatDate(church.trial_ends_at)
              ) : (
                <span className="text-muted-foreground">
                  Placeholder — not configured
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Church ID
            </dt>
            <dd className="mt-1 font-mono text-xs break-all">{church.id}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
