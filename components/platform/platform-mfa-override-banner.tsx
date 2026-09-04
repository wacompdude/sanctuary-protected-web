import Link from "next/link";

export function PlatformMfaOverrideBanner() {
  return (
    <div className="mb-6 rounded-md border border-red-700/80 bg-red-950/50 px-4 py-3 text-sm text-red-50">
      <p className="font-semibold tracking-wide">
        MFA PLATFORM OVERRIDE: DISABLED
      </p>
      <p className="mt-1 text-red-100/85">
        Multi-factor authentication is currently bypassed for all
        organizations. Existing enrollments and trusted devices are
        preserved.
      </p>
      <Link
        href="/platform/security"
        className="mt-2 inline-block font-medium text-amber-300 hover:underline"
      >
        Review platform MFA policy
      </Link>
    </div>
  );
}
