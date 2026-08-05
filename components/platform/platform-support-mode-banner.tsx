"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { endPlatformSupportSessionAction } from "@/app/platform/actions";

export function PlatformSupportModeBanner({
  session,
}: {
  session: {
    id: string;
    organization_id: string;
    church_name: string | null;
    access_type: string;
    expires_at: string;
    reason: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function endSession() {
    const formData = new FormData();
    formData.set("session_id", session.id);
    startTransition(async () => {
      await endPlatformSupportSessionAction({}, formData);
      router.refresh();
    });
  }

  return (
    <div className="mb-6 rounded-md border border-amber-700/70 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">Support mode active</p>
          <p className="mt-1 text-amber-100/80">
            Church:{" "}
            <Link
              href={`/platform/churches/${session.organization_id}`}
              className="underline hover:text-amber-50"
            >
              {session.church_name || session.organization_id}
            </Link>
            {" · "}
            Access: {session.access_type.replaceAll("_", " ")}
            {" · "}
            Expires {new Date(session.expires_at).toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-amber-200/70">
            Reason: {session.reason}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={endSession}
          className="rounded-md border border-amber-600/60 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-900/50 disabled:opacity-40"
        >
          {pending ? "Ending…" : "End support session"}
        </button>
      </div>
    </div>
  );
}
