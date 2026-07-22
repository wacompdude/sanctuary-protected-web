import type { EmailSenderRegistryStatus } from "@/lib/email";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function EmailSenderStatus({
  registry,
  providerName,
  providerConfigured,
}: {
  registry: EmailSenderRegistryStatus;
  providerName: string;
  providerConfigured: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Outbound email senders</CardTitle>
        <CardDescription>
          Platform-controlled From addresses on{" "}
          {registry.domain ? (
            <span className="font-medium text-foreground">{registry.domain}</span>
          ) : (
            "the verified Sanctuary Protected domain"
          )}
          . Church administrators cannot edit these addresses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm">
          <p>
            <span className="font-medium">Provider:</span> {providerName} ·{" "}
            {providerConfigured ? "configured" : "not configured"}
          </p>
          <p>
            <span className="font-medium">Senders ready:</span>{" "}
            {registry.configuredCount}/{registry.rows.length}
            {registry.errorCount > 0
              ? ` · ${registry.errorCount} configuration error(s)`
              : null}
          </p>
          <p className="text-muted-foreground">
            Reply-enabled categories need a real mailbox or forwarding rule outside
            Resend. The Resend API key is never shown here.
          </p>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Friendly name</th>
                <th className="px-3 py-2 font-medium">From address</th>
                <th className="px-3 py-2 font-medium">Reply-to</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {registry.rows.map((row) => (
                <tr key={row.category} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 align-top">{row.label}</td>
                  <td className="px-3 py-2 align-top">{row.name || "—"}</td>
                  <td className="px-3 py-2 align-top">
                    {row.address ? (
                      <a
                        href={`mailto:${row.address}`}
                        className="underline underline-offset-2"
                      >
                        {row.address}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">
                    {row.replyTo ?? (row.allowReplies ? "—" : "None")}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.status === "configured" ? (
                      <span className="text-green-700 dark:text-green-400">
                        Configured
                      </span>
                    ) : (
                      <span className="text-destructive">
                        Error{row.errorCode ? ` (${row.errorCode})` : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
