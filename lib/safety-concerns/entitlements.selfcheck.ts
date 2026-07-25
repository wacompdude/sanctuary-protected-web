/**
 * Known Safety Concerns entitlement / downgrade self-check (no database).
 * Run: npx --yes tsx lib/safety-concerns/entitlements.selfcheck.ts
 */
import { evaluateSafetyConcernAccess } from "@/lib/safety-concerns/access-policy";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// Entitled manager
{
  const access = evaluateSafetyConcernAccess({
    entitled: true,
    role: "security_leader",
  });
  assert(access.canRead && access.canWrite && !access.readOnly, "entitled leader can write");
}

// Entitled security member
{
  const access = evaluateSafetyConcernAccess({
    entitled: true,
    role: "security_member",
    allowSecurityMemberView: true,
  });
  assert(access.canRead && !access.canWrite && !access.readOnly, "entitled member read-only by role");
}

// Entitled but church disables security member view
{
  const access = evaluateSafetyConcernAccess({
    entitled: true,
    role: "security_member",
    allowSecurityMemberView: false,
  });
  assert(!access.canRead && !access.canWrite, "member blocked by church setting");
}

// Downgrade: leadership retains read-only
{
  const access = evaluateSafetyConcernAccess({
    entitled: false,
    role: "administrator",
    reason: "Not on plan",
  });
  assert(access.canRead && !access.canWrite && access.readOnly, "downgrade leadership read-only");
}

// Downgrade: security member loses access
{
  const access = evaluateSafetyConcernAccess({
    entitled: false,
    role: "security_member",
  });
  assert(!access.canRead && !access.canWrite && !access.readOnly, "downgrade blocks members");
}

// Viewer never has access
{
  const access = evaluateSafetyConcernAccess({
    entitled: true,
    role: "viewer",
  });
  assert(!access.canRead && !access.canWrite, "viewer blocked even when entitled");
}

console.log("safety concern entitlements self-check passed");
