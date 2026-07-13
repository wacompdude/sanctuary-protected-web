import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChurchAccessError,
  requireMinChurchRole,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import type { MembershipRole } from "@/lib/church/types";
import type { LucideIcon } from "lucide-react";

export function RoleGuardedPlaceholderPage({
  title,
  description,
  placeholderBody,
  minRole,
  icon: Icon,
}: {
  title: string;
  description: string;
  placeholderBody: string;
  minRole: MembershipRole;
  icon: LucideIcon;
}) {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <RoleGuardedPlaceholderContent
          title={title}
          description={description}
          placeholderBody={placeholderBody}
          minRole={minRole}
          icon={Icon}
        />
      </Suspense>
    </div>
  );
}

async function RoleGuardedPlaceholderContent({
  title,
  description,
  placeholderBody,
  minRole,
  icon: Icon,
}: {
  title: string;
  description: string;
  placeholderBody: string;
  minRole: MembershipRole;
  icon: LucideIcon;
}) {
  try {
    await requireMinChurchRole(minRole);

    return (
      <>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-muted-foreground">{description}</p>
        </div>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Icon className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Coming soon</CardTitle>
            <CardDescription>{placeholderBody}</CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            Navigation visibility does not grant access — this page still
            enforces your church role on the server.
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

    if (error instanceof ChurchAccessError && error.code === "FORBIDDEN_ROLE") {
      return (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-destructive">
              You do not have permission to view this page.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask a church owner or administrator if you need access.
            </p>
          </CardContent>
        </Card>
      );
    }

    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load this page.";

    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}
