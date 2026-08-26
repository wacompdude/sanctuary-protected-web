/**
 * Documentation-only map of major product surfaces to Help articles.
 * Not used for authorization or feature gating.
 */
import { HELP_SEED_ARTICLE_SLUGS } from "@/lib/help/constants";
import { HELP_SEED_ARTICLE_CATALOG } from "@/lib/help/seed-content";
import { FEATURE_KEYS, type FeatureKey } from "@/lib/subscriptions/feature-keys";
import { NAV_FEATURE_REQUIREMENTS } from "@/lib/subscriptions/nav-features";
import {
  EXPECTED_PLAN_ENTITLEMENTS,
} from "@/lib/subscriptions/expected-matrix";
import { PLAN_DISPLAY_NAMES, PLAN_KEY_LIST, type PlanKey } from "@/lib/subscriptions/plan-keys";

export type HelpCoverageStatus = "documented" | "partial" | "gap";

export type HelpCoverageRow = {
  /** Stable key for audits (feature key, nav id, or module id). */
  key: string;
  label: string;
  articleSlugs: readonly string[];
  status: HelpCoverageStatus;
  notes?: string;
};

const slugSet = new Set<string>(HELP_SEED_ARTICLE_SLUGS);

export const HELP_FEATURE_COVERAGE: readonly HelpCoverageRow[] = [
  {
    key: "getting-started",
    label: "Getting started",
    articleSlugs: [
      "welcome-to-sanctuary-protected",
      "initial-setup-checklist",
    ],
    status: "documented",
  },
  {
    key: "dashboard",
    label: "Dashboard",
    articleSlugs: ["dashboard-overview"],
    status: "documented",
  },
  {
    key: "church-settings",
    label: "Church settings",
    articleSlugs: [
      "church-settings-overview",
      "church-contact-information",
      "selecting-a-time-zone",
      "understanding-url-names",
    ],
    status: "documented",
  },
  {
    key: "timezone.global",
    label: "Worldwide time zones",
    articleSlugs: ["selecting-a-time-zone"],
    status: "documented",
  },
  {
    key: "organization.slug",
    label: "URL Name (slug)",
    articleSlugs: ["understanding-url-names"],
    status: "documented",
  },
  {
    key: FEATURE_KEYS.MULTI_CAMPUS,
    label: "Campuses",
    articleSlugs: [
      "campuses-overview",
      "create-a-campus",
      "adding-members-to-a-campus",
      "delegating-campus-member-management",
      "why-cant-i-see-another-campus",
    ],
    status: "documented",
  },
  {
    key: "campuses.manage",
    label: "Campus member management",
    articleSlugs: [
      "adding-members-to-a-campus",
      "delegating-campus-member-management",
    ],
    status: "documented",
  },
  {
    key: "members.invite",
    label: "Invite members",
    articleSlugs: ["invite-church-members"],
    status: "documented",
  },
  {
    key: "security.overview",
    label: "Security",
    articleSlugs: [
      "security-overview",
      "church-roles-and-security-groups",
      "subscription-tier-vs-security-permission",
    ],
    status: "documented",
  },
  {
    key: "security.roles",
    label: "Church Roles",
    articleSlugs: ["church-roles-and-security-groups"],
    status: "documented",
  },
  {
    key: "security.roles.members",
    label: "Add members to a security group",
    articleSlugs: ["adding-members-to-a-security-group"],
    status: "documented",
    notes:
      "Members are added on Groups, not on the Church Roles catalog. Church Roles are templates.",
  },
  {
    key: "security.groups",
    label: "Security Groups",
    articleSlugs: [
      "church-roles-and-security-groups",
      "adding-members-to-a-security-group",
      "assigning-group-permissions",
    ],
    status: "documented",
  },
  {
    key: "security.temporary",
    label: "Temporary access",
    articleSlugs: ["temporary-access"],
    status: "documented",
  },
  {
    key: FEATURE_KEYS.TEAM_SCHEDULING,
    label: "Scheduling",
    articleSlugs: [
      "create-an-event",
      "create-a-shift",
      "assign-members-to-shifts",
    ],
    status: "documented",
  },
  {
    key: FEATURE_KEYS.INCIDENT_LOGGING,
    label: "Incidents",
    articleSlugs: ["log-a-security-incident"],
    status: "documented",
  },
  {
    key: FEATURE_KEYS.INCIDENT_PHOTOS,
    label: "Incident photos",
    articleSlugs: ["log-a-security-incident"],
    status: "partial",
    notes: "Covered in the incident logging article; no dedicated photos how-to.",
  },
  {
    key: FEATURE_KEYS.GROUP_EMAIL,
    label: "Group email",
    articleSlugs: [
      "create-a-notification-group",
      "send-a-group-email",
    ],
    status: "documented",
  },
  {
    key: FEATURE_KEYS.TRAINING_MANAGEMENT,
    label: "Training Management",
    articleSlugs: [
      "training-overview",
      "create-a-training-event",
      "recording-training-completion",
    ],
    status: "documented",
  },
  {
    key: "training.module",
    label: "Training module",
    articleSlugs: [
      "training-overview",
      "create-a-training-event",
      "recording-training-completion",
      "certifications-overview",
    ],
    status: "documented",
  },
  {
    key: "certifications",
    label: "Certifications",
    articleSlugs: ["certifications-overview"],
    status: "documented",
  },
  {
    key: FEATURE_KEYS.HARDWARE_INVENTORY,
    label: "Hardware",
    articleSlugs: ["hardware-inventory-overview"],
    status: "partial",
    notes: "Overview only; maintenance and radio/camera hardware types are not separate how-tos.",
  },
  {
    key: FEATURE_KEYS.MEDICAL_INVENTORY,
    label: "Medical supplies",
    articleSlugs: ["medical-inventory-overview"],
    status: "partial",
  },
  {
    key: FEATURE_KEYS.POLICIES,
    label: "Policies and procedures",
    articleSlugs: ["policies-and-procedures-overview"],
    status: "partial",
  },
  {
    key: FEATURE_KEYS.SAFETY_CONCERN_PROFILES,
    label: "Known Safety Concerns",
    articleSlugs: ["known-safety-concerns-overview"],
    status: "partial",
  },
  {
    key: FEATURE_KEYS.CAMERAS,
    label: "Cameras",
    articleSlugs: ["cameras-and-sensors-overview"],
    status: "partial",
  },
  {
    key: FEATURE_KEYS.SENSORS,
    label: "Sensors",
    articleSlugs: ["cameras-and-sensors-overview"],
    status: "partial",
  },
  {
    key: FEATURE_KEYS.STANDARD_ANALYTICS,
    label: "Reports and analytics",
    articleSlugs: ["reports-and-analytics-overview"],
    status: "partial",
  },
  {
    key: "subscription.plans",
    label: "Subscription plans",
    articleSlugs: [
      "subscription-plans-overview",
      "why-is-a-feature-greyed-out",
      "subscription-tier-vs-security-permission",
    ],
    status: "documented",
  },
  {
    key: "account.profile",
    label: "Account and profile",
    articleSlugs: ["account-and-profile-settings"],
    status: "documented",
  },
  {
    key: "help.center",
    label: "Help Center",
    articleSlugs: ["get-help-and-support"],
    status: "documented",
  },
] as const;

