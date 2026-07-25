import Link from "next/link";
import { ImageOff } from "lucide-react";
import {
  labelForSafetyConcernEnum,
  SAFETY_CONCERN_PROFILE_STATUSES,
  SAFETY_CONCERN_RESTRICTION_TYPES,
  SAFETY_CONCERN_SCOPE_TYPES,
} from "@/lib/safety-concerns/constants";
import type { SafetyConcernProfile } from "@/lib/safety-concerns/types";

export type SafetyConcernListRow = SafetyConcernProfile & {
  primaryPhotoUrl: string | null;
  campusLabel: string;
};

export function SafetyConcernList({ rows }: { rows: SafetyConcernListRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No Safety Concern Profiles match the current filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="pb-3 pr-4 font-medium text-muted-foreground">
              Profile
            </th>
            <th className="pb-3 pr-4 font-medium text-muted-foreground">
              Status
            </th>
            <th className="pb-3 pr-4 font-medium text-muted-foreground">
              Restriction
            </th>
            <th className="pb-3 pr-4 font-medium text-muted-foreground">
              Campus
            </th>
            <th className="pb-3 pr-4 font-medium text-muted-foreground">
              Next review
            </th>
            <th className="pb-3 pr-4 font-medium text-muted-foreground">
              Restriction end
            </th>
            <th className="pb-3 font-medium text-muted-foreground">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((profile) => (
            <tr
              key={profile.id}
              className="border-b border-border last:border-0"
            >
              <td className="py-3 pr-4">
                <Link
                  href={`/safety-concerns/${profile.id}`}
                  className="flex items-center gap-3 hover:underline"
                >
                  <span className="relative flex h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                    {profile.primaryPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.primaryPhotoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageOff className="h-4 w-4" aria-hidden />
                      </span>
                    )}
                  </span>
                  <span className="font-medium">{profile.display_name}</span>
                </Link>
              </td>
              <td className="py-3 pr-4 capitalize text-muted-foreground">
                {labelForSafetyConcernEnum(
                  SAFETY_CONCERN_PROFILE_STATUSES,
                  profile.profile_status,
                )}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {labelForSafetyConcernEnum(
                  SAFETY_CONCERN_RESTRICTION_TYPES,
                  profile.restriction_type,
                )}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {profile.campusLabel ||
                  labelForSafetyConcernEnum(
                    SAFETY_CONCERN_SCOPE_TYPES,
                    profile.scope_type,
                  )}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {profile.next_review_date ?? "—"}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {profile.restriction_end_date ?? "—"}
              </td>
              <td className="py-3 text-muted-foreground">
                {new Date(profile.updated_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
