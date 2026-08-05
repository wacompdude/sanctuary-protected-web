/**
 * Known Safety Concerns mobile readiness self-check (no database).
 * Run: npx --yes tsx lib/safety-concerns/mobile.selfcheck.ts
 */
import {
  orderSafetyConcernPhotosForBrowse,
  SAFETY_CONCERN_EXPO_INTEGRATION_POINTS,
  SAFETY_CONCERN_MOBILE_CACHE_POLICY,
  SAFETY_CONCERN_SIGNED_URL_SECONDS,
} from "@/lib/safety-concerns/mobile";
import { evaluateSafetyConcernAccess } from "@/lib/safety-concerns/access-policy";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const ordered = orderSafetyConcernPhotosForBrowse([
  { id: "c", is_primary: false, display_order: 2 },
  { id: "a", is_primary: true, display_order: 9 },
  { id: "b", is_primary: false, display_order: 1 },
  { id: "d", is_primary: false, display_order: 1 },
]);

assert(ordered.map((p) => p.id).join(",") === "a,b,d,c", "primary then display_order then id");

assert(
  SAFETY_CONCERN_MOBILE_CACHE_POLICY.persistSignedUrls === false,
  "signed URLs must not be persisted",
);
assert(
  SAFETY_CONCERN_MOBILE_CACHE_POLICY.signedUrlTtlSeconds ===
    SAFETY_CONCERN_SIGNED_URL_SECONDS,
  "cache TTL matches signed URL TTL",
);
assert(
  SAFETY_CONCERN_MOBILE_CACHE_POLICY.maxDiskCacheTtlSeconds <=
    SAFETY_CONCERN_SIGNED_URL_SECONDS,
  "disk cache must not outlive signed URLs",
);
assert(
  SAFETY_CONCERN_EXPO_INTEGRATION_POINTS.includes(
    "data.listSafetyConcernBrowseItems(organizationId, options, client)",
  ),
  "browse helper listed as Expo integration point",
);

// Authz for mobile UI must remain pure (no cookies).
{
  const access = evaluateSafetyConcernAccess({
    entitled: true,
    role: "security_member",
    allowSecurityMemberView: true,
  });
  assert(access.canRead && !access.canWrite, "pure evaluate works for mobile gating");
}

console.log("safety-concerns mobile readiness self-check passed");