export function plansThatIncludeFeature(featureKey: FeatureKey): PlanKey[] {
  return PLAN_KEY_LIST.filter(
    (planKey) => EXPECTED_PLAN_ENTITLEMENTS[planKey]?.[featureKey] === true,
  );
}

export function planDisplayNamesForFeature(featureKey: FeatureKey): string[] {
  return plansThatIncludeFeature(featureKey).map(
    (key) => PLAN_DISPLAY_NAMES[key],
  );
}

export function helpCoverageGaps(): HelpCoverageRow[] {
  return HELP_FEATURE_COVERAGE.filter((row) => row.status === "gap");
}

export function listHelpCoverageArticleSlugs(): string[] {
  const slugs = new Set<string>();
  for (const row of HELP_FEATURE_COVERAGE) {
    for (const slug of row.articleSlugs) {
      slugs.add(slug);
    }
  }
  return [...slugs];
}

export function assertHelpCoverageCatalogIntegrity(): void {
  for (const row of HELP_FEATURE_COVERAGE) {
    if (row.articleSlugs.length === 0 && row.status !== "gap") {
      throw new Error(`Coverage row ${row.key} has no articles`);
    }
    for (const slug of row.articleSlugs) {
      if (!slugSet.has(slug)) {
        throw new Error(
          `Coverage row ${row.key} references unknown Help slug ${slug}`,
        );
      }
    }
  }

  const catalogBySlug = new Map(
    HELP_SEED_ARTICLE_CATALOG.map((item) => [item.slug, item]),
  );
  for (const slug of HELP_SEED_ARTICLE_SLUGS) {
    if (!catalogBySlug.has(slug)) {
      throw new Error(`Seed slug ${slug} missing from HELP_SEED_ARTICLE_CATALOG`);
    }
  }

  for (const [navId, featureKey] of Object.entries(NAV_FEATURE_REQUIREMENTS)) {
    if (!featureKey) continue;
    const covered = HELP_FEATURE_COVERAGE.some(
      (row) =>
        row.key === featureKey ||
        row.articleSlugs.some((slug) => {
          const item = catalogBySlug.get(
            slug as (typeof HELP_SEED_ARTICLE_SLUGS)[number],
          );
          return item?.feature_keys?.includes(featureKey);
        }),
    );
    if (!covered) {
      throw new Error(
        `Nav feature lock ${navId} (${featureKey}) has no Help coverage row or article feature_keys`,
      );
    }
  }
}
