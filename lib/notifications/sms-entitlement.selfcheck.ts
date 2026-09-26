/**
 * SMS plan entitlement regression (no database, no Bird, no send).
 * Run: npx --yes tsx lib/notifications/sms-entitlement.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { readBooleanEntitlement } from "@/lib/subscriptions/entitlement-values";
import { hasFeature, loadChurchEntitlements } from "@/lib/subscriptions/resolver";
import {
  evaluateSmsEligibility,
  suppressionReasonFromSmsEligibility,
} from "@/lib/sms/eligibility";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function readRepo(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function smsTierFromFeature(featureAllowed: boolean) {
  return featureAllowed ? "ALLOWED" : "ORGANIZATION_SMS_TIER_UNAVAILABLE";
}

const ORG = "d8e32fd9-f9b1-4650-b07a-c06ed94076f1";
const OMNI_PLAN = "123171cf-0d3e-49a5-b7ad-8a10c5fb70c8";
const DEFAULT_PLAN = "default-plan";

function planRow(id: string, planKey: string, isDefault: boolean) {
  return {
    id,
    plan_key: planKey,
    display_name: planKey,
    description: null,
    status: "active",
    billing_interval: "month",
    monthly_price_cents: 0,
    currency: "USD",
    sort_order: 1,
    is_public: true,
    is_default: isDefault,
    is_custom: false,
  };
}

function trustedClient(options: {
  sms: boolean | "missing";
  useDefaultPlan?: boolean;
}) {
  const tables: string[] = [];
  function from(table: string) {
    tables.push(table);
    const eqs: Record<string, unknown> = {};
    const builder = {
      select() {
        return builder;
      },
      eq(key: string, value: unknown) {
        eqs[key] = value;
        return builder;
      },
      in() {
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      is() {
        return builder;
      },
      async maybeSingle() {
        if (table === "organization_subscriptions") {
          if (options.useDefaultPlan) return { data: null, error: null };
          return {
            data: {
              id: "sub",
              organization_id: ORG,
              plan_id: OMNI_PLAN,
              status: "active",
              billing_interval: "month",
              billing_provider: null,
              current_period_start: null,
              current_period_end: null,
              cancel_at_period_end: false,
              cancelled_at: null,
              trial_start: null,
              trial_end: null,
              grace_period_end: null,
              started_at: "2026-07-26T07:09:46.044+00:00",
              subscription_plans: {
                plan_key: "omni_enterprise",
                display_name: "Omni Enterprise",
              },
            },
            error: null,
          };
        }
        if (table === "subscription_plans") {
          if (eqs.is_default === true) {
            return {
              data: planRow(DEFAULT_PLAN, "servant_standard", true),
              error: null,
            };
          }
          if (eqs.plan_key === "omni_enterprise") {
            return {
              data: planRow(OMNI_PLAN, "omni_enterprise", false),
              error: null,
            };
          }
          return { data: null, error: null };
        }
        return { data: null, error: null };
      },
      then(
        resolve: (value: { data: unknown; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        const result =
          table === "plan_features"
            ? {
                data:
                  options.sms === "missing"
                    ? []
                    : [
                        {
                          plan_id: String(eqs.plan_id ?? OMNI_PLAN),
                          feature_id: "feature-sms",
                          boolean_value: options.sms === true,
                          integer_value: null,
                          decimal_value: null,
                          text_value: null,
                          json_value: null,
                          is_inherited: false,
                          features: {
                            feature_key: FEATURE_KEYS.SMS,
                            value_type: "boolean",
                          },
                        },
                      ],
                error: null,
              }
            : { data: [], error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  }
  return { from, tables };
}

async function main() {
  assert(
    smsTierFromFeature(true) === "ALLOWED",
    "1 organization with SMS feature permits SMS",
  );
  assert(
    readBooleanEntitlement(
      { [FEATURE_KEYS.SMS]: { kind: "boolean", value: true } },
      FEATURE_KEYS.SMS,
    ) === true,
    "1 omni_enterprise-style boolean entitlement stays true",
  );

  const audience = readRepo("lib/notifications/resolve-audience.ts");
  const resolver = readRepo("lib/subscriptions/resolver.ts");
  const eligibility = readRepo("lib/sms/eligibility.ts");
  const dispatch = readRepo("lib/notifications/dispatch-notification.ts");

  assert(
    audience.includes("client: supabase"),
    "2 audience SMS entitlement uses the trusted notification client",
  );
  assert(
    !audience.includes(
      `await hasFeature({\n          organizationId,\n          featureKey: FEATURE_KEYS.SMS,\n        })`,
    ),
    "2 audience SMS check is not cookie-only",
  );
  assert(
    resolver.includes("params.client") &&
      resolver.includes("loadChurchEntitlements(params.organizationId, params.client)"),
    "2 hasFeature uses the supplied server client",
  );
  assert(
    eligibility.includes("client: input.client") &&
      dispatch.includes("client: admin"),
    "2 send-time SMS entitlement uses the dispatcher admin client",
  );

  assert(
    smsTierFromFeature(false) === "ORGANIZATION_SMS_TIER_UNAVAILABLE",
    "3 plan without SMS stays unavailable",
  );
  assert(
    readBooleanEntitlement({}, FEATURE_KEYS.SMS) === false,
    "3 missing feature fails closed",
  );
  assert(
    suppressionReasonFromSmsEligibility("ORGANIZATION_SMS_TIER_UNAVAILABLE") ===
      "provider_unavailable",
    "3 tier miss still suppresses before Bird",
  );

  const orgOff = evaluateSmsEligibility({
    organizationId: "org",
    userId: "user",
    phoneNumber: "+14155552671",
    organizationSmsEnabled: false,
    userSmsPreferenceEnabled: true,
    consentStatus: "granted",
    endpointStatus: "active",
    isVerified: true,
    suppressed: false,
  });
  assert(
    !orgOff.allowed && orgOff.reason === "ORGANIZATION_SMS_DISABLED",
    "4 organization SMS switch off remains blocked",
  );

  const noConsent = evaluateSmsEligibility({
    organizationId: "org",
    userId: "user",
    phoneNumber: "+14155552671",
    organizationSmsEnabled: true,
    userSmsPreferenceEnabled: true,
    consentStatus: "unknown",
    endpointStatus: "active",
    isVerified: true,
    suppressed: false,
  });
  assert(
    !noConsent.allowed && noConsent.reason === "SMS_NOT_OPTED_IN",
    "5 missing consent remains ineligible",
  );

  const stopped = evaluateSmsEligibility({
    organizationId: "org",
    userId: "user",
    phoneNumber: "+14155552671",
    organizationSmsEnabled: true,
    userSmsPreferenceEnabled: true,
    consentStatus: "granted",
    endpointStatus: "revoked",
    isVerified: true,
    suppressed: true,
  });
  assert(
    !stopped.allowed && stopped.reason === "SMS_SUPPRESSED",
    "6 STOP/suppression remains blocked",
  );

  assert(
    audience.includes('if (channel === "email")') &&
      audience.includes('if (channel === "push")') &&
      audience.includes('if (channel === "in_app")'),
    "7 email, push, and in-app branches remain",
  );
  assert(
    (audience.match(/hasFeature\(/g) ?? []).length === 1,
    "7 only the SMS entitlement lookup was retargeted",
  );

  const trusted = trustedClient({ sms: true });
  const allowed = await hasFeature({
    organizationId: ORG,
    featureKey: FEATURE_KEYS.SMS,
    client: trusted as never,
  });
  assert(allowed.allowed === true, "2 no-cookie trusted client returns SMS true");
  assert(
    trusted.tables.includes("organization_subscriptions"),
    "1 trusted client reads the organization subscription",
  );
  assert(
    trusted.tables.includes("subscription_plans"),
    "1 trusted client reaches getSubscriptionPlanByKey",
  );
  assert(
    trusted.tables.includes("plan_features"),
    "1 trusted client reaches listPlanFeatureAssignments",
  );

  const denied = trustedClient({ sms: false });
  const deniedEntitlements = await loadChurchEntitlements(ORG, denied as never);
  assert(
    readBooleanEntitlement(deniedEntitlements.values, FEATURE_KEYS.SMS) ===
      false,
    "3 false SMS entitlement stays false",
  );
  assert(
    denied.tables.includes("plan_features"),
    "3 false value is read from the trusted plan_features query",
  );

  const missing = trustedClient({ sms: "missing" });
  const missingEntitlements = await loadChurchEntitlements(
    ORG,
    missing as never,
  );
  assert(
    readBooleanEntitlement(missingEntitlements.values, FEATURE_KEYS.SMS) ===
      false,
    "4 missing feature fails closed",
  );
  assert(
    missing.tables.includes("plan_features"),
    "4 missing-feature lookup uses the trusted client",
  );

  const fallback = trustedClient({ sms: true, useDefaultPlan: true });
  const defaulted = await hasFeature({
    organizationId: ORG,
    featureKey: FEATURE_KEYS.SMS,
    client: fallback as never,
  });
  assert(
    fallback.tables.filter((table) => table === "subscription_plans").length >=
      1,
    "5 default-plan lookup uses the trusted client",
  );
  assert(
    fallback.tables.includes("plan_features"),
    "5 default-plan features use the trusted client",
  );
  assert(defaulted.allowed === true, "5 trusted default plan can include SMS");

  console.log("sms entitlement selfcheck passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
