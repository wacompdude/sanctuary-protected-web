import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { mockCertifications } from "@/lib/mock-data";

const statusVariant = {
  valid: "default" as const,
  expiring: "secondary" as const,
  expired: "destructive" as const,
};

const statusLabel = {
  valid: "Valid",
  expiring: "Expiring Soon",
  expired: "Expired",
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CertificationsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Certifications</h1>
        <p className="mt-1 text-muted-foreground">
          Team certifications and training compliance.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockCertifications.map((cert) => (
          <Card key={cert.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{cert.name}</CardTitle>
                <Badge variant={statusVariant[cert.status]}>
                  {statusLabel[cert.status]}
                </Badge>
              </div>
              <CardDescription>{cert.holder}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Issued:</span>{" "}
                {formatDate(cert.issuedAt)}
              </p>
              <p>
                <span className="font-medium text-foreground">Expires:</span>{" "}
                {formatDate(cert.expiresAt)}
              </p>
              <p className="font-mono text-xs pt-2">{cert.id}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
