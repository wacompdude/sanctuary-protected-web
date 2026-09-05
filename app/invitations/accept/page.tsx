import { Suspense } from "react";
import { connection } from "next/server";
import { AcceptInvitationForm } from "@/components/invitations/accept-invitation-form";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function AcceptInvitationContent({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  await connection();
  const { token } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AcceptInvitationForm
      token={token?.trim() ?? ""}
      userEmail={user?.email ?? null}
    />
  );
}

export default function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading invitation…
          </CardContent>
        </Card>
      }
    >
      <AcceptInvitationContent searchParams={searchParams} />
    </Suspense>
  );
}
