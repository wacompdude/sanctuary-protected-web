import Link from "next/link";
import { Suspense } from "react";
import { PlatformInviteForm } from "@/components/platform/platform-invite-form";
import { requirePlatformPermission } from "@/lib/platform/auth";
import { platformRolesInviterMayAssign } from "@/lib/platform/invitations";

async function NewAccountContent() {
  const context = await requirePlatformPermission("platform.accounts.create");
  const assignableRoles = platformRolesInviterMayAssign(context.permissions);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/platform/accounts"
          className="text-sm text-slate-400 hover:text-amber-300"
        >
          ← Platform accounts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Invite platform account
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Send a secure invitation. The invitee creates their own password and
          must enroll MFA. You never set or see their permanent password.
        </p>
      </div>

      <div className="max-w-xl rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <PlatformInviteForm assignableRoles={assignableRoles} />
      </div>
    </div>
  );
}

export default function PlatformNewAccountPage() {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading…</div>}>
      <NewAccountContent />
    </Suspense>
  );
}
