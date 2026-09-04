import Link from "next/link";

export function PlatformMfaEmergencyBanner() {
  return (
    <div className="mb-6 rounded-md border border-red-600 bg-red-950/70 px-4 py-3 text-sm text-red-50">
      <p className="font-semibold tracking-wide">
        EMERGENCY MFA OVERRIDE ACTIVE
      </p>
      <p className="mt-1 text-red-100/90">
        Multi-factor authentication is currently disabled by the server
        environment configuration. Platform and organization MFA settings are
        preserved but cannot require MFA while this override is active.
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
