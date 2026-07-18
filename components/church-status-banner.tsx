import Link from "next/link";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { isChurchOperationallyLocked } from "@/lib/church/operations";
import { isOwnershipRole } from "@/lib/church/types";
import { ChurchOperationalRedirect } from "@/components/church-operational-redirect";

export async function ChurchStatusBanner() {
  try {
    const { church, membership } = await getAuthenticatedUserWithChurch();
    const locked = isChurchOperationallyLocked(church.status);

    return (
      <>
        <ChurchOperationalRedirect locked={locked} />
        {locked ? (
          <div
            className="mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
            role="status"
          >
            <p className="font-medium">
              {church.name} is{" "}
              {church.status === "closed" ? "closed" : "suspended"}.
            </p>
            <p className="mt-1 text-amber-900/80 dark:text-amber-100/80">
              Operational features such as incidents, team changes, and
              certifications are locked.{" "}
              {isOwnershipRole(membership.role) ? (
                <>
                  You can manage recovery options in{" "}
                  <Link
                    href="/settings/church/danger"
                    className="underline underline-offset-2"
                  >
                    Church settings
                  </Link>
                  .
                </>
              ) : (
                <>Ask a church owner or co-owner to reactivate the account.</>
              )}
            </p>
          </div>
        ) : null}
      </>
    );
  } catch {
    return null;
  }
}
