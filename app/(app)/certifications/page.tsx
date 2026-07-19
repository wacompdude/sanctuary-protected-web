import { Suspense } from "react";
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
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { listCertificationsForChurch } from "@/lib/certifications/queries";
import {
  certificationStatusLabel,
  formatDate,
} from "@/lib/certifications/status";
import { Plus } from "lucide-react";

async function CertificationsContent({ created }: { created?: string }) {
  const { church, canManageCertifications } =
    await getAuthenticatedUserWithChurch();
  const certifications = await listCertificationsForChurch(church.id);
  const activeCertifications = certifications.filter(
    (cert) => cert.status === "active" || cert.status === "expiring_soon",
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Certifications</h1>
          <p className="mt-1 text-muted-foreground">
            Current certifications for {church.name} (active and expiring
            soon).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageCertifications && (
            <>
              <Button asChild variant="outline">
                <Link href="/team">Manage team</Link>
              </Button>
              <Button asChild>
                <Link href="/certifications/new">
                  <Plus className="h-4 w-4" />
                  Add Certification
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {created === "1" && (
        <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          Certification added successfully.
        </p>
      )}

      {!canManageCertifications && (
        <p className="text-sm text-muted-foreground">
          Viewing only. Administrators and security leaders can add
          certifications.
        </p>
      )}

      {activeCertifications.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No current certifications on record.
            {canManageCertifications && (
              <span>
                {" "}
                <Link
                  href="/certifications/new"
                  className="underline underline-offset-4"
                >
                  Add a certification
                </Link>
                .
              </span>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeCertifications.map((cert) => (
            <Card key={cert.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">
                    {cert.certification_type}
                  </CardTitle>
                  <Badge
                    variant={
                      cert.status === "expiring_soon" ? "secondary" : "default"
                    }
                  >
                    {certificationStatusLabel[cert.status]}
                  </Badge>
                </div>
                <CardDescription>
                  {cert.team_member?.full_name ?? "Unknown member"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Issuer:</span>{" "}
                  {cert.issuer}
                </p>
                <p>
                  <span className="font-medium text-foreground">Issued:</span>{" "}
                  {formatDate(cert.issue_date, church.timezone)}
                </p>
                <p>
                  <span className="font-medium text-foreground">Expires:</span>{" "}
                  {formatDate(cert.expiration_date, church.timezone)}
                </p>
                <p>
                  <span className="font-medium text-foreground">Number:</span>{" "}
                  {cert.certificate_number}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function CertificationsFallback() {
  return (
    <Card>
      <CardContent className="py-12 text-sm text-muted-foreground">
        Loading certifications…
      </CardContent>
    </Card>
  );
}

async function CertificationsWrapper({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;

  try {
    return <CertificationsContent created={created} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load certifications.";

    return (
      <Card>
        <CardHeader>
          <CardTitle>Certifications</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{message}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Run <code>supabase/migrations/006_certifications.sql</code> in the
            Supabase SQL Editor if tables are missing.
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function CertificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<CertificationsFallback />}>
        <CertificationsWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
