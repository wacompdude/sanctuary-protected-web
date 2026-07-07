import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { mockIncidents } from "@/lib/mock-data";
import { Plus } from "lucide-react";

const statusVariant = {
  open: "destructive" as const,
  investigating: "secondary" as const,
  resolved: "outline" as const,
};

const severityClass = {
  low: "text-muted-foreground",
  medium: "text-amber-600 dark:text-amber-400",
  high: "text-red-600 dark:text-red-400",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function IncidentsPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incidents</h1>
          <p className="mt-1 text-muted-foreground">
            Track and manage security incidents across your site.
          </p>
        </div>
        <Button asChild>
          <Link href="/incidents/new">
            <Plus className="h-4 w-4" />
            New Incident
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Incidents</CardTitle>
          <CardDescription>
            {mockIncidents.length} incidents on record
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">
                    ID
                  </th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">
                    Title
                  </th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">
                    Location
                  </th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">
                    Severity
                  </th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="pb-3 font-medium text-muted-foreground">
                    Reported
                  </th>
                </tr>
              </thead>
              <tbody>
                {mockIncidents.map((incident) => (
                  <tr
                    key={incident.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-3 pr-4 font-mono text-xs">
                      {incident.id}
                    </td>
                    <td className="py-3 pr-4 font-medium">{incident.title}</td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {incident.location}
                    </td>
                    <td
                      className={`py-3 pr-4 capitalize ${severityClass[incident.severity]}`}
                    >
                      {incident.severity}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={statusVariant[incident.status]}>
                        {incident.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {formatDate(incident.reportedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
